"""
LLM 服务模块 - 统一调用各种大模型
"""
import json
import os
from typing import Optional, Dict, Any, List
import httpx

from app.core.config import settings


class LLMService:
    """LLM服务类"""

    def __init__(self, config: Optional[Dict[str, str]] = None):
        """
        初始化LLM服务
        config: 包含 provider, api_key, base_url, model
        """
        self.config = config or {}

    def _get_provider_url(self, provider: str, base_url: Optional[str] = None) -> str:
        """获取API URL"""
        urls = {
            "openai": base_url or "https://api.openai.com/v1/chat/completions",
            "anthropic": base_url or "https://api.anthropic.com/v1/messages",
            "qianwen": base_url or "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation",
            "wenxin": base_url or "https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/ernie-4.0-8k",
            "zhipu": base_url or "https://open.bigmodel.cn/api/paas/v4/chat/completions",
            "moonshot": base_url or "https://api.moonshot.cn/v1/chat/completions",
        }
        return urls.get(provider, base_url or "")

    async def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4000
    ) -> str:
        """
        调用LLM生成内容

        Args:
            prompt: 用户提示词
            system_prompt: 系统提示词
            model: 模型名称（可选）
            temperature: 温度参数
            max_tokens: 最大token数

        Returns:
            生成的文本内容
        """
        import logging
        logger = logging.getLogger(__name__)

        provider = self.config.get("provider", "qianwen")
        api_key = self.config.get("api_key", "")
        base_url = self.config.get("base_url")
        model = model or self.config.get("model", "qwen-max")

        logger.warning(f"=== LLMService.generate ===")
        logger.warning(f"provider: {provider}")
        logger.warning(f"api_key: {'已设置' if api_key else '空'}")
        logger.warning(f"base_url: {base_url}")
        logger.warning(f"model: {model}")

        if not api_key:
            raise ValueError("API Key未配置")

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        try:
            if provider == "openai":
                return await self._call_openai(headers, model, messages, temperature, max_tokens)
            elif provider == "anthropic":
                return await self._call_anthropic(headers, model, messages, temperature, max_tokens)
            elif provider == "qianwen":
                return await self._call_qianwen(headers, model, messages, temperature, max_tokens)
            elif provider == "moonshot":
                return await self._call_moonshot(headers, model, messages, temperature, max_tokens)
            elif provider == "custom" and base_url:
                # custom provider直接使用配置的base_url，不做任何处理
                logger.warning(f"custom provider 直接调用 URL: {base_url}")
                return await self._call_openaiCompatible(headers, base_url, model, messages, temperature, max_tokens)
            elif base_url:
                # 其他 provider 如果配置了 base_url，也直接使用
                logger.warning(f"其他 provider 带 base_url 直接调用: {base_url}")
                return await self._call_openaiCompatible(headers, base_url, model, messages, temperature, max_tokens)
            else:
                # 默认使用OpenAI兼容格式
                return await self._call_openai(headers, model, messages, temperature, max_tokens)
        except Exception as e:
            raise RuntimeError(f"LLM调用失败: {str(e)}")

    async def _call_openai(self, headers: Dict, model: str, messages: List, temperature: float, max_tokens: int) -> str:
        """调用OpenAI兼容API"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers=headers,
                json={
                    "model": model,
                    "messages": messages,
                    "temperature": temperature,
                    "max_tokens": max_tokens
                },
                timeout=120.0
            )
            if response.status_code != 200:
                raise RuntimeError(f"API返回错误: {response.text}")
            result = response.json()
            return result["choices"][0]["message"]["content"]

    async def _call_anthropic(self, headers: Dict, model: str, messages: List, temperature: float, max_tokens: int) -> str:
        """调用Anthropic API"""
        headers["x-api-key"] = headers.pop("Authorization", "").replace("Bearer ", "")
        headers["anthropic-version"] = "2023-06-01"

        # 转换消息格式
        system_msg = None
        for msg in messages:
            if msg["role"] == "system":
                system_msg = msg["content"]
                break

        user_msg = next((msg["content"] for msg in messages if msg["role"] == "user"), "")

        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers=headers,
                json={
                    "model": model,
                    "system": system_msg,
                    "messages": [{"role": "user", "content": user_msg}],
                    "temperature": temperature,
                    "max_tokens": max_tokens
                },
                timeout=120.0
            )
            if response.status_code != 200:
                raise RuntimeError(f"API返回错误: {response.text}")
            result = response.json()
            return result["content"][0]["text"]

    async def _call_qianwen(self, headers: Dict, model: str, messages: List, temperature: float, max_tokens: int) -> str:
        """调用阿里云通义千问API"""
        import logging
        logger = logging.getLogger(__name__)

        # 调试日志
        logger.warning(f"通义千问API调用 - Model: {model}, Messages: {len(messages)}")
        logger.warning(f"Headers: {headers}")

        async with httpx.AsyncClient() as client:
            # 移除Authorization header，使用不同的认证方式
            headers = {
                "Authorization": f"Bearer {headers.get('Authorization', '').replace('Bearer ', '')}",
                "Content-Type": "application/json"
            }
            response = await client.post(
                "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation",
                headers=headers,
                json={
                    "model": model,
                    "input": {"messages": messages},
                    "parameters": {
                        "temperature": temperature,
                        "max_tokens": max_tokens,
                        "result_format": "message"
                    }
                },
                timeout=120.0
            )
            if response.status_code != 200:
                raise RuntimeError(f"API返回错误: {response.text}")
            result = response.json()
            return result["output"]["choices"][0]["message"]["content"]

    async def _call_moonshot(self, headers: Dict, model: str, messages: List, temperature: float, max_tokens: int) -> str:
        """调用Moonshot API"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.moonshot.cn/v1/chat/completions",
                headers=headers,
                json={
                    "model": model,
                    "messages": messages,
                    "temperature": temperature,
                    "max_tokens": max_tokens
                },
                timeout=120.0
            )
            if response.status_code != 200:
                raise RuntimeError(f"API返回错误: {response.text}")
            result = response.json()
            return result["choices"][0]["message"]["content"]

    def filter_thinking_content(self, text: str) -> str:
        """过滤思考内容"""
        import re
        # 移除XML标签
        text = re.sub(r'<reasoning>.*?</reasoning>', '', text, flags=re.DOTALL)
        text = re.sub(r'<reflection>.*?</reflection>', '', text, flags=re.DOTALL)
        text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL)
        # 移除思考前缀
        text = re.sub(r'^Thoughts:.*?$', '', text, flags=re.MULTILINE)
        text = re.sub(r'^Thinking:.*?$', '', text, flags=re.MULTILINE)
        # 移除"让我分析一下"等开头
        text = re.sub(r'^让我.*?分析.*?：', '', text, flags=re.MULTILINE)
        return text.strip()

    async def _call_openaiCompatible(self, headers: Dict, base_url: str, model: str, messages: List, temperature: float, max_tokens: int) -> str:
        """调用OpenAI兼容API（自定义provider）"""
        import logging
        import os
        logger = logging.getLogger(__name__)
        logger.warning(f"API调用 - URL: {base_url}, Model: {model}")

        # 检查是否是 MiniMax API
        if "minimax" in base_url.lower():
            # MiniMax 特定格式
            logger.warning("检测到 MiniMax API，使用特定格式")
            return await self._call_minimax(headers, base_url, model, messages, temperature, max_tokens)

        # 尝试多个代理地址
        proxies_to_try = [
            os.getenv("HTTP_PROXY"),
            os.getenv("HTTPS_PROXY"),
            "http://127.0.0.1:7890",
            "http://localhost:7890",
            "http://127.0.0.1:17890",
            "http://localhost:17890",
            None  # 无代理
        ]

        last_error = None
        for proxy in proxies_to_try:
            try:
                logger.warning(f"尝试代理: {proxy}")
                async with httpx.AsyncClient(proxies=proxy, timeout=120, http2=False) as client:
                    response = await client.post(
                        base_url,
                        headers=headers,
                        json={
                            "model": model,
                            "messages": messages,
                            "temperature": temperature,
                            "max_tokens": max_tokens
                        }
                    )
                    logger.warning(f"API响应 - Status: {response.status_code}")
                    if response.status_code != 200:
                        raise RuntimeError(f"API返回错误: {response.text}")
                    result = response.json()
                    logger.warning(f"API响应内容: {result}")
                    if "choices" not in result or not result["choices"]:
                        raise RuntimeError(f"API返回格式错误: {result}")
                    return result["choices"][0]["message"]["content"]
            except Exception as e:
                logger.warning(f"代理 {proxy} 失败: {e}")
                last_error = e
                continue

        raise RuntimeError(f"LLM调用失败: {last_error}")

    async def _call_minimax(self, headers: Dict, base_url: str, model: str, messages: List, temperature: float, max_tokens: int) -> str:
        """调用MiniMax API"""
        import logging
        import os
        logger = logging.getLogger(__name__)
        logger.warning(f"MiniMax API调用 - URL: {base_url}, Model: {model}")

        # 从headers中提取api_key
        api_key = headers.get("Authorization", "").replace("Bearer ", "")

        # 尝试多个代理地址
        proxies_to_try = [
            os.getenv("HTTP_PROXY"),
            os.getenv("HTTPS_PROXY"),
            "http://127.0.0.1:17890",
            "http://localhost:17890",
            "http://127.0.0.1:7890",
            "http://localhost:7890",
            None  # 无代理
        ]

        last_error = None
        for proxy in proxies_to_try:
            try:
                logger.warning(f"尝试代理: {proxy}")
                async with httpx.AsyncClient(proxies=proxy, timeout=120, http2=False) as client:
                    response = await client.post(
                        base_url,
                        headers={
                            "Authorization": f"Bearer {api_key}",
                            "Content-Type": "application/json"
                        },
                        json={
                            "model": model,
                            "messages": messages,
                            "temperature": temperature,
                            "max_tokens": max_tokens,
                            "bot_setting": [
                                {
                                    "bot_id": "master_bot",
                                    "bot_name": "BidAI智能投标助手",
                                    "content": "你是一个专业的投标标书编写助手，擅长根据招标文件生成高质量的投标大纲和内容。"
                                }
                            ]
                        }
                    )
                    logger.warning(f"MiniMax API响应 - Status: {response.status_code}")
                    logger.warning(f"MiniMax API响应内容: {response.text[:500]}")
                    if response.status_code != 200:
                        raise RuntimeError(f"API返回错误: {response.text}")
                    result = response.json()
                    logger.warning(f"解析后的响应: {result}")
                    if "choices" in result and result["choices"]:
                        return result["choices"][0]["message"]["content"]
                    elif "reply" in result:
                        return result["reply"]
                    else:
                        raise RuntimeError(f"MiniMax API返回格式错误: {result}")
            except Exception as e:
                logger.warning(f"代理 {proxy} 失败: {e}")
                last_error = e
                continue

        raise RuntimeError(f"LLM调用失败: {last_error}")


# 全局LLM服务实例
llm_service = LLMService()
