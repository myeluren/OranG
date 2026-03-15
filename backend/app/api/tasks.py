from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional, List, Dict, Any
from datetime import datetime
import logging
import json

logger = logging.getLogger(__name__)

from app.core.security import get_db, get_current_user
from app.models import User, Project, GenerationTask, TaskCheckpoint, Subscription, WordTransaction
from app.schemas import TaskResponse
from app.services.content_generator import ContentGenerator
from app.services.llm_service import LLMService
from app.utils.llm_config import get_llm_config
from app.api.outline import parse_tender_file

router = APIRouter(prefix="/tasks", tags=["任务管理"])


@router.post("", response_model=Dict[str, Any])
async def create_generation_task(
    project_id: int = Query(..., description="项目ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> Dict[str, Any]:
    """创建内容生成任务"""
    logger.warning(f"=== create_generation_task 被调用 === project_id={project_id}, user={current_user.id}")

    # 获取项目
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    # 检查项目状态
    current_status = project.status.value if hasattr(project.status, 'value') else project.status
    logger.warning(f"项目状态: {current_status}")
    if current_status not in ["outline_generated", "format_set"]:
        raise HTTPException(status_code=400, detail=f"项目状态不正确，当前状态：{current_status}，需要：outline_generated 或 format_set")

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

    logger.warning(f"订阅: {subscription}")

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

    logger.warning(f"大纲JSON: {project.outline_json[:200]}...")

    # 从大纲中提取章节
    chapters = []

    def extract_chapters(node):
        logger.warning(f"处理节点: {node}")
        if node.get("level") in [2, 3]:
            chapters.append(node.get("title"))
            logger.warning(f"添加章节: {node.get('title')}")
        if node.get("children"):
            for child in node["children"]:
                extract_chapters(child)

    for item in outline:
        extract_chapters(item)

    logger.warning(f"找到 {len(chapters)} 个章节: {chapters}")

    if not chapters:
        raise HTTPException(status_code=400, detail="大纲没有可生成的章节")

    # ====== 调试：创建任务前再次确认 ======
    logger.warning(f"准备创建任务，chapters 数量: {len(chapters)}")

    # 计算总字数
    total_words = project.target_pages * project.words_per_page
    estimated_words = total_words

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

    # 创建任务 - 使用实际提取的章节数量
    task = GenerationTask(
        project_id=project_id,
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        status="pending",
        total_chapters=len(chapters),  # 使用实际章节数量
        completed_chapters=0,
        total_words_generated=0
    )
    db.add(task)

    # 更新项目状态
    project.status = "generating"
    await db.commit()
    await db.refresh(task)

    logger.warning(f"刷新后任务: id={task.id}, total_chapters={task.total_chapters}")

    logger.warning(f"准备开始执行生成任务...")

    # 立即开始执行（使用 try-except 包装以便捕获错误）
    try:
        await execute_generation_task(task.id, db)
    except Exception as e:
        logger.error(f"执行生成任务时出错: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        task.status = "failed"
        task.error_message = f"执行出错: {str(e)}"
        await db.commit()

    # 构建返回数据
    response_data = {
        "code": 0,
        "message": "任务创建成功",
        "data": {
            "task_id": task.id,
            "task_status": task.status,
            "error_message": task.error_message,
            "total_chapters": task.total_chapters,
            "estimated_words": estimated_words
        }
    }

    logger.warning(f"返回数据: {response_data}")

    # 如果任务已经失败，返回失败信息
    if task.status == "failed":
        response_data["code"] = 500
        response_data["message"] = "任务执行失败"
        response_data["detail"] = task.error_message or "未知错误"

    return response_data


async def execute_generation_task(task_id: int, db: AsyncSession):
    """执行生成任务"""
    import traceback
    logger.warning(f"=== execute_generation_task 开始执行 ===")
    logger.warning(f"task_id: {task_id}")

    # 获取任务
    result = await db.execute(select(GenerationTask).where(GenerationTask.id == task_id))
    task = result.scalar_one_or_none()

    if not task:
        logger.warning("任务不存在")
        return

    logger.warning(f"任务状态: {task.status}")

    # 获取项目
    result = await db.execute(select(Project).where(Project.id == task.project_id))
    project = result.scalar_one_or_none()

    if not project:
        logger.warning("项目不存在")
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
    try:
        tender_content = parse_tender_file(project.tender_file_url)
    except Exception as e:
        logger.error(f"解析招标文件失败: {str(e)}")
        task.status = "failed"
        task.error_message = f"解析招标文件失败: {str(e)}"
        await db.commit()
        return

    # 检查招标文件是否解析成功
    if not tender_content or tender_content.startswith("错误") or tender_content.startswith("不支持") or tender_content.startswith("文件解析失败"):
        logger.error(f"招标文件解析失败: {tender_content}")
        task.status = "failed"
        task.error_message = f"招标文件解析失败: {tender_content or '文件为空或不存在'}"
        await db.commit()
        return

    # 获取LLM配置
    try:
        llm_config = await get_llm_config(db, project.tenant_id, "generation")
    except Exception as e:
        logger.error(f"获取LLM配置失败: {str(e)}")
        task.status = "failed"
        task.error_message = f"获取LLM配置失败: {str(e)}"
        await db.commit()
        return

    if not llm_config.get("api_key"):
        task.status = "failed"
        task.error_message = "LLM API Key未配置，请在管理后台配置"
        await db.commit()
        return

    llm = LLMService(llm_config)

    # 解析大纲
    try:
        outline = json.loads(project.outline_json)
    except Exception as e:
        logger.error(f"解析大纲JSON失败: {str(e)}")
        task.status = "failed"
        task.error_message = f"大纲JSON格式错误: {str(e)}"
        await db.commit()
        return

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

    # 检查是否有章节
    if not chapters:
        task.status = "failed"
        task.error_message = "大纲中没有可生成的章节，请检查大纲格式"
        await db.commit()
        return

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
            task.status = "failed"
            task.error_message = f"章节 '{chapter['title']}' 生成失败: {str(e)}"
            await db.commit()
            # 跳出循环，不再继续生成
            break

    # 完成任务
    if task.status == "running":
        task.status = "completed"
        task.completed_at = datetime.utcnow()
        project.status = "completed"
        await db.commit()


@router.get("", response_model=List[TaskResponse])
async def get_tasks(
    skip: int = 0,
    limit: int = 20,
    status_filter: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """获取任务列表"""
    query = select(GenerationTask)

    # 权限过滤
    if current_user.role == "user":
        query = query.where(GenerationTask.user_id == current_user.id)
    elif current_user.tenant_id:
        query = query.where(GenerationTask.tenant_id == current_user.tenant_id)

    if status_filter:
        query = query.where(GenerationTask.status == status_filter)

    query = query.offset(skip).limit(limit).order_by(GenerationTask.created_at.desc())
    result = await db.execute(query)
    tasks = result.scalars().all()

    return [TaskResponse.model_validate(t) for t in tasks]


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """获取任务详情"""
    result = await db.execute(select(GenerationTask).where(GenerationTask.id == task_id))
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    # 权限检查
    if current_user.role == "user" and task.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权限")

    if current_user.role == "tenant_admin" and task.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=403, detail="无权限")

    return TaskResponse.model_validate(task)


@router.post("/{task_id}/pause")
async def pause_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """暂停任务"""
    result = await db.execute(select(GenerationTask).where(GenerationTask.id == task_id))
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    if task.status != "running":
        raise HTTPException(status_code=400, detail="任务不在运行中")

    # 权限检查
    if current_user.role == "user" and task.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权限")

    task.status = "paused_manual"
    await db.commit()

    return {"code": 0, "message": "任务已暂停", "data": None}


@router.post("/{task_id}/resume")
async def resume_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """恢复任务（手动暂停恢复）"""
    result = await db.execute(select(GenerationTask).where(GenerationTask.id == task_id))
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    if task.status != "paused_manual":
        raise HTTPException(status_code=400, detail="任务不是手动暂停状态")

    # 权限检查
    if current_user.role == "user" and task.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权限")

    task.status = "running"
    await db.commit()

    return {"code": 0, "message": "任务已恢复", "data": None}


@router.post("/{task_id}/cancel")
async def cancel_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """取消任务"""
    result = await db.execute(select(GenerationTask).where(GenerationTask.id == task_id))
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    if task.status in ["completed", "cancelled", "failed"]:
        raise HTTPException(status_code=400, detail="任务无法取消")

    # 权限检查
    if current_user.role == "user" and task.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权限")

    # 计算需要扣除的字数
    deduct_words = task.total_words_generated

    # 扣除已消耗的字数到订阅额度中
    if deduct_words > 0:
        sub_result = await db.execute(
            select(Subscription).where(
                Subscription.tenant_id == task.tenant_id,
                Subscription.status == "active"
            )
        )
        subscription = sub_result.scalar_one_or_none()
        if subscription:
            # 增加已使用字数（相当于扣除）
            subscription.period_used_words = subscription.period_used_words + deduct_words

            # 记录字数流水
            transaction = WordTransaction(
                tenant_id=task.tenant_id,
                subscription_id=subscription.id,
                user_id=current_user.id,
                task_id=task.id,
                type="deduct",
                amount=deduct_words,
                balance_after=subscription.period_used_words,
                remark=f"任务取消，扣除已生成字数 {deduct_words} 字"
            )
            db.add(transaction)

    task.status = "cancelled"
    task.completed_at = datetime.utcnow()

    project_result = await db.execute(select(Project).where(Project.id == task.project_id))
    project = project_result.scalar_one_or_none()
    if project and project.status == "generating":
        project.status = "format_set"
        project.updated_at = datetime.utcnow()

    await db.commit()

    return {"code": 0, "message": f"任务已取消，已扣除 {deduct_words} 字", "data": {"deducted_words": deduct_words}}


@router.post("/{task_id}/regenerate")
async def regenerate_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """额度耗尽后重新生成（含字数回滚）"""
    result = await db.execute(select(GenerationTask).where(GenerationTask.id == task_id))
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    if task.status != "paused_quota":
        raise HTTPException(status_code=400, detail="任务不是额度耗尽状态")

    # 权限检查
    if current_user.role == "user" and task.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权限")

    # 开启事务进行回滚
    rollback_amount = 0
    try:
        # 1. 回滚字数到订阅
        result = await db.execute(
            select(Subscription).where(
                Subscription.tenant_id == task.tenant_id,
                Subscription.status == "active"
            )
        )
        subscription = result.scalar_one_or_none()
        if subscription:
            # 计算回滚字数（已消耗的字数）
            rollback_amount = task.total_words_generated
            subscription.period_used_words = max(0, subscription.period_used_words - rollback_amount)

            # 记录字数流水
            transaction = WordTransaction(
                tenant_id=task.tenant_id,
                subscription_id=subscription.id,
                user_id=current_user.id,
                task_id=task.id,
                type="rollback",
                amount=rollback_amount,
                balance_after=subscription.period_used_words,
                remark="任务重新生成，字数回滚"
            )
            db.add(transaction)

        # 2. 清空所有Checkpoint
        await db.execute(
            TaskCheckpoint.__table__.delete().where(TaskCheckpoint.task_id == task_id)
        )

        # 3. 重置任务状态
        task.status = "pending"
        task.completed_chapters = 0
        task.total_words_generated = 0
        task.rollback_words = rollback_amount

        await db.commit()

        return {"code": 0, "message": "字数已回滚，任务已重置", "data": None}

    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"回滚失败: {str(e)}")


@router.post("/{task_id}/retry")
async def retry_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """重试失败任务"""
    result = await db.execute(select(GenerationTask).where(GenerationTask.id == task_id))
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    if task.status != "failed":
        raise HTTPException(status_code=400, detail="任务不是失败状态")

    # 权限检查
    if current_user.role == "user" and task.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权限")

    # 重置任务
    task.status = "pending"
    task.error_message = None
    task.completed_chapters = 0
    task.total_words_generated = 0
    await db.commit()

    return {"code": 0, "message": "任务已重置，将重新执行", "data": None}


@router.get("/{task_id}/checkpoints")
async def get_task_checkpoints(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """获取任务的章节检查点"""
    result = await db.execute(
        select(TaskCheckpoint).where(TaskCheckpoint.task_id == task_id).order_by(TaskCheckpoint.chapter_index)
    )
    checkpoints = result.scalars().all()

    return {
        "code": 0,
        "data": [
            {
                "chapter_index": cp.chapter_index,
                "chapter_title": cp.chapter_title,
                "word_count": cp.word_count,
                "content": cp.content,
                "generated_at": cp.generated_at
            }
            for cp in checkpoints
        ]
    }
