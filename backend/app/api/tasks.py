from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional, List
from datetime import datetime

from app.core.security import get_db, get_current_user
from app.models import User, Project, GenerationTask, TaskCheckpoint, Subscription, WordTransaction
from app.schemas import TaskResponse

router = APIRouter(prefix="/tasks", tags=["任务管理"])


@router.post("", response_model=TaskResponse)
async def create_task(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """创建内容生成任务"""
    # 查询项目
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    # 检查项目状态
    if project.status != "format_set":
        raise HTTPException(status_code=400, detail="项目状态不正确")

    # 检查订阅额度
    sub_result = await db.execute(
        select(Subscription).where(
            Subscription.tenant_id == project.tenant_id,
            Subscription.status == "active"
        )
    )
    subscription = sub_result.scalar_one_or_none()

    if not subscription or subscription.period_used_words >= subscription.period_word_limit:
        raise HTTPException(status_code=400, detail="字数额度不足")

    # 创建任务
    task = GenerationTask(
        project_id=project.id,
        tenant_id=project.tenant_id,
        user_id=current_user.id,
        status="pending",
        total_chapters=0,
        completed_chapters=0,
        total_words_generated=0
    )
    db.add(task)

    # 更新项目状态为生成中
    project.status = "generating"
    project.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(task)

    return TaskResponse.model_validate(task)


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
