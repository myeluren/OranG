from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import httpx

from app.core.config import settings
from app.core.database import Base
from app.core.security import engine
from app.api import auth, users, tenants, plans, subscriptions, projects, tasks, llm, admin, outline, content, export

app = FastAPI(
    title=settings.APP_NAME,
    description="智能投标标书生成系统 API",
    version="2.2.0",
    docs_url="/docs",
    redoc_url="/redoc"
)


@app.on_event("startup")
async def startup_event():
    """启动时创建所有数据库表"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("数据库表初始化完成")


# CORS - 允许所有来源（开发环境）
# 注意：当 allow_credentials=True 时，不能使用通配符 "*"
# 需要明确列出允许的来源
all_origins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=all_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix=settings.API_V1_PREFIX)
app.include_router(users.router, prefix=settings.API_V1_PREFIX)
app.include_router(tenants.router, prefix=settings.API_V1_PREFIX)
app.include_router(plans.router, prefix=settings.API_V1_PREFIX)
app.include_router(subscriptions.router, prefix=settings.API_V1_PREFIX)
app.include_router(projects.router, prefix=settings.API_V1_PREFIX)
app.include_router(tasks.router, prefix=settings.API_V1_PREFIX)
app.include_router(llm.router, prefix=settings.API_V1_PREFIX)
app.include_router(admin.router, prefix=settings.API_V1_PREFIX)
app.include_router(outline.router, prefix=settings.API_V1_PREFIX)
app.include_router(content.router, prefix=settings.API_V1_PREFIX)
app.include_router(export.router, prefix=settings.API_V1_PREFIX)


@app.get("/")
async def root():
    return {
        "name": settings.APP_NAME,
        "version": "2.2.0",
        "docs": "/docs"
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


# 调试用：查看数据库中的LLM配置
@app.get("/debug/llm-config")
async def debug_llm_config():
    """查看数据库中的LLM配置"""
    from sqlalchemy import select
    from app.core.security import get_db
    from app.models import LLMConfig
    import logging
    logger = logging.getLogger(__name__)

    async for db in get_db():
        result = await db.execute(select(LLMConfig))
        configs = result.scalars().all()

        logger.warning(f"数据库中的LLM配置数量: {len(configs)}")

        config_list = []
        for c in configs:
            key_val = c.api_key_encrypted or ""
            key_len = len(key_val)
            config_list.append({
                "id": c.id,
                "tenant_id": c.tenant_id,
                "provider": c.provider,
                "base_url": c.base_url,
                "api_key_full": key_val,  # 完整key
                "model": c.model,
                "usage_type": c.usage_type,
                "is_active": c.is_active
            })
            logger.warning(f"配置 {c.id}: api_key={key_val}")

        return {"configs": config_list}


# 调试用：直接测试 MiniMax API
@app.get("/debug/test-minimax")
async def test_minimax():
    """直接测试 MiniMax API 连接"""
    import logging
    import subprocess
    import json
    import os
    logger = logging.getLogger(__name__)

    api_key = "sk-cp-CLss4Wz8g0dIaxnwKoqY0aCAuLd1-HHwRVGiz0n7xxAwVVGOgpiqExG7tOo3HoMOKPRscZNA51PCQB-vxy61vdTA3qXykfn8nBF6jr_XeVxrPBFSQX-63qU"

    # 尝试多个 curl 路径
    curl_paths = [
        os.path.join(os.environ.get('SystemRoot', 'C:\\Windows'), 'System32', 'curl.exe'),
        'curl',
        'C:\\Program Files\\Git\\mingw64\\bin\\curl.exe',
    ]

    for curl_path in curl_paths:
        cmd = [
            curl_path,
            "-x", "http://127.0.0.1:17890",
            "-s",
            "https://api.minimaxi.com/v1/text/chatcompletion_v2",
            "-H", f"Authorization: Bearer {api_key}",
            "-H", "Content-Type: application/json",
            "--http1.1",
            "-d", json.dumps({
                "model": "MiniMax-M2.5",
                "messages": [{"role": "user", "content": "你好"}],
                "max_tokens": 10
            })
        ]

        logger.warning(f"尝试: {curl_path}")

        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            if result.stdout:
                logger.warning(f"成功: {result.stdout[:200]}")
                return {"result": result.stdout[:500]}
            else:
                logger.warning(f"无输出: {result.stderr[:200]}")
        except Exception as e:
            logger.warning(f"错误: {e}")
            continue

    return {"error": "所有curl尝试都失败"}
