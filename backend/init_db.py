"""
数据库初始化脚本 - 创建所有表
用法: python init_db.py
"""
import asyncio
import sys
import os

# 设置环境变量 - 使用 run.py 中的 PostgreSQL 配置
os.environ["DATABASE_URL"] = "postgresql+asyncpg://bidai:bidai2026@localhost:5432/bidai"
os.environ["REDIS_URL"] = "redis://localhost:6379/0"

# 添加项目根目录到 Python 路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from app.core.database import Base
from app.core.security import engine
from app.models import (
    Tenant, User, UserRegisterRequest, Plan, Subscription,
    Project, GenerationTask, TaskCheckpoint, WordTransaction,
    LLMConfig, FormatTemplate, GlobalSetting
)


async def create_tables():
    """创建所有数据库表"""
    async with engine.begin() as conn:
        # 删除所有表（如果存在）
        # await conn.run_sync(Base.metadata.drop_all)

        # 创建所有表
        await conn.run_sync(Base.metadata.create_all)

    print("所有表创建成功!")


async def check_tables():
    """检查表是否存在"""
    async with engine.begin() as conn:
        result = await conn.execute(text("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            ORDER BY table_name
        """))
        tables = [row[0] for row in result.fetchall()]

        print("\n当前数据库中的表:")
        for table in tables:
            print(f"  - {table}")

        return tables


async def main():
    print("开始初始化数据库...")

    # 检查现有表
    existing_tables = await check_tables()

    # 创建表
    await create_tables()

    # 再次检查
    print("\n创建后的表:")
    await check_tables()

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
