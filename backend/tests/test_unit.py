"""
单元测试 - 智能投标标书生成系统
"""
import pytest
import json
import asyncio
from unittest.mock import Mock, AsyncMock, patch
from datetime import datetime, timedelta

# 测试配置
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


class TestLLMService:
    """测试LLM服务"""

    def test_filter_thinking_content(self):
        """测试思考内容过滤"""
        from app.services.llm_service import LLMService

        service = LLMService()

        # 测试XML标签过滤
        text1 = "<think>让我思考一下这个问题</think>这是正文内容"
        result1 = service.filter_thinking_content(text1)
        assert "<think>" not in result1
        assert "</think>" not in result1
        assert "这是正文内容" in result1

        # 测试思考前缀过滤
        text2 = "Thoughts: 这是一些思考内容\n这是正文"
        result2 = service.filter_thinking_content(text2)
        assert "Thoughts:" not in result2
        assert "这是正文" in result2

    def test_llm_service_init(self):
        """测试LLM服务初始化"""
        from app.services.llm_service import LLMService

        config = {
            "provider": "openai",
            "api_key": "test-key",
            "model": "gpt-4",
            "base_url": None
        }
        service = LLMService(config)

        assert service.config == config
        assert service.config["provider"] == "openai"
        assert service.config["api_key"] == "test-key"


class TestContentGenerator:
    """测试内容生成器"""

    def test_extract_chapters(self):
        """测试章节提取"""
        from app.services.content_generator import ContentGenerator

        generator = ContentGenerator(None, {})

        outline_json = json.dumps([
            {
                "level": 1,
                "title": "第一章 技术方案",
                "children": [
                    {
                        "level": 2,
                        "title": "1.1 项目理解",
                        "children": [
                            {"level": 3, "title": "1.1.1 需求分析", "children": []}
                        ]
                    },
                    {"level": 2, "title": "1.2 技术路线", "children": []}
                ]
            },
            {
                "level": 1,
                "title": "第二章 项目管理",
                "children": [
                    {"level": 2, "title": "2.1 组织架构", "children": []}
                ]
            }
        ])

        chapters = generator.extract_chapters(outline_json)

        assert len(chapters) == 3  # 2个二级 + 1个三级
        assert any(c["title"] == "1.1 项目理解" for c in chapters)
        assert any(c["title"] == "1.1.1 需求分析" for c in chapters)
        assert any(c["title"] == "1.2 技术路线" for c in chapters)

    def test_calculate_words_per_chapter(self):
        """测试字数计算"""
        from app.services.content_generator import ContentGenerator

        generator = ContentGenerator(None, {})

        # 10000字，5章 = 每章2000字
        words = generator.calculate_words_per_chapter(10000, 5)
        assert words == 2000

        # 0章节应该返回全部字数
        words = generator.calculate_words_per_chapter(10000, 0)
        assert words == 10000


class TestExportDocx:
    """测试Word导出"""

    def test_export_basic(self):
        """测试基本导出"""
        from app.services.export_docx import export_to_word

        outline = json.dumps([
            {"level": 1, "title": "第一章 技术方案", "children": [
                {"level": 2, "title": "1.1 项目理解", "children": []}
            ]}
        ])

        checkpoints = [
            {"chapter_title": "1.1 项目理解", "content": "这是测试内容"}
        ]

        # 导出应该成功
        doc_bytes = export_to_word(
            project_title="测试项目",
            outline_json=outline,
            checkpoints=checkpoints
        )

        assert doc_bytes is not None
        assert len(doc_bytes) > 0
        # 验证是zip文件（docx本质是zip）
        assert doc_bytes[:2] == b'PK'


class TestSchemas:
    """测试数据模型"""

    def test_user_create_schema(self):
        """测试用户创建Schema"""
        from app.schemas import UserCreate, LoginRequest

        # 测试用户名验证
        with pytest.raises(Exception):
            UserCreate(
                username="ab",  # 少于3位
                email="test@test.com",
                name="测试用户",
                password="password123"
            )

    def test_login_request(self):
        """测试登录请求"""
        from app.schemas import LoginRequest

        req = LoginRequest(username="admin", password="password123")
        assert req.username == "admin"
        assert req.password == "password123"


class TestSecurity:
    """测试安全功能"""

    def test_password_hash(self):
        """测试密码哈希"""
        from app.core.security import verify_password, get_password_hash

        password = "TestPassword123"
        hashed = get_password_hash(password)

        assert verify_password(password, hashed)
        assert not verify_password("WrongPassword", hashed)

    def test_create_access_token(self):
        """测试Token创建"""
        from app.core.security import create_access_token, decode_token

        token = create_access_token({"sub": 1, "tenant_id": 1, "role": "user"})
        payload = decode_token(token)

        assert payload is not None
        assert payload["sub"] == 1
        assert payload["tenant_id"] == 1
        assert payload["role"] == "user"
        assert payload["type"] == "access"

    def test_create_refresh_token(self):
        """测试刷新Token创建"""
        from app.core.security import create_refresh_token, decode_token

        token = create_refresh_token({"sub": 1})
        payload = decode_token(token)

        assert payload is not None
        assert payload["sub"] == 1
        assert payload["type"] == "refresh"


class TestModels:
    """测试数据模型"""

    def test_user_model(self):
        """测试用户模型"""
        from app.models.user import User

        # 验证字段存在
        assert hasattr(User, "id")
        assert hasattr(User, "username")
        assert hasattr(User, "email")
        assert hasattr(User, "password_hash")
        assert hasattr(User, "name")
        assert hasattr(User, "role")
        assert hasattr(User, "status")

    def test_project_model(self):
        """测试项目模型"""
        from app.models.project import Project

        assert hasattr(Project, "id")
        assert hasattr(Project, "title")
        assert hasattr(Project, "outline_json")
        assert hasattr(Project, "target_pages")
        assert hasattr(Project, "words_per_page")
        assert hasattr(Project, "status")

    def test_task_model(self):
        """测试任务模型"""
        from app.models.task import GenerationTask

        assert hasattr(GenerationTask, "id")
        assert hasattr(GenerationTask, "status")
        assert hasattr(GenerationTask, "total_chapters")
        assert hasattr(GenerationTask, "completed_chapters")
        assert hasattr(GenerationTask, "total_words_generated")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
