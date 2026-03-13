from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


# Enums
class UserRole(str, Enum):
    super_admin = "super_admin"
    tenant_admin = "tenant_admin"
    user = "user"


class UserStatus(str, Enum):
    pending = "pending"
    active = "active"
    disabled = "disabled"
    rejected = "rejected"


class Theme(str, Enum):
    light = "light"
    dark = "dark"


class TaskStatus(str, Enum):
    pending = "pending"
    running = "running"
    paused_manual = "paused_manual"
    paused_quota = "paused_quota"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"


class ProjectStatus(str, Enum):
    draft = "draft"
    outline_generated = "outline_generated"
    format_set = "format_set"
    generating = "generating"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"


class LLMProvider(str, Enum):
    openai = "openai"
    anthropic = "anthropic"
    qianwen = "qianwen"
    wenxin = "wenxin"
    zhipu = "zhipu"
    moonshot = "moonshot"
    custom = "custom"


class UsageType(str, Enum):
    analysis = "analysis"
    generation = "generation"


# Base schemas
class UserBase(BaseModel):
    username: str
    email: EmailStr
    name: str


class UserCreate(UserBase):
    password: str
    role: Optional[UserRole] = "user"


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    name: Optional[str] = None
    theme: Optional[Theme] = None


class UserResponse(UserBase):
    id: int
    tenant_id: Optional[int] = None
    role: UserRole
    theme: Theme
    is_first_login: bool
    status: UserStatus
    last_login_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


# Auth schemas
class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=30, pattern=r"^[a-zA-Z0-9_]+$")
    email: EmailStr
    password: str = Field(..., min_length=8)
    name: Optional[str] = Field(None, min_length=2, max_length=50)  # 可选字段


class ChangePasswordRequest(BaseModel):
    old_password: Optional[str] = None
    new_password: str = Field(..., min_length=8)


class TokenResponse(BaseModel):
    code: int = 0
    message: str = "登录成功"
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse


class UsernameCheckResponse(BaseModel):
    available: bool
    message: str


# Tenant schemas
class TenantBase(BaseModel):
    name: str
    contact_person: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    description: Optional[str] = None


class TenantCreate(TenantBase):
    pass


class TenantUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None
    contact_person: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    description: Optional[str] = None


class TenantResponse(TenantBase):
    id: int
    status: str
    created_at: datetime
    user_count: Optional[int] = 0

    class Config:
        from_attributes = True


# Plan schemas
class PlanBase(BaseModel):
    name: str
    price: float
    period_word_limit: int
    valid_days: int
    features_json: Optional[str] = None


class PlanCreate(PlanBase):
    pass


class PlanUpdate(BaseModel):
    name: Optional[str] = None
    price: Optional[float] = None
    period_word_limit: Optional[int] = None
    valid_days: Optional[int] = None
    features_json: Optional[str] = None
    is_active: Optional[bool] = None


class PlanResponse(PlanBase):
    id: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# Subscription schemas
class SubscriptionBase(BaseModel):
    plan_id: Optional[int] = None
    period_word_limit: Optional[int] = None
    remark: Optional[str] = None


class SubscriptionCreate(SubscriptionBase):
    tenant_id: int
    valid_days: int = 30


class SubscriptionResponse(SubscriptionBase):
    id: int
    tenant_id: int
    start_at: datetime
    expire_at: datetime
    period_used_words: int
    status: str
    created_at: datetime

    class Config:
        from_attributes = True

    @property
    def remaining_words(self) -> int:
        return max(0, self.period_word_limit - self.period_used_words)


# Project schemas
class ProjectBase(BaseModel):
    title: str


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    title: Optional[str] = None
    outline_json: Optional[str] = None
    template: Optional[str] = None
    template_styles: Optional[str] = None  # 自定义模板样式
    target_pages: Optional[int] = None
    words_per_page: Optional[int] = None
    status: Optional[ProjectStatus] = None


class OutlineNode(BaseModel):
    level: int
    title: str
    children: Optional[List["OutlineNode"]] = []


class ProjectResponse(ProjectBase):
    id: int
    tenant_id: int
    user_id: int
    tender_file_url: Optional[str] = None
    tender_file_name: Optional[str] = None
    tender_file_word_count: int = 0
    tender_file_status: str
    outline_json: Optional[str] = None
    template: str = 'government'
    template_styles: Optional[str] = None  # 自定义模板样式
    target_pages: int
    words_per_page: int
    status: ProjectStatus
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Task schemas
class TaskBase(BaseModel):
    project_id: int


class TaskResponse(TaskBase):
    id: int
    tenant_id: int
    user_id: int
    status: TaskStatus
    pause_reason: Optional[str] = None
    total_chapters: int
    completed_chapters: int
    total_words_generated: int
    rollback_words: int
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


# LLM Config schemas
class LLMConfigBase(BaseModel):
    provider: str
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    model: str
    usage_type: UsageType


class LLMConfigCreate(LLMConfigBase):
    tenant_id: Optional[int] = None


class LLMConfigUpdate(BaseModel):
    provider: Optional[str] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    model: Optional[str] = None
    is_active: Optional[bool] = None


class LLMConfigResponse(BaseModel):
    id: int
    tenant_id: Optional[int]
    provider: str
    base_url: Optional[str] = None
    model: str
    usage_type: UsageType
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None
    # 不返回实际的api_key给前端
    api_key: str = ''

    model_config = {'from_attributes': True}


# Format Template schemas
class FormatTemplateBase(BaseModel):
    name: str
    config_json: str


class FormatTemplateCreate(FormatTemplateBase):
    tenant_id: Optional[int] = None


class FormatTemplateResponse(FormatTemplateBase):
    id: int
    tenant_id: Optional[int]
    is_preset: bool
    created_at: datetime

    class Config:
        from_attributes = True


# Register Request schemas
class RegisterRequestResponse(BaseModel):
    id: int
    username: str
    email: str
    name: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class ApproveRegisterRequest(BaseModel):
    tenant_id: int
    role: UserRole = UserRole.user


class RejectRegisterRequest(BaseModel):
    note: str


# Statistics schemas
class StatsResponse(BaseModel):
    total_tenants: int
    active_users: int
    total_words_generated: int
    success_rate: float


class TenantStats(BaseModel):
    tenant_id: int
    tenant_name: str
    user_count: int
    word_usage: int
    word_limit: int
    usage_percentage: float
    subscription_expire_at: Optional[datetime] = None


# Update forward refs
OutlineNode.model_rebuild()
