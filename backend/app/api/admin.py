from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timedelta
from typing import Optional

from app.core.security import get_db, get_current_user, require_super_admin
from app.models import User, Tenant, GenerationTask, Subscription
from app.schemas import StatsResponse, TenantStats

router = APIRouter(prefix="/admin", tags=["管理后台"])


@router.get("/stats", response_model=StatsResponse)
async def get_global_stats(
    days: int = 7,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db)
):
    """获取全局数据统计"""
    # 租户总数
    tenant_count = await db.scalar(select(func.count(Tenant.id)))

    # 活跃用户数（最近days天有活动的用户）
    active_users = await db.scalar(
        select(func.count(func.distinct(GenerationTask.user_id))).where(
            GenerationTask.created_at >= datetime.utcnow() - timedelta(days=days)
        )
    ) or 0

    # 累计生成字数
    total_words = await db.scalar(
        select(func.sum(GenerationTask.total_words_generated))
    ) or 0

    # 任务成功率
    total_tasks = await db.scalar(
        select(func.count(GenerationTask.id)).where(
            GenerationTask.status.in_(["completed", "failed", "paused_quota"])
        )
    ) or 0

    success_tasks = await db.scalar(
        select(func.count(GenerationTask.id)).where(
            GenerationTask.status == "completed"
        )
    ) or 0

    success_rate = (success_tasks / total_tasks * 100) if total_tasks > 0 else 0

    data = StatsResponse(
        total_tenants=tenant_count or 0,
        active_users=active_users,
        total_words_generated=int(total_words),
        success_rate=round(success_rate, 2)
    )

    return data


@router.get("/stats/tenants", response_model=list)
async def get_tenant_stats(
    days: int = 7,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db)
):
    """获取各租户统计数据"""
    # 查询所有租户
    result = await db.execute(select(Tenant))
    tenants = result.scalars().all()

    stats = []
    for tenant in tenants:
        # 租户用户数
        user_count = await db.scalar(
            select(func.count(User.id)).where(User.tenant_id == tenant.id)
        ) or 0

        # 租户生成字数
        words = await db.scalar(
            select(func.sum(GenerationTask.total_words_generated)).where(
                GenerationTask.tenant_id == tenant.id
            )
        ) or 0

        # 租户任务数
        task_count = await db.scalar(
            select(func.count(GenerationTask.id)).where(
                GenerationTask.tenant_id == tenant.id
            )
        ) or 0

        stats.append(TenantStats(
            tenant_id=tenant.id,
            tenant_name=tenant.name,
            user_count=user_count,
            total_words=words,
            task_count=task_count
        ))

    return stats


@router.get("/stats/daily")
async def get_daily_stats(
    days: int = 7,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db)
):
    """获取每日统计数据"""
    start_date = datetime.utcnow() - timedelta(days=days)

    result = await db.execute(
        select(GenerationTask).where(
            GenerationTask.created_at >= start_date
        )
    )
    tasks = result.scalars().all()

    # 按日期分组统计
    daily_stats = {}
    for task in tasks:
        date_key = task.created_at.strftime("%Y-%m-%d")
        if date_key not in daily_stats:
            daily_stats[date_key] = {
                "date": date_key,
                "task_count": 0,
                "success_count": 0,
                "words": 0
            }
        daily_stats[date_key]["task_count"] += 1
        if task.status == "completed":
            daily_stats[date_key]["success_count"] += 1
        if task.total_words_generated:
            daily_stats[date_key]["words"] += task.total_words_generated

    return list(daily_stats.values())


@router.get("/stats/task-distribution")
async def get_task_distribution(
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db)
):
    """获取任务状态分布"""
    # 按状态统计任务数
    result = await db.execute(
        select(GenerationTask.status, func.count(GenerationTask.id)).group_by(GenerationTask.status)
    )
    rows = result.all()

    distribution = []
    for status, count in rows:
        distribution.append({
            "status": status,
            "count": count
        })

    return distribution
