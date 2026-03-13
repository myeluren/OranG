"""
内容生成任务模块 - 使用Celery异步生成标书内容
"""
from typing import List, Dict, Any
import json


class ContentGenerator:
    """内容生成器"""

    def __init__(self, llm_service, config: Dict[str, Any]):
        self.llm = llm_service
        self.config = config

    def extract_chapters(self, outline_json: str) -> List[Dict[str, Any]]:
        """从大纲JSON中提取所有需要生成的章节"""
        try:
            outline = json.loads(outline_json)
            chapters = []

            def traverse(node, path=""):
                if node.get("level") == 1:
                    path = node.get("title", "")
                elif node.get("level") == 2:
                    path = node.get("title", "")
                elif node.get("level") == 3:
                    path = node.get("title", "")

                if node.get("children"):
                    for child in node["children"]:
                        traverse(child, path)

                # 只返回二级和三级标题作为生成章节
                if node.get("level") in [2, 3]:
                    chapters.append({
                        "title": node.get("title", ""),
                        "level": node.get("level", 2),
                        "parent": path
                    })

            for item in outline:
                traverse(item)

            return chapters
        except:
            return []

    async def generate_chapter(
        self,
        chapter: Dict[str, Any],
        tender_content: str,
        target_words: int,
        format_config: Dict[str, Any]
    ) -> str:
        """生成单个章节内容"""

        system_prompt = f"""你是专业的投标文件撰写专家。请根据以下要求撰写标书章节内容。

要求：
1. 字数要求：约{target_words}字，允许±10%误差
2. 语言风格：专业、严谨、符合投标文件规范
3. 内容要求：详实、具体、可操作性强
4. 格式要求：层次分明、条理清晰

请直接输出正文内容，不要输出标题和思考过程。"""

        user_prompt = f"""招标文件主要内容：
{tender_content[:20000]}

需要撰写的章节：{chapter['title']}

所属章节：{chapter.get('parent', '')}

目标字数：约{target_words}字

请撰写该章节的完整内容："""

        try:
            content = await self.llm.generate(
                prompt=user_prompt,
                system_prompt=system_prompt,
                temperature=0.7,
                max_tokens=target_words * 2
            )

            # 过滤思考内容
            content = self.llm.filter_thinking_content(content)

            return content

        except Exception as e:
            raise RuntimeError(f"章节生成失败: {str(e)}")

    def calculate_words_per_chapter(
        self,
        total_words: int,
        chapter_count: int
    ) -> int:
        """计算每个章节的目标字数"""
        if chapter_count <= 0:
            return total_words
        return total_words // chapter_count


class TaskService:
    """任务服务 - 管理内容生成任务"""

    def __init__(self, db_session):
        self.db = db_session

    async def create_generation_task(
        self,
        project_id: int,
        tenant_id: int,
        user_id: int
    ):
        """创建生成任务"""
        from app.models.task import GenerationTask
        from app.models.project import Project

        # 获取项目
        result = await self.db.execute(
            select(Project).where(Project.id == project_id)
        )
        project = result.scalar_one_or_none()

        if not project:
            raise ValueError("项目不存在")

        if not project.outline_json:
            raise ValueError("项目没有大纲")

        if project.status not in ["outline_generated", "format_set"]:
            raise ValueError("项目状态不正确")

        # 提取章节
        generator = ContentGenerator(None, {})
        chapters = generator.extract_chapters(project.outline_json)

        if not chapters:
            raise ValueError("大纲没有可生成的章节")

        # 计算字数分配
        total_words = project.target_pages * project.words_per_page
        words_per_chapter = generator.calculate_words_per_chapter(total_words, len(chapters))

        # 创建任务
        task = GenerationTask(
            project_id=project_id,
            tenant_id=tenant_id,
            user_id=user_id,
            status="pending",
            total_chapters=len(chapters),
            completed_chapters=0,
            total_words_generated=0
        )
        self.db.add(task)

        # 更新项目状态
        project.status = "generating"

        await self.db.commit()
        await self.db.refresh(task)

        return task, chapters, words_per_chapter

    async def start_generation(
        self,
        task_id: int,
        llm_service,
        subscription_id: int
    ):
        """开始执行生成任务"""
        from app.models.task import GenerationTask, TaskCheckpoint
        from app.models.project import Project
        from app.models.subscription import Subscription
        from app.models.word_transaction import WordTransaction

        # 获取任务
        result = await self.db.execute(
            select(GenerationTask).where(GenerationTask.id == task_id)
        )
        task = result.scalar_one_or_none()

        if not task or task.status != "pending":
            return

        # 获取项目
        result = await self.db.execute(
            select(Project).where(Project.id == task.project_id)
        )
        project = result.scalar_one_or_none()

        if not project:
            task.status = "failed"
            task.error_message = "项目不存在"
            await self.db.commit()
            return

        # 解析招标文件
        from app.api.outline import parse_tender_file
        tender_content = parse_tender_file(project.tender_file_url)

        if not tender_content:
            task.status = "failed"
            task.error_message = "招标文件解析失败"
            await self.db.commit()
            return

        # 获取订阅
        result = await self.db.execute(
            select(Subscription).where(Subscription.id == subscription_id)
        )
        subscription = result.scalar_one_or_none()

        # 创建生成器
        generator = ContentGenerator(llm_service, {})
        chapters = generator.extract_chapters(project.outline_json)
        total_words = project.target_pages * project.words_per_page
        words_per_chapter = generator.calculate_words_per_chapter(total_words, len(chapters))

        task.status = "running"

        # 逐章生成
        for i, chapter in enumerate(chapters):
            result = await self.db.execute(
                select(GenerationTask).where(GenerationTask.id == task.id)
            )
            latest_task = result.scalar_one_or_none()
            if not latest_task:
                return
            task = latest_task

            if task.status == "cancelled":
                if project.status == "generating":
                    project.status = "format_set"
                    await self.db.commit()
                break

            # 检查是否暂停
            while task.status == "paused_manual":
                await asyncio.sleep(1)

            # 检查额度
            if subscription and subscription.period_used_words >= subscription.period_word_limit:
                task.status = "paused_quota"
                task.pause_reason = "quota_exhausted"
                await self.db.commit()
                return

            try:
                # 生成章节
                content = await generator.generate_chapter(
                    chapter=chapter,
                    tender_content=tender_content,
                    target_words=words_per_chapter,
                    format_config={}
                )

                word_count = len(content)

                # 保存Checkpoint
                checkpoint = TaskCheckpoint(
                    task_id=task.id,
                    chapter_index=i,
                    chapter_title=chapter["title"],
                    content=content,
                    word_count=word_count
                )
                self.db.add(checkpoint)

                # 更新统计
                task.completed_chapters += 1
                task.total_words_generated += word_count

                # 扣减字数
                if subscription:
                    subscription.period_used_words += word_count

                    # 记录流水
                    transaction = WordTransaction(
                        tenant_id=task.tenant_id,
                        subscription_id=subscription.id,
                        user_id=task.user_id,
                        task_id=task.id,
                        type="consume",
                        amount=word_count,
                        balance_after=subscription.period_word_limit - subscription.period_used_words,
                        remark=f"生成章节: {chapter['title']}"
                    )
                    self.db.add(transaction)

                await self.db.commit()

            except Exception as e:
                task.error_message = f"章节 {chapter['title']} 生成失败: {str(e)}"
                await self.db.commit()

                # 重试逻辑可以在这里添加

        # 完成任务
        if task.status == "running":
            task.status = "completed"
            project.status = "completed"

            await self.db.commit()


import asyncio
