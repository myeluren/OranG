'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { projectsAPI, tasksAPI, contentAPI } from '@/lib/api'

// 类型定义
interface OutlineNode {
  id: string
  level: number
  title: string
  children: OutlineNode[]
}

interface Chapter {
  chapter_index: number
  chapter_title: string
  content: string
  word_count: number
}

export default function EditorPage() {
  const router = useRouter()
  const params = useParams()
  const projectId = parseInt(params.id as string)

  const [project, setProject] = useState<any>(null)
  const [outline, setOutline] = useState<OutlineNode[]>([])
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)

  // 左侧大纲导航状态
  const [activeChapterIndex, setActiveChapterIndex] = useState(0)

  // 编辑器内容
  const [editContent, setEditContent] = useState('')

  // 字数统计
  const [currentWords, setCurrentWords] = useState(0)
  const [totalWords, setTotalWords] = useState(0)

  // 解析大纲获取章节列表
  const parseOutline = (outlineJson: string): OutlineNode[] => {
    try {
      return JSON.parse(outlineJson)
    } catch {
      return []
    }
  }

  // 提取所有章节（扁平化大纲）
  const extractChapters = (nodes: OutlineNode[]): { title: string; level: number }[] => {
    const chapters: { title: string; level: number }[] = []
    const traverse = (items: OutlineNode[]) => {
      items.forEach(node => {
        if (node.level === 2 || node.level === 3) {
          chapters.push({ title: node.title, level: node.level })
        }
        if (node.children && node.children.length > 0) {
          traverse(node.children)
        }
      })
    }
    traverse(nodes)
    return chapters
  }

  useEffect(() => {
    fetchProjectData()
  }, [projectId])

  // 当切换章节时更新编辑器内容
  useEffect(() => {
    if (chapters.length > 0 && activeChapterIndex >= 0 && activeChapterIndex < chapters.length) {
      setEditContent(chapters[activeChapterIndex].content || '')
      setCurrentWords(chapters[activeChapterIndex].word_count || 0)
    }
  }, [activeChapterIndex, chapters])

  // 计算总字数
  useEffect(() => {
    const total = chapters.reduce((sum, ch) => sum + (ch.word_count || 0), 0)
    setTotalWords(total)
  }, [chapters])

  const fetchProjectData = async () => {
    try {
      // 获取项目信息
      const projectRes = await projectsAPI.getProject(projectId)
      const projectData = projectRes.data
      setProject(projectData)

      // 解析大纲
      if (projectData.outline_json) {
        const parsed = parseOutline(projectData.outline_json)
        setOutline(parsed)
      }

      // 获取内容
      const contentRes = await contentAPI.getProjectContent(projectId)
      if (contentRes.data.data?.chapters) {
        setChapters(contentRes.data.data.chapters)
      }
    } catch (error) {
      console.error('获取项目数据失败:', error)
    } finally {
      setLoading(false)
    }
  }

  // 保存当前章节内容
  const handleSaveContent = async () => {
    setSaving(true)
    try {
      await contentAPI.saveContent(projectId, activeChapterIndex, editContent)

      // 更新本地状态
      const newChapters = [...chapters]
      newChapters[activeChapterIndex] = {
        ...newChapters[activeChapterIndex],
        content: editContent,
        word_count: editContent.length
      }
      setChapters(newChapters)

      alert('保存成功')
    } catch (error) {
      console.error('保存失败:', error)
      alert('保存失败')
    } finally {
      setSaving(false)
    }
  }

  // 导出 Word 文档
  const handleExportWord = async () => {
    if (!chapters.length) {
      alert('没有可导出的内容')
      return
    }

    setExporting(true)
    try {
      // 获取已完成的任务
      const tasksRes = await tasksAPI.getTasks()
      const projectTask = tasksRes.data?.find((t: any) => t.project_id === projectId && t.status === 'completed')

      if (!projectTask) {
        alert('没有已完成的任务')
        return
      }

      const response = await contentAPI.exportWord(projectTask.id)

      // 创建下载链接
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `${project?.title || '文档'}-${new Date().toISOString().slice(0, 10)}.docx`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('导出失败:', error)
      alert('导出失败')
    } finally {
      setExporting(false)
    }
  }

  // 获取大纲中的章节标题
  const outlineChapters = extractChapters(outline)

  // 获取目标字数
  const targetWords = (project?.target_pages || 50) * (project?.words_per_page || 700)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--color-primary)]"></div>
      </div>
    )
  }

  // 如果没有内容显示空状态
  if (!chapters.length && !loading) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-base)] flex flex-col">
        <header className="h-14 bg-[var(--color-bg-surface)] border-b border-[var(--color-border)] flex items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-xl font-bold text-[var(--color-primary)]">BidAI</Link>
            <span className="text-[var(--color-text-secondary)]">·</span>
            <span>{project?.title || '文档编辑'}</span>
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl mb-4">📄</div>
            <div className="text-xl font-medium mb-2">文档尚未生成</div>
            <div className="text-sm text-[var(--color-text-secondary)] mb-6">
              请先完成文档生成流程
            </div>
            <Link href={`/projects/${projectId}/generate`} className="btn-primary">
              去生成文档
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-base)] flex flex-col">
      {/* 顶部导航 */}
      <header className="h-14 bg-[var(--color-bg-surface)] border-b border-[var(--color-border)] flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-xl font-bold text-[var(--color-primary)]">BidAI</Link>
          <span className="text-[var(--color-text-secondary)]">·</span>
          <span>{project?.title || '文档编辑'}</span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={handleSaveContent}
            disabled={saving}
            className="btn-secondary text-sm"
          >
            {saving ? '保存中...' : '💾 保存'}
          </button>
          <button
            onClick={handleExportWord}
            disabled={exporting}
            className="btn-primary text-sm"
          >
            {exporting ? '导出中...' : '📥 导出 Word'}
          </button>
        </div>
      </header>

      <div className="flex-1 flex">
        {/* 左侧大纲 */}
        <aside className="w-64 bg-[var(--color-bg-surface)] border-r border-[var(--color-border)] p-4 overflow-y-auto">
          <h3 className="font-medium mb-4 text-sm text-[var(--color-text-secondary)]">章节目录</h3>
          <div className="space-y-1">
            {outlineChapters.map((chapter, index) => {
              const chapterData = chapters[index]
              const isActive = activeChapterIndex === index
              const hasContent = chapterData?.content && chapterData.content.length > 0

              return (
                <button
                  key={index}
                  onClick={() => setActiveChapterIndex(index)}
                  className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center justify-between ${
                    isActive
                      ? 'bg-[var(--color-primary)] text-white'
                      : 'hover:bg-[var(--color-bg-base)]'
                  }`}
                >
                  <span className="truncate flex-1">
                    {hasContent ? '✓ ' : '○ '}
                    {chapter.level === 3 ? '· ' : ''}
                    {chapter.title}
                  </span>
                </button>
              )
            })}
          </div>

          {/* 返回按钮 */}
          <div className="mt-6 pt-4 border-t border-[var(--color-border)]">
            <Link
              href={`/projects/${projectId}/generate`}
              className="block text-center text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
            >
              ← 返回生成页面
            </Link>
          </div>
        </aside>

        {/* 中间编辑器 */}
        <main className="flex-1 flex flex-col">
          {/* 工具栏 */}
          <div className="h-12 bg-[var(--color-bg-surface)] border-b border-[var(--color-border)] flex items-center px-4 gap-2">
            <button className="px-2 py-1 font-bold rounded hover:bg-[var(--color-bg-base)]">B</button>
            <button className="px-2 py-1 italic rounded hover:bg-[var(--color-bg-base)]">I</button>
            <button className="px-2 py-1 underline rounded hover:bg-[var(--color-bg-base)]">U</button>
            <span className="mx-2 text-gray-300">|</span>
            <button className="px-2 py-1 text-sm rounded hover:bg-[var(--color-bg-base)]">H1</button>
            <button className="px-2 py-1 text-sm rounded hover:bg-[var(--color-bg-base)]">H2</button>
            <span className="mx-2 text-gray-300">|</span>
            <button className="px-2 py-1 text-sm rounded hover:bg-[var(--color-bg-base)]">↩ 撤销</button>

            {/* 当前章节标题 */}
            <div className="ml-auto text-sm text-[var(--color-text-secondary)]">
              {outlineChapters[activeChapterIndex]?.title || `第 ${activeChapterIndex + 1} 章`}
            </div>
          </div>

          {/* 编辑区域 */}
          <div className="flex-1 p-8 overflow-y-auto">
            <div className="max-w-3xl mx-auto bg-white shadow-sm border border-[var(--color-border)] min-h-[600px] p-12">
              <h1 className="text-center text-xl font-bold mb-8">{project?.title}</h1>
              <h2 className="text-lg font-bold mb-4">
                {outlineChapters[activeChapterIndex]?.title || `第 ${activeChapterIndex + 1} 章`}
              </h2>

              {/* 文本编辑器 - 使用 textarea */}
              <textarea
                value={editContent}
                onChange={(e) => {
                  setEditContent(e.target.value)
                  setCurrentWords(e.target.value.length)
                }}
                className="w-full min-h-[400px] text-[var(--color-text-primary)] leading-relaxed resize-none focus:outline-none"
                placeholder="在此输入内容..."
              />
            </div>
          </div>
        </main>

        {/* 右侧统计 */}
        <aside className="w-48 bg-[var(--color-bg-surface)] border-l border-[var(--color-border)] p-4">
          <h3 className="font-medium mb-4 text-sm text-[var(--color-text-secondary)]">字数统计</h3>
          <div className="space-y-4">
            <div>
              <div className="text-sm text-[var(--color-text-secondary)]">当前章节</div>
              <div className="text-xl font-bold">{currentWords} <span className="text-sm font-normal">字</span></div>
            </div>
            <div>
              <div className="text-sm text-[var(--color-text-secondary)]">全文</div>
              <div className="text-xl font-bold">{totalWords} <span className="text-sm font-normal">字</span></div>
              <div className="text-xs text-[var(--color-text-secondary)]">目标 {targetWords.toLocaleString()} 字</div>
              <div className="h-1.5 bg-gray-200 rounded-full mt-1">
                <div
                  className="h-full bg-[var(--color-primary)] rounded-full"
                  style={{ width: `${Math.min(100, (totalWords / targetWords) * 100)}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* 章节列表 */}
          <div className="mt-8">
            <h3 className="font-medium mb-2 text-sm text-[var(--color-text-secondary)]">
              章节进度 ({chapters.length})
            </h3>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {chapters.map((ch, i) => (
                <div key={i} className="text-xs flex justify-between">
                  <span className={i === activeChapterIndex ? 'text-[var(--color-primary)] font-medium' : 'text-[var(--color-text-secondary)]'}>
                    {i + 1}. {ch.chapter_title?.substring(0, 10) || '章节'}{ch.chapter_title?.length > 10 ? '...' : ''}
                  </span>
                  <span className="text-[var(--color-text-secondary)]">{ch.word_count || 0}字</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
