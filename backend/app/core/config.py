from pydantic_settings import BaseSettings
from typing import Optional
import os


class Settings(BaseSettings):
    # Application
    APP_NAME: str = "BidAI智能投标系统"
    DEBUG: bool = False  # 生产环境应关闭
    API_V1_PREFIX: str = "/api/v1"

    # Database - 使用utf8mb4字符集
    DATABASE_URL: str = "mysql+aiomysql://root:MySQL2026!@129.204.22.220:3306/bidai?charset=utf8mb4"

    # Redis
    REDIS_URL: str = "redis://:Redis2026!@129.204.22.220:6379/0"

    # Security - 生产环境必须通过环境变量设置
    SECRET_KEY: str = ""  # 必须设置：export SECRET_KEY="your-secure-key-here"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Rate Limiting
    RATE_LIMIT_PER_MINUTE: int = 60  # 每分钟最大请求次数

    # CORS
    CORS_ORIGINS: str = "http://localhost:3000"  # 逗号分隔的允许来源

    # File Upload - 使用绝对路径
    UPLOAD_DIR: str = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
    MAX_FILE_SIZE: int = 50 * 1024 * 1024  # 50MB
    ALLOWED_FILE_TYPES: list = ["pdf", "docx", "doc"]

    # LLM Settings
    DEFAULT_ANALYSIS_MODEL: str = "qwen-long"
    DEFAULT_GENERATION_MODEL: str = "qwen-max"

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
