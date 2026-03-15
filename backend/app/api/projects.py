from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional, List
import os
import uuid
import aiofiles

from app.core.security import get_db, get_current_user
from app.core.config import settings
from app.models import User, Project, Subscription, GenerationTask, TaskCheckpoint
from app.schemas import ProjectCreate, ProjectUpdate, ProjectResponse
from datetime import datetime
import logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects", tags=["项目管理"])


@router.get("/debug-all")
async def debug_projects_all(
    db: AsyncSession = Depends(get_db)
):
    """调试端点 - 检查数据库"""
    from sqlalchemy import text
    try:
        # 用原生 SQL 直接查询用户
        result = await db.execute(text("SELECT id, username, tenant_id FROM users LIMIT 5"))
        users = result.fetchall()

        # 检查实际有多少条记录
        count_result = await db.execute(text("SELECT COUNT(*) FROM users"))
        total = count_result.scalar()

        return {
            "users": [dict(row._mapping) for row in users],
            "total": total
        }
    except Exception as e:
        import traceback
        return {"error": str(e), "trace": traceback.format_exc()}


@router.get("", response_model=List[ProjectResponse])
async def get_projects(
    skip: int = 0,
    limit: int = 20,
    status_filter: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """获取项目列表"""
    logger.warning(f"[P1] 开始获取项目列表 - 用户: {current_user.id}")
    try:
        # 使用原生SQL直接查询
        from sqlalchemy import text

        # 根据用户角色构建不同的查询
        if current_user.role == "user":
            sql = text("""
                SELECT * FROM projects
                WHERE user_id = :user_id
                ORDER BY updated_at DESC
                LIMIT :limit OFFSET :skip
            """)
            result = await db.execute(sql, {"user_id": current_user.id, "limit": limit, "skip": skip})
        elif current_user.tenant_id:
            sql = text("""
                SELECT * FROM projects
                WHERE tenant_id = :tenant_id
                ORDER BY updated_at DESC
                LIMIT :limit OFFSET :skip
            """)
            result = await db.execute(sql, {"tenant_id": current_user.tenant_id, "limit": limit, "skip": skip})
        else:
            sql = text("SELECT * FROM projects ORDER BY updated_at DESC LIMIT :limit OFFSET :skip")
            result = await db.execute(sql, {"limit": limit, "skip": skip})

        rows = result.fetchall()
        logger.warning(f"[P2] 找到 {len(rows)} 个项目")

        # 将行转换为Project对象
        projects = []
        for row in rows:
            # 创建Project对象
            project = Project(
                id=row.id,
                tenant_id=row.tenant_id,
                user_id=row.user_id,
                title=row.title,
                tender_file_url=row.tender_file_url,
                tender_file_name=row.tender_file_name,
                tender_file_word_count=row.tender_file_word_count,
                tender_file_status=row.tender_file_status,
                outline_json=row.outline_json,
                template=row.template if hasattr(row, 'template') else 'government',
                target_pages=row.target_pages,
                words_per_page=row.words_per_page,
                status=row.status,
                created_at=row.created_at,
                updated_at=row.updated_at
            )
            projects.append(project)

        return [ProjectResponse.model_validate(p) for p in projects]
    except Exception as e:
        logger.error(f"获取项目列表失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"获取项目列表失败: {str(e)}")


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """获取项目详情"""
    result = await db.execute(select(Project).where(Project.id == project_id).limit(1))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    # 权限检查
    if current_user.role == "user" and project.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权限")

    if current_user.role == "tenant_admin" and project.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=403, detail="无权限")

    return ProjectResponse.model_validate(project)


@router.post("", response_model=ProjectResponse)
async def create_project(
    project_data: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """创建新项目"""
    # 检查订阅是否有效
    if current_user.tenant_id:
        result = await db.execute(
            select(Subscription).where(
                Subscription.tenant_id == current_user.tenant_id,
                Subscription.status == "active",
                Subscription.expire_at > datetime.utcnow()
            )
        )
        subscription = result.scalar_one_or_none()
        if not subscription:
            raise HTTPException(status_code=402, detail="订阅已过期，请联系管理员续费")

        if subscription.period_used_words >= subscription.period_word_limit:
            raise HTTPException(status_code=402, detail="字数额度已用完，请联系管理员充值")

    project = Project(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        title=project_data.title,
        status="draft"
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)

    return ProjectResponse.model_validate(project)


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: int,
    project_data: ProjectUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """更新项目"""
    result = await db.execute(select(Project).where(Project.id == project_id).limit(1))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    # 权限检查
    if current_user.role == "user" and project.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权限")

    if current_data := project_data.title:
        project.title = project_data.title
    if project_data.outline_json is not None:
        project.outline_json = project_data.outline_json
    if project_data.template is not None:
        project.template = project_data.template
    if project_data.template_styles is not None:
        project.template_styles = project_data.template_styles
    if project_data.target_pages:
        project.target_pages = project_data.target_pages
    if project_data.words_per_page:
        project.words_per_page = project_data.words_per_page
    if project_data.status:
        project.status = project_data.status

    await db.commit()
    await db.refresh(project)

    return ProjectResponse.model_validate(project)


@router.post("/{project_id}/upload")
async def upload_tender_file(
    project_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """上传招标文件"""
    result = await db.execute(select(Project).where(Project.id == project_id).limit(1))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    # 权限检查
    if current_user.role == "user" and project.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权限")

    # 检查文件类型
    file_ext = file.filename.split(".")[-1].lower() if "." in file.filename else ""
    if file_ext not in settings.ALLOWED_FILE_TYPES:
        raise HTTPException(status_code=400, detail=f"不支持的文件类型，仅支持: {', '.join(settings.ALLOWED_FILE_TYPES)}")

    # 生成唯一文件名
    unique_filename = f"{uuid.uuid4()}_{file.filename}"
    file_path = os.path.join(settings.UPLOAD_DIR, unique_filename)

    # 确保目录存在
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

    # 保存文件
    async with aiofiles.open(file_path, 'wb') as f:
        content = await file.read()
        await f.write(content)

    # 更新项目
    project.tender_file_url = file_path
    project.tender_file_name = file.filename
    project.tender_file_status = "uploaded"

    # 解析文件并计算字数
    import logging
    logger = logging.getLogger(__name__)
    logger.warning(f"开始解析文件: {file_path}")
    logger.warning(f"文件是否存在: {os.path.exists(file_path) if file_path else 'None'}")
    try:
        from app.api.outline import parse_tender_file
        tender_content = parse_tender_file(file_path)
        logger.warning(f"解析文件结果: 字数={len(tender_content) if tender_content else 0}, 内容前100字={tender_content[:100] if tender_content else '空'}")
        # 检查是否为错误消息（更精确的检查）
        is_error = not tender_content or tender_content.startswith("错误：") or tender_content.startswith("不支持") or tender_content.startswith("文件解析失败") or tender_content.startswith("PDF解析") or tender_content.startswith("Word解析")
        if tender_content and not is_error:
            project.tender_file_word_count = len(tender_content)
            project.tender_file_status = "parsed"
            logger.warning(f"文件解析成功，字数: {project.tender_file_word_count}")
        else:
            project.tender_file_word_count = 0
            logger.warning(f"文件解析失败或包含错误信息: {tender_content[:200] if tender_content else '空'}")
    except Exception as e:
        import traceback
        logger.warning(f"文件解析异常: {str(e)}")
        logger.warning(f"异常堆栈: {traceback.format_exc()}")
        project.tender_file_word_count = 0

    await db.commit()
    await db.refresh(project)

    return {
        "code": 0,
        "message": "文件上传成功",
        "data": {
            "file_name": file.filename,
            "file_path": file_path
        }
    }


@router.delete("/{project_id}/file")
async def delete_tender_file(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """删除招标文件"""
    result = await db.execute(select(Project).where(Project.id == project_id).limit(1))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    # 权限检查
    if current_user.role == "user" and project.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权限")

    # 删除文件
    if project.tender_file_url and os.path.exists(project.tender_file_url):
        os.remove(project.tender_file_url)

    # 更新项目状态
    project.tender_file_url = None
    project.tender_file_name = None
    project.tender_file_word_count = 0
    project.tender_file_status = "pending"
    project.outline_json = None
    project.status = "draft"  # 大纲已生成时删除文件需清空大纲

    await db.commit()

    return {"code": 0, "message": "文件已删除", "data": None}


@router.delete("/{project_id}")
async def delete_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """删除项目"""
    result = await db.execute(select(Project).where(Project.id == project_id).limit(1))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    # 权限检查
    if current_user.role == "user" and project.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权限")

    if current_user.role == "tenant_admin" and project.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=403, detail="无权限")

    # 删除招标文件（如果存在）
    if project.tender_file_url and os.path.exists(project.tender_file_url):
        os.remove(project.tender_file_url)

    # 删除项目（关联的任务、生成的内容等通过数据库级联删除或手动删除）
    await db.delete(project)
    await db.commit()

    return {"code": 0, "message": "项目已删除", "data": None}


@router.post("/{project_id}/reset")
async def reset_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """重置项目，重新开始生成流程"""
    result = await db.execute(select(Project).where(Project.id == project_id).limit(1))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    # 权限检查
    if current_user.role == "user" and project.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权限")

    if current_user.role == "tenant_admin" and project.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=403, detail="无权限")

    # 删除该项目关联的所有生成任务
    tasks_result = await db.execute(
        select(GenerationTask).where(GenerationTask.project_id == project_id)
    )
    tasks = tasks_result.scalars().all()
    for task in tasks:
        await db.delete(task)

    # 重置项目状态为 draft，保留招标文件
    project.status = "draft"
    project.outline_json = None
    project.target_pages = 50
    project.words_per_page = 700

    await db.commit()
    await db.refresh(project)

    return {"code": 0, "message": "项目已重置", "data": ProjectResponse.model_validate(project)}


# ============== 文档内容管理 API ==============

@router.get("/{project_id}/content")
async def get_project_content(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """获取项目的生成内容"""
    # 获取项目
    result = await db.execute(select(Project).where(Project.id == project_id).limit(1))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    # 权限检查
    if current_user.role == "user" and project.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权限")

    if current_user.role == "tenant_admin" and project.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=403, detail="无权限")

    # 获取该项目已完成的任务
    result = await db.execute(
        select(GenerationTask).where(
            GenerationTask.project_id == project_id,
            GenerationTask.status == "completed"
        ).order_by(GenerationTask.id.desc()).limit(1)
    )
    task = result.scalar_one_or_none()

    if not task:
        return {"code": 0, "data": {"task": None, "chapters": []}}

    # 获取所有章节内容
    result = await db.execute(
        select(TaskCheckpoint).where(
            TaskCheckpoint.task_id == task.id
        ).order_by(TaskCheckpoint.chapter_index)
    )
    checkpoints = result.scalars().all()

    chapters = []
    for cp in checkpoints:
        chapters.append({
            "chapter_index": cp.chapter_index,
            "chapter_title": cp.chapter_title,
            "content": cp.content,
            "word_count": cp.word_count
        })

    return {
        "code": 0,
        "data": {
            "task_id": task.id,
            "task_status": task.status,
            "chapters": chapters
        }
    }


@router.put("/{project_id}/content")
async def save_project_content(
    project_id: int,
    chapter_index: int,
    content: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """保存编辑后的章节内容"""
    # 获取项目
    result = await db.execute(select(Project).where(Project.id == project_id).limit(1))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    # 权限检查
    if current_user.role == "user" and project.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权限")

    if current_user.role == "tenant_admin" and project.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=403, detail="无权限")

    # 获取该项目的任务
    result = await db.execute(
        select(GenerationTask).where(
            GenerationTask.project_id == project_id,
            GenerationTask.status == "completed"
        ).order_by(GenerationTask.id.desc()).limit(1)
    )
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(status_code=404, detail="没有已完成的任务")

    # 查找并更新章节内容
    result = await db.execute(
        select(TaskCheckpoint).where(
            TaskCheckpoint.task_id == task.id,
            TaskCheckpoint.chapter_index == chapter_index
        )
    )
    checkpoint = result.scalar_one_or_none()

    if not checkpoint:
        raise HTTPException(status_code=404, detail="章节不存在")

    # 更新内容
    checkpoint.content = content
    checkpoint.word_count = len(content)

    await db.commit()
    await db.refresh(checkpoint)

    return {"code": 0, "message": "内容已保存", "data": {"word_count": checkpoint.word_count}}
