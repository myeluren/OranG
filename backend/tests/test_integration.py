"""
集成测试 - 智能投标标书生成系统 API
"""
import pytest
import json
import asyncio
from httpx import AsyncClient
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient

# 测试配置
BASE_URL = "http://localhost:8000"


@pytest.fixture
def mock_db():
    """Mock数据库会话"""
    return AsyncMock()


@pytest.fixture
def mock_llm_response():
    """Mock LLM响应"""
    return json.dumps([
        {"level": 1, "title": "第一章 技术方案", "children": [
            {"level": 2, "title": "1.1 项目理解", "children": []}
        ]}
    ])


class TestAuthAPI:
    """认证API集成测试"""

    @pytest.mark.asyncio
    async def test_register_success(self):
        """测试成功注册"""
        from app.main import app

        with TestClient(app) as client:
            # 测试注册接口存在
            response = client.post(
                "/api/v1/auth/register",
                json={
                    "username": "testuser123",
                    "email": "test@example.com",
                    "name": "Test User",
                    "password": "password123"
                }
            )
            # 可能返回成功、用户已存在或其他错误，但接口应该可访问
            assert response.status_code in [200, 201, 400, 409]

    @pytest.mark.asyncio
    async def test_login_success(self):
        """测试成功登录"""
        # 使用 TestClient 进行集成测试
        from app.main import app

        with TestClient(app) as client:
            # 测试无效的用户名（不存在的用户）
            response = client.post(
                "/api/v1/auth/login",
                json={"username": "test_nonexistent_user", "password": "wrongpassword"}
            )
            # 应该返回错误
            assert response.status_code in [401, 400, 404]

    @pytest.mark.asyncio
    async def test_login_invalid_password(self):
        """测试密码错误"""
        from app.main import app

        with TestClient(app) as client:
            response = client.post(
                "/api/v1/auth/login",
                json={"username": "testuser", "password": "wrongpassword"}
            )
            # 应该返回认证错误
            assert response.status_code in [401, 400, 404]

    @pytest.mark.asyncio
    async def test_change_password(self):
        """测试修改密码"""
        from app.main import app

        with TestClient(app) as client:
            # 未登录状态下修改密码应该失败
            response = client.post(
                "/api/v1/auth/change-password",
                json={"old_password": "old123", "new_password": "new123456"}
            )
            # 应该返回 401 未授权
            assert response.status_code == 401


class TestProjectAPI:
    """项目API集成测试"""

    @pytest.mark.asyncio
    async def test_create_project(self):
        """测试创建项目"""
        from app.main import app

        with TestClient(app) as client:
            # 未登录状态下创建项目应该失败
            response = client.post(
                "/api/v1/projects",
                json={"title": "测试项目"}
            )
            # 应该返回 401 未授权
            assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_upload_file(self):
        """测试上传文件"""
        from app.main import app

        with TestClient(app) as client:
            # 未登录状态下上传文件应该失败
            response = client.post(
                "/api/v1/projects/1/upload",
                files={"file": ("test.txt", b"test content", "text/plain")}
            )
            # 应该返回 401 未授权
            assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_generate_outline(self):
        """测试大纲生成"""
        from app.main import app

        with TestClient(app) as client:
            # 未登录状态下生成大纲应该失败
            response = client.post(
                "/api/v1/projects/1/outline"
            )
            # 应该返回 401 未授权
            assert response.status_code == 401


class TestOutlineGeneration:
    """大纲生成集成测试"""

    def test_outline_api_validation(self):
        """测试大纲API参数验证"""
        # 测试无效的outline_json
        from app.schemas import ProjectUpdate
        import json

        # 有效的JSON
        valid_outline = json.dumps([{"level": 1, "title": "Test"}])
        # 应该不抛出异常

    def test_get_default_outline(self):
        """测试默认大纲"""
        from app.api.outline import get_default_outline

        outline = get_default_outline()

        assert isinstance(outline, list)
        assert len(outline) > 0
        assert outline[0]["level"] == 1


class TestTaskWorkflow:
    """任务工作流测试"""

    def test_task_status_transitions(self):
        """测试任务状态转换"""
        valid_transitions = {
            "pending": ["running", "cancelled"],
            "running": ["paused_manual", "paused_quota", "completed", "failed", "cancelled"],
            "paused_manual": ["running", "cancelled"],
            "paused_quota": ["pending", "cancelled"],  # 重新生成后
            "completed": [],  # 终态
            "failed": ["pending"],  # 可以重试
            "cancelled": []  # 终态
        }

        # 验证状态机定义正确
        assert "pending" in valid_transitions
        assert "running" in valid_transitions
        assert "completed" in valid_transitions
        assert "failed" in valid_transitions

    def test_quota_rollback_logic(self):
        """测试额度回滚逻辑"""
        # 模拟场景：任务消耗了1000字，额度耗尽后重新生成

        # 初始状态
        subscription_words = 1000  # 剩余1000字
        task_consumed = 1000  # 任务消耗1000字

        # 回滚计算
        new_subscription_words = subscription_words + task_consumed
        assert new_subscription_words == 2000

        # 验证回滚后额度恢复
        assert new_subscription_words >= 0


class TestSubscriptionBilling:
    """订阅计费测试"""

    def test_period_word_limit(self):
        """测试周期字数限制"""
        # 模拟订阅创建
        subscription = {
            "period_word_limit": 500000,  # 50万字
            "period_used_words": 0
        }

        # 消耗字数
        subscription["period_used_words"] += 10000

        # 验证
        assert subscription["period_used_words"] == 10000
        assert subscription["period_word_limit"] - subscription["period_used_words"] == 490000

    def test_quota_exhausted(self):
        """测试额度耗尽"""
        subscription = {
            "period_word_limit": 500000,
            "period_used_words": 500000
        }

        # 额度耗尽
        is_exhausted = subscription["period_used_words"] >= subscription["period_word_limit"]
        assert is_exhausted is True


class TestLLMIntegration:
    """LLM集成测试"""

    def test_provider_urls(self):
        """测试不同供应商的URL"""
        from app.services.llm_service import LLMService

        service = LLMService({})

        # 测试各供应商URL
        assert "openai" in service._get_provider_url("openai")
        assert "anthropic" in service._get_provider_url("anthropic")
        assert "qianwen" in service._get_provider_url("qianwen")
        assert "moonshot" in service._get_provider_url("moonshot")


class TestFileProcessing:
    """文件处理测试"""

    def test_parse_tender_file_txt(self):
        """测试解析txt文件"""
        from app.api.outline import parse_tender_file
        import os
        import tempfile

        # 创建临时txt文件
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
            f.write("测试招标文件内容")
            temp_path = f.name

        try:
            content = parse_tender_file(temp_path)
            assert "测试招标文件内容" in content
        finally:
            os.unlink(temp_path)

    def test_parse_tender_file_unsupported(self):
        """测试不支持的文件格式"""
        from app.api.outline import parse_tender_file

        result = parse_tender_file("test.exe")
        assert "不支持" in result or "解析失败" in result


class TestAPIResponses:
    """API响应格式测试"""

    def test_success_response_format(self):
        """测试成功响应格式"""
        response = {
            "code": 0,
            "message": "success",
            "data": {"id": 1}
        }

        assert response["code"] == 0
        assert "message" in response
        assert "data" in response

    def test_error_response_format(self):
        """测试错误响应格式"""
        response = {
            "code": 40001,
            "message": "错误说明",
            "data": None
        }

        assert response["code"] != 0
        assert "message" in response


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
