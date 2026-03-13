from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime

from app.core.security import get_db, get_current_user
from app.models import User, Project, GenerationTask, Subscription, WordTransaction, TaskCheckpoint
from app.services.content_generator import ContentGenerator
from app.services.llm_service import LLMService
from app.utils.llm_config import get_llm_config
from app.api.outline import parse_tender_file

router = APIRouter(prefix="/tasks", tags=["内容生成"])


@router.post("")
async def create_task(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """创建内容生成任务"""
    # 获取项目
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    # 检查项目状态
    if project.status not in ["outline_generated", "format_set"]:
        raise HTTPException(status_code=400, detail="项目状态不正确，请先完成大纲和格式设置")

    if not project.outline_json:
        raise HTTPException(status_code=400, detail="项目没有大纲")

    # 检查订阅额度
    result = await db.execute(
        select(Subscription).where(
            Subscription.tenant_id == current_user.tenant_id,
            Subscription.status == "active",
            Subscription.expire_at > datetime.utcnow()
        )
    )
    subscription = result.scalar_one_or_none()

    if not subscription:
        raise HTTPException(status_code=402, detail="无有效订阅")

    if subscription.period_used_words >= subscription.period_word_limit:
        raise HTTPException(status_code=402, detail="字数额度已用完")

    # 解析大纲获取章节数
    import json
    try:
        outline = json.loads(project.outline_json)
    except:
        raise HTTPException(status_code=400, detail="大纲格式错误")

    chapters = []
    def extract_chapters(node):
        if node.get("level") in [2, 3]:
            chapters.append(node.get("title"))
        if node.get("children"):
            for child in node["children"]:
                extract_chapters(child)

    for item in outline:
        extract_chapters(item)

    if not chapters:
        raise HTTPException(status_code=400, detail="大纲没有可生成的章节")

    # 计算总字数
    total_words = project.target_pages * project.words_per_page
    estimated_words = total_words  # 估算

    # 检查额度是否足够
    remaining = subscription.period_word_limit - subscription.period_used_words
    if estimated_words > remaining:
        raise HTTPException(
            status_code=402,
            detail=f"预估需要约{estimated_words}字，当前剩余{remaining}字，额度不足"
        )

    # 检查LLM配置
    llm_config = await get_llm_config(db, current_user.tenant_id, "generation")
    if not llm_config.get("api_key"):
        raise HTTPException(status_code=400, detail="系统未配置大模型（LLM）API Key，请联系管理员在后台配置。")

    # 创建任务
    task = GenerationTask(
        project_id=project_id,
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        status="pending",
        total_chapters=len(chapters),
        completed_chapters=0,
        total_words_generated=0
    )
    db.add(task)

    # 更新项目状态
    project.status = "generating"
    await db.commit()
    await db.refresh(task)

    # 立即开始执行（同步方式，适合小任务）
    # 生产环境应该使用Celery异步任务
    await execute_generation_task(task.id, db)

    return {
        "code": 0,
        "message": "任务创建成功",
        "data": {
            "task_id": task.id,
            "total_chapters": len(chapters),
            "estimated_words": estimated_words
        }
    }


async def execute_generation_task(task_id: int, db: AsyncSession):
    """执行生成任务（简化版，同步执行）"""

    # 获取任务
    result = await db.execute(select(GenerationTask).where(GenerationTask.id == task_id))
    task = result.scalar_one_or_none()

    if not task:
        return

    # 获取项目
    result = await db.execute(select(Project).where(Project.id == task.project_id))
    project = result.scalar_one_or_none()

    if not project:
        task.status = "failed"
        task.error_message = "项目不存在"
        await db.commit()
        return

    # 获取订阅
    result = await db.execute(
        select(Subscription).where(
            Subscription.tenant_id == task.tenant_id,
            Subscription.status == "active"
        )
    )
    subscription = result.scalar_one_or_none()

    # 解析招标文件
    tender_content = parse_tender_file(project.tender_file_url)

    # 获取LLM配置
    llm_config = await get_llm_config(db, project.tenant_id, "generation")

    if not llm_config.get("api_key"):
        task.status = "failed"
        task.error_message = "LLM API Key未配置"
        await db.commit()
        return

    llm = LLMService(llm_config)

    # 解析大纲
    import json
    outline = json.loads(project.outline_json)

    chapters = []
    def extract_chapters(node, parent=""):
        if node.get("level") == 1:
            parent = node.get("title", "")
        if node.get("level") in [2, 3]:
            chapters.append({
                "title": node.get("title"),
                "level": node.get("level"),
                "parent": parent
            })
        if node.get("children"):
            for child in node["children"]:
                extract_chapters(child, parent)

    for item in outline:
        extract_chapters(item)

    # 计算每章字数
    total_words = project.target_pages * project.words_per_page
    words_per_chapter = total_words // len(chapters) if chapters else 1000

    # 创建生成器
    generator = ContentGenerator(llm, {})

    task.status = "running"
    task.started_at = datetime.utcnow()
    await db.commit()

    # 逐章生成
    for i, chapter in enumerate(chapters):
        latest_result = await db.execute(select(GenerationTask).where(GenerationTask.id == task.id))
        latest_task = latest_result.scalar_one_or_none()
        if not latest_task:
            return
        task = latest_task

        if task.status == "cancelled":
            if project.status == "generating":
                project.status = "format_set"
                project.updated_at = datetime.utcnow()
                await db.commit()
            break

        try:
            # 生成章节内容
            content = await generator.generate_chapter(
                chapter=chapter,
                tender_content=tender_content[:20000],
                target_words=words_per_chapter,
                format_config={}
            )

            word_count = len(content)

            # 保存Checkpoint
            checkpoint = TaskCheckpoint(
                task_id=task.id,
                chapter_index=i,
                chapter_title=chapter["title"],
                content=content,
                word_count=word_count
            )
            db.add(checkpoint)

            # 更新统计
            task.completed_chapters += 1
            task.total_words_generated += word_count

            # 扣减字数
            if subscription:
                subscription.period_used_words += word_count

                # 记录流水
                transaction = WordTransaction(
                    tenant_id=task.tenant_id,
                    subscription_id=subscription.id,
                    user_id=task.user_id,
                    task_id=task.id,
                    type="consume",
                    amount=word_count,
                    balance_after=subscription.period_word_limit - subscription.period_used_words,
                    remark=f"生成章节: {chapter['title']}"
                )
                db.add(transaction)

            await db.commit()

        except Exception as e:
            task.error_message = f"章节 '{chapter['title']}' 生成失败: {str(e)}"
            await db.commit()
            # 可以添加重试逻辑

    # 完成任务
    if task.status == "running":
        task.status = "completed"
        task.completed_at = datetime.utcnow()
        project.status = "completed"
        await db.commit()
