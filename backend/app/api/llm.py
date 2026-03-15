from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from typing import Optional, List
import httpx

from app.core.security import get_db, get_current_user, require_super_admin
from app.models import User, LLMConfig
from app.schemas import LLMConfigCreate, LLMConfigUpdate, LLMConfigResponse, UsageType

router = APIRouter(prefix="/llm", tags=["LLM配置"])


@router.get("/check-config", response_model=dict)
async def check_llm_config(
    usage_type: UsageType = UsageType.analysis,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """检查当前用户所属租户是否有可用的LLM配置"""
    from app.utils.llm_config import get_llm_config
    config = await get_llm_config(db, current_user.tenant_id, usage_type)
    
    # 检查是否有 API Key 且不是默认值（如果有的话）
    is_configured = bool(config.get("api_key"))
    
    return {
        "code": 0,
        "data": {
            "is_configured": is_configured,
            "usage_type": usage_type
        }
    }


@router.get("", response_model=dict)
async def get_llm_configs(
    tenant_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """获取LLM配置（超管可查看所有，普通用户不可见）"""
    if current_user.role != "super_admin":
        raise HTTPException(status_code=403, detail="需要超级管理员权限")

    # 如果指定租户ID，只返回该租户的配置
    if tenant_id:
        # 先查租户独立配置
        result = await db.execute(
            select(LLMConfig).where(LLMConfig.tenant_id == tenant_id)
        )
        configs = result.scalars().all()

        if not configs:
            # 如果没有独立配置，返回全局默认
            result = await db.execute(
                select(LLMConfig).where(LLMConfig.tenant_id.is_(None))
            )
            configs = result.scalars().all()

        return {
            "code": 0,
            "data": {
                "tenant_id": tenant_id,
                "configs": [LLMConfigResponse.model_validate(c) for c in configs]
            }
        }

    # 返回全局默认配置和所有租户独立配置
    result = await db.execute(select(LLMConfig).where(LLMConfig.tenant_id.is_(None)))
    global_configs = result.scalars().all()

    result = await db.execute(select(LLMConfig).where(LLMConfig.tenant_id.isnot(None)))
    tenant_configs = result.scalars().all()

    return {
        "code": 0,
        "data": {
            "global": [LLMConfigResponse.model_validate(c) for c in global_configs],
            "tenants": [LLMConfigResponse.model_validate(c) for c in tenant_configs]
        }
    }


@router.put("/global", response_model=dict)
async def update_global_llm_config(
    config_data: LLMConfigCreate,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db)
):
    """更新全局默认LLM配置"""
    # 查找现有配置
    result = await db.execute(
        select(LLMConfig).where(
            LLMConfig.tenant_id.is_(None),
            LLMConfig.usage_type == config_data.usage_type
        )
    )
    config = result.scalar_one_or_none()

    if config:
        config.provider = config_data.provider
        config.base_url = config_data.base_url
        # 只有当传入新的api_key时才更新，否则保持原值
        if config_data.api_key is not None and config_data.api_key != '':
            config.api_key_encrypted = config_data.api_key
        config.model = config_data.model
    else:
        config = LLMConfig(
            tenant_id=None,
            provider=config_data.provider,
            base_url=config_data.base_url,
            api_key_encrypted=config_data.api_key or '',
            model=config_data.model,
            usage_type=config_data.usage_type
        )
        db.add(config)

    await db.commit()

    return {"code": 0, "message": "全局配置已更新", "data": None}


@router.put("/tenant/{tenant_id}", response_model=dict)
async def update_tenant_llm_config(
    tenant_id: int,
    config_data: LLMConfigCreate,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db)
):
    """更新租户独立LLM配置"""
    # 查找现有配置
    result = await db.execute(
        select(LLMConfig).where(
            LLMConfig.tenant_id == tenant_id,
            LLMConfig.usage_type == config_data.usage_type
        )
    )
    config = result.scalar_one_or_none()

    if config:
        config.provider = config_data.provider
        config.base_url = config_data.base_url
        # 只有当传入新的api_key时才更新，否则保持原值
        if config_data.api_key is not None and config_data.api_key != '':
            config.api_key_encrypted = config_data.api_key
        config.model = config_data.model
    else:
        config = LLMConfig(
            tenant_id=tenant_id,
            provider=config_data.provider,
            base_url=config_data.base_url,
            api_key_encrypted=config_data.api_key or '',
            model=config_data.model,
            usage_type=config_data.usage_type
        )
        db.add(config)

    await db.commit()

    return {"code": 0, "message": "租户配置已更新", "data": None}


@router.delete("/tenant/{tenant_id}", response_model=dict)
async def delete_tenant_llm_config(
    tenant_id: int,
    usage_type: UsageType,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db)
):
    """删除租户独立配置（恢复使用全局默认）"""
    result = await db.execute(
        select(LLMConfig).where(
            LLMConfig.tenant_id == tenant_id,
            LLMConfig.usage_type == usage_type
        )
    )
    config = result.scalar_one_or_none()

    if not config:
        raise HTTPException(status_code=404, detail="配置不存在")

    await db.delete(config)
    await db.commit()

    return {"code": 0, "message": "租户配置已删除，将使用全局默认", "data": None}


@router.post("/test")
async def test_llm_connection(
    provider: str,
    api_key: str,
    model: str,
    base_url: Optional[str] = None
):
    """测试LLM连接"""
    import logging
    import os
    import httpx
    import os
    logger = logging.getLogger(__name__)

    try:
        if not api_key:
            raise HTTPException(status_code=400, detail="API Key不能为空")

        if not base_url:
            raise HTTPException(status_code=400, detail="Base URL不能为空")

        chat_url = base_url
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        test_payload = {
            "model": model,
            "messages": [{"role": "user", "content": "你好"}],
            "max_tokens": 10
        }

        # 获取环境变量中的代理
        env_proxy = os.getenv("HTTP_PROXY") or os.getenv("HTTPS_PROXY") or os.getenv("http_proxy") or os.getenv("https_proxy")

        # 尝试方案列表：1. 环境代理(如有)  2. 直连
        proxy_attempts = []
        if env_proxy:
            proxy_attempts.append(env_proxy)
        proxy_attempts.append(None) # 最后尝试直连

        last_error = ""
        for proxy in proxy_attempts:
            try:
                client_kwargs = {"follow_redirects": True, "timeout": 15.0}
                if proxy:
                    client_kwargs["proxy"] = proxy
                
                logger.warning(f"正在尝试连接 ({'直连' if not proxy else f'代理: {proxy}'})...")
                
                async with httpx.AsyncClient(**client_kwargs) as client:
                    response = await client.post(chat_url, headers=headers, json=test_payload)
                    if response.status_code == 200:
                        logger.warning(f"连接成功！使用的是: {'直连' if not proxy else proxy}")
                        return {"code": 0, "message": "连接成功", "data": {"method": "direct" if not proxy else "proxy"}}
                    else:
                        # 如果是 401/404 等明确的业务错误，说明网络通了但配置不对，直接返回
                        error_msg = response.text[:200]
                        return {"code": 400, "message": f"网络已通但API报错: {error_msg}", "data": None}
            except Exception as e:
                last_error = str(e)
                logger.warning(f"该方式失败: {last_error}")
                continue
        
        raise HTTPException(status_code=500, detail=f"所有连接方式均失败。最后一次错误: {last_error}")

    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"测试失败: {str(e)}")
