"""
简单限流工具 - 基于内存实现
生产环境建议使用 Redis 实现分布式限流
"""
import time
from collections import defaultdict
from functools import wraps
from fastapi import HTTPException, Request

# 简单内存存储
_request_counts = defaultdict(list)
_cleanup_time = time.time()


def _cleanup_old_requests():
    """清理超过1分钟的请求记录"""
    global _cleanup_time
    current_time = time.time()

    # 每分钟清理一次
    if current_time - _cleanup_time > 60:
        _cleanup_time = current_time
        one_minute_ago = current_time - 60
        for key in list(_request_counts.keys()):
            _request_counts[key] = [t for t in _request_counts[key] if t > one_minute_ago]
            if not _request_counts[key]:
                del _request_counts[key]


def check_rate_limit(key: str, limit: int = 60) -> bool:
    """
    检查请求是否超过限流阈值

    Args:
        key: 限流标识（通常是 IP 地址）
        limit: 每分钟最大请求次数

    Returns:
        True: 未超过限流
        False: 超过限流
    """
    _cleanup_old_requests()

    current_time = time.time()
    one_minute_ago = current_time - 60

    # 清理该 key 的旧请求记录
    _request_counts[key] = [t for t in _request_counts[key] if t > one_minute_ago]

    # 检查是否超过限流
    if len(_request_counts[key]) >= limit:
        return False

    # 记录本次请求
    _request_counts[key].append(current_time)
    return True


def rate_limit_dependency(limit: int = 60, param_name: str = "ip"):
    """
    FastAPI 依赖项，用于限流检查

    Args:
        limit: 每分钟最大请求次数
        param_name: 从请求中获取限流标识的参数名

    Usage:
        @router.get("/items")
        async def get_items(request: Request, _: None = Depends(rate_limit_dependency(60, "ip"))):
            ...
    """
    async def check_rate(request: Request):
        # 获取客户端 IP
        client_ip = request.client.host if request.client else "unknown"

        # 如果有代理，取真实 IP
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            client_ip = forwarded_for.split(",")[0].strip()

        if not check_rate_limit(client_ip, limit):
            raise HTTPException(
                status_code=429,
                detail=f"请求过于频繁，请稍后再试（{limit}次/分钟）"
            )

    return check_rate
