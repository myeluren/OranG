from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional, List

from app.core.security import get_db, get_current_user, require_super_admin, require_tenant_admin, get_password_hash
from app.models import User, UserRegisterRequest
from app.schemas import (
    UserResponse, UserCreate, UserUpdate, UserRole,
    RegisterRequestResponse, ApproveRegisterRequest, RejectRegisterRequest
)

router = APIRouter(prefix="", tags=["用户管理"])


# 获取注册申请列表（超管）- 必须放在 /users/{user_id} 之前
@router.get("/register-requests", response_model=List[RegisterRequestResponse])
async def get_register_requests(
    skip: int = 0,
    limit: int = 20,
    status_filter: Optional[str] = None,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db)
):
    query = select(UserRegisterRequest)

    if status_filter:
        query = query.where(UserRegisterRequest.status == status_filter)

    query = query.offset(skip).limit(limit).order_by(UserRegisterRequest.created_at.desc())
    result = await db.execute(query)
    requests = result.scalars().all()

    return [RegisterRequestResponse.model_validate(r) for r in requests]


# 审批通过注册申请
@router.post("/register-requests/{request_id}/approve")
async def approve_register_request(
    request_id: int,
    data: ApproveRegisterRequest,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(UserRegisterRequest).where(UserRegisterRequest.id == request_id))
    request = result.scalar_one_or_none()

    if not request:
        raise HTTPException(status_code=404, detail="申请不存在")

    if request.status != "pending":
        raise HTTPException(status_code=400, detail="申请已被处理")

    # 创建用户
    new_user = User(
        username=request.username,
        email=request.email,
        password_hash=request.password_hash,
        name=request.name,
        tenant_id=data.tenant_id,
        role=data.role,
        status="active",
        is_first_login=True
    )
    db.add(new_user)

    # 更新申请状态
    request.status = "approved"
    request.reviewed_by = current_user.id
    request.reviewed_at = func.now()

    await db.commit()

    return {"code": 0, "message": "账号已开通", "data": None}


# 拒绝注册申请
@router.post("/register-requests/{request_id}/reject")
async def reject_register_request(
    request_id: int,
    data: RejectRegisterRequest,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(UserRegisterRequest).where(UserRegisterRequest.id == request_id))
    request = result.scalar_one_or_none()

    if not request:
        raise HTTPException(status_code=404, detail="申请不存在")

    if request.status != "pending":
        raise HTTPException(status_code=400, detail="申请已被处理")

    request.status = "rejected"
    request.review_note = data.note
    request.reviewed_by = current_user.id
    request.reviewed_at = func.now()

    await db.commit()

    return {"code": 0, "message": "已拒绝申请", "data": None}


# 用户列表（租户管理员可见本租户，超管可见全部）
@router.get("/users", response_model=dict)
async def get_users(
    skip: int = 0,
    limit: int = 20,
    status_filter: Optional[str] = None,
    role: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(User)

    # 权限过滤
    if current_user.role == "super_admin":
        pass  # 超管可见全部
    elif current_user.role == "tenant_admin":
        query = query.where(User.tenant_id == current_user.tenant_id)
    else:
        query = query.where(User.id == current_user.id)

    # 状态过滤
    if status_filter:
        query = query.where(User.status == status_filter)

    # 角色过滤
    if role:
        query = query.where(User.role == role)

    query = query.offset(skip).limit(limit).order_by(User.created_at.desc())
    result = await db.execute(query)
    users = result.scalars().all()

    return {"code": 0, "data": [UserResponse.model_validate(u) for u in users]}


# 获取单个用户
@router.get("/users/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    # 权限检查
    if current_user.role == "user" and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="无权限")

    if current_user.role == "tenant_admin" and user.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=403, detail="无权限")

    return UserResponse.model_validate(user)


# 创建用户（超管或租户管理员）
@router.post("/users", response_model=UserResponse)
async def create_user(
    user_data: UserCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # 检查用户名
    result = await db.execute(select(User).where(User.username == user_data.username))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="用户名已存在")

    # 检查邮箱
    result = await db.execute(select(User).where(User.email == user_data.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="邮箱已存在")

    # 创建用户
    new_user = User(
        username=user_data.username,
        email=user_data.email,
        password_hash=get_password_hash(user_data.password),
        name=user_data.name,
        tenant_id=current_user.tenant_id if current_user.role == "tenant_admin" else None,
        role="user" if current_user.role != "super_admin" else user_data.role,
        is_first_login=True,
        status="active"
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    return UserResponse.model_validate(new_user)


# 更新用户
@router.put("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    user_data: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    # 权限检查
    if current_user.role == "user" and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="无权限")

    if current_user.role == "tenant_admin" and user.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=403, detail="无权限")

    # 更新字段
    if user_data.email:
        user.email = user_data.email
    if user_data.name:
        user.name = user_data.name
    if user_data.theme:
        user.theme = user_data.theme

    await db.commit()
    await db.refresh(user)

    return UserResponse.model_validate(user)


# 重置密码
@router.post("/users/{user_id}/reset-password")
async def reset_password(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # 权限检查
    if current_user.role not in ["super_admin", "tenant_admin"]:
        raise HTTPException(status_code=403, detail="无权限")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    if current_user.role == "tenant_admin" and user.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=403, detail="无权限")

    # 重置为初始密码
    user.password_hash = get_password_hash("BidAI2026!")
    user.is_first_login = True
    await db.commit()

    return {"code": 0, "message": "密码已重置", "data": None}


# 启用/禁用用户
@router.patch("/users/{user_id}/status")
async def update_user_status(
    user_id: int,
    status: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if current_user.role not in ["super_admin", "tenant_admin"]:
        raise HTTPException(status_code=403, detail="无权限")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    if current_user.role == "tenant_admin" and user.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=403, detail="无权限")

    if status not in ["active", "disabled"]:
        raise HTTPException(status_code=400, detail="无效状态")

    user.status = status
    await db.commit()

    return {"code": 0, "message": "状态已更新", "data": None}
