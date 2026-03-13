from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional, List
from datetime import datetime, timedelta

from app.core.security import get_db, get_current_user, require_super_admin
from app.models import User, Subscription, Plan
from app.schemas import SubscriptionCreate, SubscriptionResponse

router = APIRouter(prefix="/subscriptions", tags=["订阅管理"])


@router.get("", response_model=SubscriptionResponse)
async def get_my_subscription(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """获取当前租户的订阅信息"""
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="用户未绑定租户")

    # 获取最新的有效订阅
    result = await db.execute(
        select(Subscription, Plan).join(
            Plan, Subscription.plan_id == Plan.id, isouter=True
        ).where(
            Subscription.tenant_id == current_user.tenant_id,
            Subscription.status == "active",
            Subscription.expire_at > datetime.utcnow()
        ).order_by(Subscription.expire_at.desc()).limit(1)
    )
    row = result.first()

    if not row:
        raise HTTPException(status_code=404, detail="无有效订阅")

    subscription, plan = row

    # 构建响应
    response = SubscriptionResponse(
        id=subscription.id,
        tenant_id=subscription.tenant_id,
        plan_id=subscription.plan_id,
        start_at=subscription.start_at,
        expire_at=subscription.expire_at,
        period_word_limit=subscription.period_word_limit,
        period_used_words=subscription.period_used_words,
        status=subscription.status,
        remark=subscription.remark,
        created_at=subscription.created_at
    )

    return response


@router.get("/usage")
async def get_word_usage(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """获取当前租户的字数使用情况"""
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="用户未绑定租户")

    result = await db.execute(
        select(Subscription).where(
            Subscription.tenant_id == current_user.tenant_id,
            Subscription.status == "active",
            Subscription.expire_at > datetime.utcnow()
        ).order_by(Subscription.expire_at.desc()).limit(1)
    )
    subscription = result.scalar_one_or_none()

    if not subscription:
        return {
            "total_words": 0,
            "used_words": 0,
            "remaining_words": 0,
            "expire_at": None,
            "usage_percentage": 0,
            "is_low": False,
            "has_subscription": False
        }

    remaining = max(0, subscription.period_word_limit - subscription.period_used_words)
    percentage = (subscription.period_used_words / subscription.period_word_limit * 100) if subscription.period_word_limit > 0 else 0

    return {
        "total_words": subscription.period_word_limit,
        "used_words": subscription.period_used_words,
        "remaining_words": remaining,
        "expire_at": subscription.expire_at,
        "usage_percentage": round(percentage, 2),
        "is_low": remaining < subscription.period_word_limit * 0.1,
        "has_subscription": True
    }


@router.get("/all")
async def get_all_subscriptions(
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db)
):
    """获取所有租户的订阅信息（管理员用）"""
    result = await db.execute(
        select(Subscription, Plan).join(
            Plan, Subscription.plan_id == Plan.id, isouter=True
        ).order_by(Subscription.created_at.desc())
    )
    rows = result.all()

    subscriptions = []
    for row in rows:
        subscription, plan = row
        subscriptions.append({
            "id": subscription.id,
            "tenant_id": subscription.tenant_id,
            "plan_id": subscription.plan_id,
            "plan_name": plan.name if plan else None,
            "start_at": subscription.start_at.isoformat() if subscription.start_at else None,
            "expire_at": subscription.expire_at.isoformat() if subscription.expire_at else None,
            "period_word_limit": subscription.period_word_limit,
            "period_used_words": subscription.period_used_words,
            "status": subscription.status,
            "remark": subscription.remark,
            "created_at": subscription.created_at.isoformat() if subscription.created_at else None
        })

    return {"code": 0, "data": subscriptions}


@router.post("", response_model=SubscriptionResponse)
async def create_subscription_for_tenant(
    sub_data: SubscriptionCreate,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db)
):
    """为租户开通/续期订阅"""
    # 获取套餐信息
    period_word_limit = sub_data.period_word_limit
    if sub_data.plan_id:
        result = await db.execute(select(Plan).where(Plan.id == sub_data.plan_id))
        plan = result.scalar_one_or_none()
        if not plan:
            raise HTTPException(status_code=404, detail="套餐不存在")
        period_word_limit = plan.period_word_limit

    # 创建新订阅
    now = datetime.utcnow()
    subscription = Subscription(
        tenant_id=sub_data.tenant_id,
        plan_id=sub_data.plan_id,
        start_at=now,
        expire_at=now + timedelta(days=sub_data.valid_days),
        period_word_limit=period_word_limit,
        period_used_words=0,
        status="active",
        operator_id=current_user.id,
        remark=sub_data.remark
    )
    db.add(subscription)

    # 将该租户的其他有效订阅标记为过期
    result = await db.execute(
        select(Subscription).where(
            Subscription.tenant_id == sub_data.tenant_id,
            Subscription.status == "active"
        )
    )
    for existing in result.scalars().all():
        existing.status = "expired"

    await db.commit()
    await db.refresh(subscription)

    return SubscriptionResponse.model_validate(subscription)
