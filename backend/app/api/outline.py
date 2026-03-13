from fastapi import APIRouter, Depends, HTTPException, status, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Any
import json

from app.core.security import get_db, get_current_user, get_redis
from app.models import User, Project, LLMConfig
from app.services.llm_service import LLMService
from app.utils.llm_config import get_llm_config

router = APIRouter(prefix="/projects", tags=["大纲生成"])

# Redis key 前缀
OUTLINE_REDIS_PREFIX = "outline:"
OUTLINE_TTL = 7 * 24 * 60 * 60  # 7天过期


def parse_tender_file(file_path: str) -> str:
    """
    解析招标文件，提取文本内容
    支持：txt, pdf, docx
    """
    import os

    if not file_path or not os.path.exists(file_path):
        return ""

    ext = os.path.splitext(file_path)[-1].lower()

    try:
        if ext == '.txt':
            with open(file_path, 'r', encoding='utf-8') as f:
                return f.read()  # 不限制长度

        elif ext == '.pdf':
            # 需要安装 pymupdf
            try:
                import fitz
                doc = fitz.open(file_path)
                text = ""
                for page in doc:
                    text += page.get_text()
                doc.close()

                # 检查是否为扫描版PDF（无文本层）
                if not text.strip():
                    return "错误：PDF文件为扫描版或无文本层，无法解析。请上传带文本层的PDF文件或使用Word格式的招标文件。"

                return text  # 不限制长度
            except ImportError:
                return "PDF解析需要安装 pymupdf 库"

        elif ext in ['.docx', '.doc']:
            # 需要安装 python-docx
            try:
                from docx import Document
                doc = Document(file_path)
                text = "\n".join([p.text for p in doc.paragraphs])
                return text  # 不限制长度
            except ImportError:
                return "Word解析需要安装 python-docx 库"

        else:
            return f"不支持的文件格式: {ext}"
    except Exception as e:
        return f"文件解析失败: {str(e)}"


@router.post("/{project_id}/outline/generate")
async def generate_outline(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """使用LLM生成大纲"""
    # 获取项目
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    if not project.tender_file_url:
        raise HTTPException(status_code=400, detail="请先上传招标文件")

    # 检查文件是否存在
    import os
    if not os.path.exists(project.tender_file_url):
        raise HTTPException(status_code=400, detail="招标文件不存在，请重新上传")

    # 解析招标文件
    tender_content = parse_tender_file(project.tender_file_url)

    if not tender_content or "解析失败" in tender_content or "不支持" in tender_content or "错误：" in tender_content:
        raise HTTPException(status_code=400, detail=f"文件解析失败: {tender_content}")

    # 更新文件解析状态和字数
    project.tender_file_word_count = len(tender_content)
    project.tender_file_status = "parsed"

    # 获取LLM配置（分析模型）
    llm_config = await get_llm_config(db, project.tenant_id, "analysis")

    # 调试日志
    import logging
    logger = logging.getLogger(__name__)
    logger.warning(f"LLM配置: {llm_config}")
    logger.warning(f"Project tenant_id: {project.tenant_id}")

    llm = LLMService(llm_config)

    # 构建提示词
    system_prompt = """你是资深投标文件撰写专家。请精读招标文件全文，重点识别：
1. 招标文件对投标文件的章节要求（"投标文件须包含..."）
2. 评分标准中的各评分项（每项对应独立章节）
3. 格式规定（页数限制、必须包含的内容）
4. 资质和业绩要求章节

基于以上分析，生成完整投标大纲：
- 大纲必须完整响应招标文件的所有要求，不遗漏强制响应项
- 返回JSON数组格式：[{"level":1,"title":"章节标题","children":[{"level":2,"title":"二级标题","children":[{"level":3,"title":"三级标题","children":[]}]}]}]
- level表示层级(1=一级标题,2=二级标题,3=三级标题)
- 至少生成到3级标题，重要章节要细化到3级
- 只返回JSON，不要其他内容"""

    user_prompt = f"""请阅读以下招标文件内容，生成符合要求的投标文件大纲：

{tender_content[:100000]}

请生成JSON格式的大纲："""

    try:
        # 调用LLM生成大纲
        response = await llm.generate(
            prompt=user_prompt,
            system_prompt=system_prompt,
            model=llm_config.get("model", "qwen-long"),
            temperature=0.3,
            max_tokens=4000
        )

        # 解析JSON响应
        response = llm.filter_thinking_content(response)

        # 尝试提取JSON
        try:
            # 查找JSON数组
            import re
            json_match = re.search(r'\[.*\]', response, re.DOTALL)
            if json_match:
                outline = json.loads(json_match.group())
            else:
                outline = json.loads(response)
        except json.JSONDecodeError:
            # 如果解析失败，使用默认大纲
            outline = get_default_outline()

        # 保存大纲到项目
        project.outline_json = json.dumps(outline, ensure_ascii=False)
        project.status = "outline_generated"
        await db.commit()

        return {
            "code": 0,
            "message": "大纲生成成功",
            "data": {
                "outline": outline,
                "word_count": len(tender_content)
            }
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        project.status = "draft"
        await db.commit()
        
        detail = str(e)
        if "API Key未配置" in detail:
            detail = "系统未配置大模型（LLM）API Key，请联系管理员在后台配置。"
            
        raise HTTPException(status_code=400 if "API Key" in detail else 500, detail=detail)


def get_default_outline():
    """获取默认大纲模板"""
    return [
        {"level": 1, "title": "第一章 技术方案", "children": [
            {"level": 2, "title": "1.1 项目理解与分析", "children": [
                {"level": 3, "title": "1.1.1 招标需求解读", "children": []},
                {"level": 3, "title": "1.1.2 项目重点难点分析", "children": []}
            ]},
            {"level": 2, "title": "1.2 总体技术思路", "children": []},
            {"level": 2, "title": "1.3 技术实施方案", "children": []}
        ]},
        {"level": 1, "title": "第二章 项目管理方案", "children": [
            {"level": 2, "title": "2.1 项目组织架构", "children": []},
            {"level": 2, "title": "2.2 进度计划安排", "children": []},
            {"level": 2, "title": "2.3 质量管理措施", "children": []},
            {"level": 2, "title": "2.4 安全管理措施", "children": []}
        ]},
        {"level": 1, "title": "第三章 商务方案", "children": [
            {"level": 2, "title": "3.1 报价说明", "children": []},
            {"level": 2, "title": "3.2 服务承诺", "children": []},
            {"level": 2, "title": "3.3 售后服务方案", "children": []}
        ]},
        {"level": 1, "title": "第四章 资质与业绩", "children": [
            {"level": 2, "title": "4.1 企业资质", "children": []},
            {"level": 2, "title": "4.2 类似项目业绩", "children": []},
            {"level": 2, "title": "4.3 项目团队介绍", "children": []}
        ]}
    ]


@router.put("/{project_id}/outline")
async def save_outline(
    project_id: int,
    outline_json: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """保存大纲到数据库（手动保存）"""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    # 验证JSON格式
    try:
        outline = json.loads(outline_json)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="大纲格式无效")

    # 保存到 MySQL
    project.outline_json = outline_json
    project.status = "outline_generated"
    await db.commit()

    # 同时保存到 Redis 作为缓存
    redis = await get_redis()
    redis_key = f"{OUTLINE_REDIS_PREFIX}{project_id}"
    await redis.setex(redis_key, OUTLINE_TTL, outline_json)

    return {
        "code": 0,
        "message": "大纲保存成功",
        "data": None
    }


@router.get("/{project_id}/outline")
async def get_outline(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """获取大纲（优先从 Redis，fallback 到 MySQL）"""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    # 优先从 Redis 获取
    redis = await get_redis()
    redis_key = f"{OUTLINE_REDIS_PREFIX}{project_id}"
    cached_outline = await redis.get(redis_key)

    if cached_outline:
        return {
            "code": 0,
            "message": "success",
            "data": {
                "outline": json.loads(cached_outline),
                "source": "redis"
            }
        }

    # 从 MySQL 获取
    if project.outline_json:
        return {
            "code": 0,
            "message": "success",
            "data": {
                "outline": json.loads(project.outline_json),
                "source": "mysql"
            }
        }

    return {
        "code": 0,
        "message": "success",
        "data": {
            "outline": None,
            "source": "none"
        }
    }


@router.put("/{project_id}/outline/redis")
async def save_outline_to_redis(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    outline_data: Any = Body(...)
):
    """临时保存大纲到 Redis（自动保存用）"""
    # 转换为 JSON 字符串
    if isinstance(outline_data, str):
        outline_json = outline_data
    else:
        outline_json = json.dumps(outline_data, ensure_ascii=False)
        
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    # 验证JSON格式
    try:
        outline = json.loads(outline_json)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="大纲格式无效")

    # 保存到 Redis
    redis = await get_redis()
    redis_key = f"{OUTLINE_REDIS_PREFIX}{project_id}"
    await redis.setex(redis_key, OUTLINE_TTL, outline_json)

    return {
        "code": 0,
        "message": "大纲已临时保存",
        "data": None
    }


@router.post("/{project_id}/outline/save-to-db")
async def save_outline_to_db(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """将 Redis 中的大纲保存到数据库（手动保存）"""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    # 从 Redis 获取
    redis = await get_redis()
    redis_key = f"{OUTLINE_REDIS_PREFIX}{project_id}"
    outline_json = await redis.get(redis_key)

    if not outline_json:
        raise HTTPException(status_code=400, detail="没有找到临时保存的大纲，请先生成大纲")

    # 保存到 MySQL
    project.outline_json = outline_json
    project.status = "outline_generated"
    await db.commit()

    # 可选：保留 Redis 缓存或清除
    # await redis.delete(redis_key)

    return {
        "code": 0,
        "message": "大纲保存成功",
        "data": None
    }
