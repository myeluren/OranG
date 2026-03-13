from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional, List
from datetime import datetime, timedelta

from app.core.security import get_db, get_current_user, require_super_admin
from app.models import User, Plan, Subscription
from app.schemas import PlanCreate, PlanUpdate, PlanResponse, SubscriptionCreate, SubscriptionResponse

router = APIRouter(prefix="", tags=["套餐管理"])


# 套餐管理
@router.get("/plans", response_model=List[PlanResponse])
async def get_plans(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Plan).where(Plan.is_active == True).order_by(Plan.price))
    plans = result.scalars().all()
    return [PlanResponse.model_validate(p) for p in plans]


@router.get("/plans/{plan_id}", response_model=PlanResponse)
async def get_plan(
    plan_id: int,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Plan).where(Plan.id == plan_id))
    plan = result.scalar_one_or_none()

    if not plan:
        raise HTTPException(status_code=404, detail="套餐不存在")

    return PlanResponse.model_validate(plan)


@router.post("/plans", response_model=PlanResponse)
async def create_plan(
    plan_data: PlanCreate,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db)
):
    plan = Plan(
        name=plan_data.name,
        price=plan_data.price,
        period_word_limit=plan_data.period_word_limit,
        valid_days=plan_data.valid_days,
        features_json=plan_data.features_json
    )
    db.add(plan)
    await db.commit()
    await db.refresh(plan)

    return PlanResponse.model_validate(plan)


@router.put("/plans/{plan_id}", response_model=PlanResponse)
async def update_plan(
    plan_id: int,
    plan_data: PlanUpdate,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Plan).where(Plan.id == plan_id))
    plan = result.scalar_one_or_none()

    if not plan:
        raise HTTPException(status_code=404, detail="套餐不存在")

    if plan_data.name:
        plan.name = plan_data.name
    if plan_data.price:
        plan.price = plan_data.price
    if plan_data.period_word_limit:
        plan.period_word_limit = plan_data.period_word_limit
    if plan_data.valid_days:
        plan.valid_days = plan_data.valid_days
    if plan_data.features_json:
        plan.features_json = plan_data.features_json
    if plan_data.is_active is not None:
        plan.is_active = plan_data.is_active

    await db.commit()
    await db.refresh(plan)

    return PlanResponse.model_validate(plan)


# 订阅管理
@router.get("/subscriptions", response_model=SubscriptionResponse)
async def get_current_subscription(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="用户未绑定租户")

    # 获取当前有效的订阅
    result = await db.execute(
        select(Subscription).where(
            Subscription.tenant_id == current_user.tenant_id,
            Subscription.status == "active",
            Subscription.expire_at > datetime.utcnow()
        ).order_by(Subscription.expire_at.desc())
    )
    subscription = result.scalar_one_or_none()

    if not subscription:
        raise HTTPException(status_code=404, detail="无有效订阅")

    return SubscriptionResponse.model_validate(subscription)


@router.post("/subscriptions", response_model=SubscriptionResponse)
async def create_subscription(
    sub_data: SubscriptionCreate,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db)
):
    # 获取套餐信息
    period_word_limit = sub_data.period_word_limit
    if sub_data.plan_id:
        result = await db.execute(select(Plan).where(Plan.id == sub_data.plan_id))
        plan = result.scalar_one_or_none()
        if not plan:
            raise HTTPException(status_code=404, detail="套餐不存在")
        period_word_limit = plan.period_word_limit

    # 创建订阅
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

    # 如果已有有效订阅，标记为过期
    result = await db.execute(
        select(Subscription).where(
            Subscription.tenant_id == sub_data.tenant_id,
            Subscription.status == "active"
        )
    )
    existing_sub = result.scalar_one_or_none()
    if existing_sub:
        existing_sub.status = "expired"

    await db.commit()
    await db.refresh(subscription)

    return SubscriptionResponse.model_validate(subscription)
