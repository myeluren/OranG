from sqlalchemy import Column, BigInteger, String, DateTime, Text, Integer, Enum, DECIMAL, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Tenant(Base):
    __tablename__ = "tenants"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False, comment="租户名称")
    status = Column(Enum("active", "disabled"), default="active", comment="状态")
    contact_person = Column(String(100), nullable=True, comment="联系人")
    contact_phone = Column(String(50), nullable=True, comment="联系电话")
    contact_email = Column(String(100), nullable=True, comment="联系邮箱")
    description = Column(Text, nullable=True, comment="备注描述")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    users = relationship("User", back_populates="tenant")
    subscriptions = relationship("Subscription", back_populates="tenant")
    projects = relationship("Project", back_populates="tenant")
    llm_configs = relationship("LLMConfig", back_populates="tenant")
    format_templates = relationship("FormatTemplate", back_populates="tenant")


class User(Base):
    __tablename__ = "users"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id = Column(BigInteger, ForeignKey("tenants.id"), nullable=True, comment="所属租户")
    username = Column(String(30), unique=True, nullable=False, comment="用户名")
    email = Column(String(255), unique=True, nullable=False, comment="邮箱")
    password_hash = Column(String(255), nullable=False, comment="密码哈希")
    name = Column(String(50), nullable=False, comment="真实姓名")
    role = Column(Enum("super_admin", "tenant_admin", "user"), default="user", comment="角色")
    theme = Column(Enum("light", "dark"), default="light", comment="主题偏好")
    is_first_login = Column(Boolean, default=True, comment="是否首次登录")
    status = Column(Enum("pending", "active", "disabled", "rejected"), default="pending", comment="账号状态")
    last_login_at = Column(DateTime, nullable=True, comment="最后登录时间")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    tenant = relationship("Tenant", back_populates="users")
    projects = relationship("Project", back_populates="user")
    tasks = relationship("GenerationTask", back_populates="user")


class UserRegisterRequest(Base):
    __tablename__ = "user_register_requests"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    username = Column(String(30), unique=True, nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    name = Column(String(50), nullable=False)
    status = Column(Enum("pending", "approved", "rejected"), default="pending")
    review_note = Column(String(500), nullable=True)
    reviewed_by = Column(BigInteger, nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class Plan(Base):
    __tablename__ = "plans"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    name = Column(String(50), nullable=False)
    price = Column(DECIMAL(10, 2), nullable=False)
    period_word_limit = Column(Integer, nullable=False)
    valid_days = Column(Integer, nullable=False)
    features_json = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    subscriptions = relationship("Subscription", back_populates="plan")


class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id = Column(BigInteger, ForeignKey("tenants.id"), nullable=False)
    plan_id = Column(BigInteger, ForeignKey("plans.id"), nullable=True)
    start_at = Column(DateTime, nullable=False)
    expire_at = Column(DateTime, nullable=False)
    period_word_limit = Column(Integer, nullable=False)
    period_used_words = Column(Integer, default=0)
    status = Column(Enum("active", "expired", "cancelled"), default="active")
    operator_id = Column(BigInteger, nullable=True)
    remark = Column(String(500), nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    # Relationships
    tenant = relationship("Tenant", back_populates="subscriptions")
    plan = relationship("Plan", back_populates="subscriptions")
    word_transactions = relationship("WordTransaction", back_populates="subscription")


class Project(Base):
    __tablename__ = "projects"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id = Column(BigInteger, ForeignKey("tenants.id"), nullable=False)
    user_id = Column(BigInteger, ForeignKey("users.id"), nullable=False)
    title = Column(String(255), nullable=False)
    tender_file_url = Column(String(1000), nullable=True)
    tender_file_name = Column(String(255), nullable=True)
    tender_file_word_count = Column(Integer, default=0)
    tender_file_status = Column(Enum("pending", "uploaded", "parsed", "failed"), default="pending")
    outline_json = Column(Text, nullable=True)
    template = Column(String(50), default='government')
    template_styles = Column(Text, nullable=True)  # 自定义模板样式
    target_pages = Column(Integer, default=50)
    words_per_page = Column(Integer, default=700)
    status = Column(Enum("draft", "outline_generated", "format_set", "generating", "completed", "failed", "cancelled"), default="draft")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    tenant = relationship("Tenant", back_populates="projects")
    user = relationship("User", back_populates="projects")
    tasks = relationship("GenerationTask", back_populates="project")


class GenerationTask(Base):
    __tablename__ = "generation_tasks"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    project_id = Column(BigInteger, ForeignKey("projects.id"), nullable=False)
    tenant_id = Column(BigInteger, ForeignKey("tenants.id"), nullable=False)
    user_id = Column(BigInteger, ForeignKey("users.id"), nullable=False)
    status = Column(Enum("pending", "running", "paused_manual", "paused_quota", "completed", "failed", "cancelled"), default="pending")
    pause_reason = Column(String(50), nullable=True)
    total_chapters = Column(Integer, default=0)
    completed_chapters = Column(Integer, default=0)
    total_words_generated = Column(Integer, default=0)
    rollback_words = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    project = relationship("Project", back_populates="tasks")
    tenant = relationship("Tenant")
    user = relationship("User", back_populates="tasks")
    checkpoints = relationship("TaskCheckpoint", back_populates="task")
    word_transactions = relationship("WordTransaction", back_populates="task")


class TaskCheckpoint(Base):
    __tablename__ = "task_checkpoints"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    task_id = Column(BigInteger, ForeignKey("generation_tasks.id"), nullable=False)
    chapter_index = Column(Integer, nullable=False)
    chapter_title = Column(String(255), nullable=False)
    content = Column(Text, nullable=True)
    word_count = Column(Integer, default=0)
    generated_at = Column(DateTime, server_default=func.now())

    # Relationships
    task = relationship("GenerationTask", back_populates="checkpoints")


class WordTransaction(Base):
    __tablename__ = "word_transactions"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id = Column(BigInteger, ForeignKey("tenants.id"), nullable=False)
    subscription_id = Column(BigInteger, ForeignKey("subscriptions.id"), nullable=False)
    user_id = Column(BigInteger, ForeignKey("users.id"), nullable=False)
    task_id = Column(BigInteger, ForeignKey("generation_tasks.id"), nullable=True)
    type = Column(Enum("consume", "rollback"), nullable=False)
    amount = Column(Integer, nullable=False)
    balance_after = Column(Integer, nullable=False)
    remark = Column(String(500), nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    # Relationships
    subscription = relationship("Subscription", back_populates="word_transactions")
    task = relationship("GenerationTask", back_populates="word_transactions")


class LLMConfig(Base):
    __tablename__ = "llm_configs"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id = Column(BigInteger, ForeignKey("tenants.id"), nullable=True)
    provider = Column(String(50), nullable=False)
    base_url = Column(String(500), nullable=True)
    api_key_encrypted = Column(String(1000), nullable=False)
    model = Column(String(100), nullable=False)
    usage_type = Column(Enum("analysis", "generation"), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    tenant = relationship("Tenant", back_populates="llm_configs")


class FormatTemplate(Base):
    __tablename__ = "format_templates"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id = Column(BigInteger, ForeignKey("tenants.id"), nullable=True)
    name = Column(String(100), nullable=False)
    config_json = Column(Text, nullable=False)
    is_preset = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    tenant = relationship("Tenant", back_populates="format_templates")


class GlobalSetting(Base):
    __tablename__ = "global_settings"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    setting_key = Column(String(100), unique=True, nullable=False)
    setting_value = Column(Text, nullable=True)
    description = Column(String(255), nullable=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
