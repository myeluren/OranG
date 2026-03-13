"""
LLM配置获取工具
"""
from typing import Optional, Dict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import logging

from app.models import LLMConfig

logger = logging.getLogger(__name__)


async def get_llm_config(db: AsyncSession, tenant_id: Optional[int] = None, usage_type: str = "generation") -> Dict[str, str]:
    """
    获取LLM配置

    优先级：
    1. 租户独立配置 (tenant_id = 具体值)
    2. 全局默认配置 (tenant_id = NULL)

    Args:
        db: 数据库会话
        tenant_id: 租户ID（可选）
        usage_type: 用途类型 "analysis" 或 "generation"

    Returns:
        配置字典 {provider, api_key, base_url, model}
    """
    import logging
    logger = logging.getLogger(__name__)

    logger.warning(f"=== get_llm_config 调用 ===")
    logger.warning(f"tenant_id: {tenant_id}, usage_type: {usage_type}")

    # 1. 先查询租户独立配置
    if tenant_id:
        logger.warning("查询租户独立配置...")
        result = await db.execute(
            select(LLMConfig).where(
                LLMConfig.tenant_id == tenant_id,
                LLMConfig.usage_type == usage_type,
                LLMConfig.is_active == True
            )
        )
        config = result.scalar_one_or_none()
        if config:
            cfg = {
                "provider": config.provider,
                "api_key": config.api_key_encrypted,
                "base_url": config.base_url,
                "model": config.model
            }
            logger.warning(f"找到租户配置: tenant_id={tenant_id}, provider={config.provider}, base_url={config.base_url}")
            return cfg

    # 2. 查询全局默认配置
    logger.warning("查询全局默认配置...")
    result = await db.execute(
        select(LLMConfig).where(
            LLMConfig.tenant_id.is_(None),
            LLMConfig.usage_type == usage_type,
            LLMConfig.is_active == True
        )
    )
    config = result.scalar_one_or_none()

    if config:
        cfg = {
            "provider": config.provider,
            "api_key": config.api_key_encrypted,
            "base_url": config.base_url,
            "model": config.model
        }
        logger.warning(f"找到全局配置: usage_type={usage_type}, provider={config.provider}, base_url={config.base_url}, api_key={'已设置' if config.api_key_encrypted else '空'}")
        return cfg
    else:
        logger.warning(f"未找到任何配置: tenant_id={tenant_id}, usage_type={usage_type}")

    # 3. 返回默认配置（开发环境使用）
    logger.warning("返回默认配置")
    return {
        "provider": "qianwen",
        "api_key": "",
        "base_url": "",
        "model": "qwen-max" if usage_type == "generation" else "qwen-long"
    }
