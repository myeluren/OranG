from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.security import get_db, get_current_user
from app.models import User, Project, GenerationTask, TaskCheckpoint
from app.services.export_docx import export_to_word

router = APIRouter(prefix="/tasks", tags=["文档导出"])


@router.get("/{task_id}/export/docx")
async def export_task_to_word(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """导出任务为Word文档"""
    # 获取任务
    result = await db.execute(select(GenerationTask).where(GenerationTask.id == task_id))
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    # 权限检查
    if current_user.role == "user" and task.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权限")

    if current_user.role == "tenant_admin" and task.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=403, detail="无权限")

    # 检查任务状态
    if task.status != "completed":
        raise HTTPException(status_code=400, detail="任务未完成，无法导出")

    # 获取项目
    result = await db.execute(select(Project).where(Project.id == task.project_id))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    # 获取所有章节内容
    result = await db.execute(
        select(TaskCheckpoint).where(
            TaskCheckpoint.task_id == task_id
        ).order_by(TaskCheckpoint.chapter_index)
    )
    checkpoints = result.scalars().all()

    if not checkpoints:
        raise HTTPException(status_code=400, detail="没有生成内容可导出")

    # 转换为字典
    checkpoint_list = [
        {
            "chapter_title": cp.chapter_title,
            "content": cp.content,
            "word_count": cp.word_count
        }
        for cp in checkpoints
    ]

    # 格式配置
    format_config = {
        "target_pages": project.target_pages,
        "words_per_page": project.words_per_page
    }

    # 生成Word文档
    try:
        doc_bytes = export_to_word(
            project_title=project.title,
            outline_json=project.outline_json,
            checkpoints=checkpoint_list,
            format_config=format_config
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"文档生成失败: {str(e)}")

    # 生成文件名
    filename = f"{project.title}-{datetime.now().strftime('%Y%m%d')}.docx"

    # 返回文件流
    return StreamingResponse(
        io.BytesIO(doc_bytes),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )


import io
from datetime import datetime
