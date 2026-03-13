import httpx

base_url = "https://api.minimaxi.com/v1/text/chatcompletion_v2"
api_key = "sk-cp-CLss4Wz8g0dIaxnwKoqY0aCAuLd1-HHwRVGiz0n7xxAwVVGOgpiqExG7tOo3HoMOKPRscZNA51PCQB-vxy61vdTA3qXykfn8nBF6jr_XeVxrPBFSQX-63qU"
model = "MiniMax-M2.5"

headers = {
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json"
}

payload = {
    "model": model,
    "messages": [{"role": "user", "content": "你好"}],
    "max_tokens": 10
}

proxy = "http://127.0.0.1:17890"
print(f"使用代理: {proxy}")

try:
    # 尝试 httpx 的 HTTP/1.1 方式
    async def test():
        async with httpx.AsyncClient(proxies=proxy, http2=False, timeout=30) as client:
            response = await client.post(base_url, headers=headers, json=payload)
            print(f"状态: {response.status_code}")
            print(f"响应: {response.text[:200]}")

    import asyncio
    asyncio.run(test())
except Exception as e:
    print(f"错误: {e}")
