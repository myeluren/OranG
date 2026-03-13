from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional, List, Dict, Any

from app.core.security import get_db, get_current_user, require_super_admin
from app.models import User, Tenant
from app.schemas import TenantCreate, TenantUpdate, TenantResponse

router = APIRouter(prefix="/tenants", tags=["租户管理"])


@router.get("", response_model=Dict[str, Any])
async def get_tenants(
    skip: int = 0,
    limit: int = 20,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db)
):
    query = select(Tenant).offset(skip).limit(limit).order_by(Tenant.created_at.desc())
    result = await db.execute(query)
    tenants = result.scalars().all()

    # 获取每个租户的用户数
    response = []
    for tenant in tenants:
        user_count_result = await db.execute(
            select(func.count(User.id)).where(User.tenant_id == tenant.id)
        )
        user_count = user_count_result.scalar() or 0

        tenant_data = TenantResponse.model_validate(tenant)
        tenant_data.user_count = user_count
        response.append(tenant_data)

    return {"code": 0, "data": response}


@router.get("/{tenant_id}", response_model=Dict[str, Any])
async def get_tenant(
    tenant_id: int,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()

    if not tenant:
        raise HTTPException(status_code=404, detail="租户不存在")

    user_count_result = await db.execute(
        select(func.count(User.id)).where(User.tenant_id == tenant.id)
    )
    user_count = user_count_result.scalar() or 0

    tenant_data = TenantResponse.model_validate(tenant)
    tenant_data.user_count = user_count

    return {"code": 0, "data": tenant_data}


@router.post("", response_model=Dict[str, Any])
async def create_tenant(
    tenant_data: TenantCreate,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db)
):
    # 检查名称是否已存在
    result = await db.execute(select(Tenant).where(Tenant.name == tenant_data.name))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="租户名称已存在")

    tenant = Tenant(
        name=tenant_data.name,
        contact_person=tenant_data.contact_person,
        contact_phone=tenant_data.contact_phone,
        contact_email=tenant_data.contact_email,
        description=tenant_data.description
    )
    db.add(tenant)
    await db.commit()
    await db.refresh(tenant)

    tenant_data = TenantResponse.model_validate(tenant)
    tenant_data.user_count = 0

    return {"code": 0, "data": tenant_data, "message": "创建成功"}


@router.patch("/{tenant_id}", response_model=Dict[str, Any])
async def update_tenant(
    tenant_id: int,
    tenant_data: TenantUpdate,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()

    if not tenant:
        raise HTTPException(status_code=404, detail="租户不存在")

    if tenant_data.name:
        tenant.name = tenant_data.name
    if tenant_data.status:
        tenant.status = tenant_data.status
    if tenant_data.contact_person is not None:
        tenant.contact_person = tenant_data.contact_person
    if tenant_data.contact_phone is not None:
        tenant.contact_phone = tenant_data.contact_phone
    if tenant_data.contact_email is not None:
        tenant.contact_email = tenant_data.contact_email
    if tenant_data.description is not None:
        tenant.description = tenant_data.description

    await db.commit()
    await db.refresh(tenant)

    user_count_result = await db.execute(
        select(func.count(User.id)).where(User.tenant_id == tenant.id)
    )
    user_count = user_count_result.scalar() or 0

    tenant_response = TenantResponse.model_validate(tenant)
    tenant_response.user_count = user_count

    return {"code": 0, "data": tenant_response, "message": "更新成功"}
