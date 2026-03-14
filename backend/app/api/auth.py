from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from datetime import datetime
from jose import JWTError, jwt

from app.core.security import (
    get_db, verify_password, get_password_hash,
    create_access_token, create_refresh_token, decode_token,
    get_current_user, get_password_hash
)
from app.core.config import settings
from app.models import User, Tenant, UserRegisterRequest
from app.schemas import (
    LoginRequest, RegisterRequest, ChangePasswordRequest,
    TokenResponse, UsernameCheckResponse, UserResponse
)
from app.utils.rate_limit import check_rate_limit

router = APIRouter(prefix="/auth", tags=["认证"])


@router.post("/register", response_model=dict)
async def register(request: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """用户自助注册"""
    # 检查用户名是否已存在
    result = await db.execute(
        select(User).where(User.username == request.username)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="用户名已被使用"
        )

    # 检查邮箱是否已存在
    result = await db.execute(
        select(User).where(User.email == request.email)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="邮箱已被使用"
        )

    # 创建注册申请
    from app.models import UserRegisterRequest
    register_request = UserRegisterRequest(
        username=request.username,
        email=request.email,
        password_hash=get_password_hash(request.password),
        name=request.name,
        status="pending"
    )
    db.add(register_request)
    await db.commit()

    return {
        "code": 0,
        "message": "注册申请已提交，请等待管理员审批",
        "data": None
    }


@router.get("/check-username", response_model=UsernameCheckResponse)
async def check_username(username: str, request: Request, db: AsyncSession = Depends(get_db)):
    """实时校验用户名"""
    # 限流检查 - 60次/分钟/IP
    client_ip = request.client.host if request.client else "unknown"
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        client_ip = forwarded_for.split(",")[0].strip()

    if not check_rate_limit(client_ip, settings.RATE_LIMIT_PER_MINUTE):
        raise HTTPException(
            status_code=429,
            detail=f"请求过于频繁，请稍后再试（{settings.RATE_LIMIT_PER_MINUTE}次/分钟）"
        )

    result = await db.execute(
        select(User).where(User.username == username)
    )
    user_exists = result.scalar_one_or_none() is not None

    # 也检查注册申请表
    result = await db.execute(
        select(UserRegisterRequest).where(
            UserRegisterRequest.username == username,
            UserRegisterRequest.status == "pending"
        )
    )
    request_exists = result.scalar_one_or_none() is not None

    if user_exists or request_exists:
        return UsernameCheckResponse(
            available=False,
            message="用户名已被使用"
        )

    return UsernameCheckResponse(
        available=True,
        message="用户名可用"
    )


@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest, db: AsyncSession = Depends(get_db)):
    """用户登录"""
    # 查找用户
    result = await db.execute(
        select(User).where(User.username == request.username)
    )
    user = result.scalar_one_or_none()

    if not user or not verify_password(request.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误"
        )

    # 检查账号状态
    if user.status == "pending":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="账号待审批，请联系管理员"
        )

    if user.status == "rejected":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="账号已被拒绝，请联系管理员"
        )

    if user.status == "disabled":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="账号已禁用，请联系管理员"
        )

    # 更新最后登录时间
    user.last_login_at = datetime.utcnow()
    await db.commit()

    # 生成Token
    access_token = create_access_token({"sub": user.id, "tenant_id": user.tenant_id, "role": user.role})
    refresh_token = create_refresh_token({"sub": user.id})

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserResponse.model_validate(user)
    )


@router.post("/change-password", response_model=dict)
async def change_password(
    request: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """修改密码"""
    # 首次登录必须提供旧密码
    if current_user.is_first_login and not request.old_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="首次登录必须提供原密码"
        )

    # 验证原密码
    if request.old_password:
        if not verify_password(request.old_password, current_user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="原密码错误"
            )

    # 更新密码
    current_user.password_hash = get_password_hash(request.new_password)
    current_user.is_first_login = False
    await db.commit()

    return {
        "code": 0,
        "message": "密码修改成功",
        "data": None
    }


@router.post("/refresh", response_model=dict)
async def refresh_token(refresh_token: str = Query(...), db: AsyncSession = Depends(get_db)):
    """刷新Token"""
    payload = decode_token(refresh_token)

    if payload is None or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的刷新令牌"
        )

    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None or user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户不存在或未激活"
        )

    # 生成新Token
    access_token = create_access_token({"sub": user.id, "tenant_id": user.tenant_id, "role": user.role})
    new_refresh_token = create_refresh_token({"sub": user.id})

    return {
        "code": 0,
        "message": "success",
        "data": {
            "access_token": access_token,
            "refresh_token": new_refresh_token,
            "token_type": "bearer"
        }
    }


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """获取当前用户信息"""
    return UserResponse.model_validate(current_user)
