'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { projectsAPI, tasksAPI, subscriptionsAPI } from '@/lib/api'

export default function GeneratePage() {
  const router = useRouter()
  const params = useParams()
  const { theme, setTheme } = useTheme()
  const projectId = parseInt(params.id as string)
  const [user, setUser] = useState<any>(null)
  const [project, setProject] = useState<any>(null)
  const [task, setTask] = useState<any>(null)
  const [subscription, setSubscription] = useState<any>(null)
  const [checkpoints, setCheckpoints] = useState<any[]>([])
  const [backgrounding, setBackgrounding] = useState(false)
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const userData = localStorage.getItem('user')
    if (!userData) {
      router.push('/login')
      return
    }
    setUser(JSON.parse(userData))
    fetchData()

    // 轮询任务状态
    const interval = setInterval(fetchTask, 3000)
    return () => clearInterval(interval)
  }, [projectId])

  const fetchData = async () => {
    try {
      const [projRes, tasksRes, usageRes] = await Promise.all([
        projectsAPI.getProject(projectId),
        tasksAPI.getTasks(),
        subscriptionsAPI.getUsage()
      ])
      console.log('tasksRes:', tasksRes)
      console.log('tasksRes.data:', tasksRes.data)
      setProject(projRes.data)
      setSubscription(usageRes.data)
      const projectTask = tasksRes.data?.find((t: any) => t.project_id === projectId)

      // 找到最新的任务（按ID排序）
      const allTasksForProject = tasksRes.data?.filter((t: any) => t.project_id === projectId) || []
      const latestTask = allTasksForProject.sort((a: any, b: any) => b.id - a.id)[0]

      if (latestTask) {
        setTask(latestTask)
        const checkpointRes = await tasksAPI.getCheckpoints(latestTask.id)
        setCheckpoints(checkpointRes.data?.data || [])
      } else {
        setTask(null)
        setCheckpoints([])
      }
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const fetchTask = async () => {
    try {
      const allTasksRes = await tasksAPI.getTasks()
      const projectTask = allTasksRes.data?.find((t: any) => t.project_id === projectId)

      if (projectTask) {
        setTask(projectTask)
        const checkpointRes = await tasksAPI.getCheckpoints(projectTask.id)
        setCheckpoints(checkpointRes.data?.data || [])
      }
    } catch (error) {}
  }

  const handlePause = async () => {
    if (!task) return
    try {
      await tasksAPI.pauseTask(task.id)
      fetchData()
    } catch (error) {
      alert('操作失败')
    }
  }

  const handleCancel = async () => {
    if (!task) return
    if (!confirm('确定要取消任务吗？')) return
    try {
      await tasksAPI.cancelTask(task.id)
      router.push('/dashboard')
    } catch (error) {
      alert('操作失败')
    }
  }

  const handleBackground = () => {
    setBackgrounding(true)
    router.push('/dashboard')
  }

  const handleRegenerate = async () => {
    if (!task) return
    try {
      await tasksAPI.regenerateTask(task.id)
      fetchData()
    } catch (error) {
      alert('操作失败')
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user')
    router.push('/login')
  }

  const progress = task && task.total_chapters > 0 ? (task.completed_chapters / task.total_chapters * 100) : 0
  const isQuotaPaused = task?.status === 'paused_quota'
  const targetWords = (project?.target_pages || 50) * (project?.words_per_page || 700)
  const avgPerChapter = task?.completed_chapters ? Math.max(1, Math.round(task.total_words_generated / task.completed_chapters)) : 1200
  const estimatedRemainingMinutes = task ? Math.max(1, Math.ceil(((task.total_chapters - task.completed_chapters) * avgPerChapter) / 3000)) : 0

  const chapterRows = (() => {
    if (!project?.outline_json) return []
    try {
      const outline = JSON.parse(project.outline_json)
      const chapters: { title: string; level: number }[] = []
      const extractChapters = (nodes: any[]) => {
        nodes.forEach((node: any) => {
          if (node.level === 2 || node.level === 3) {
            chapters.push({ title: node.title, level: node.level })
          }
          if (node.children) extractChapters(node.children)
        })
      }
      extractChapters(outline)
      return chapters
    } catch (e) {
      return []
    }
  })()

  if (loading || !mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--color-primary)]"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-base)]">
      {/* 顶部导航 */}
      <header className="h-14 bg-[var(--color-bg-surface)] border-b border-[var(--color-border)] flex items-center justify-between px-6">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold text-[var(--color-primary)]">BidAI</span>
          <span className="text-[var(--color-text-secondary)]">· 文档生成</span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-2 rounded-lg hover:bg-[var(--color-bg-base)]"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--color-text-primary)]">{user?.name}</span>
            <button
              onClick={handleLogout}
              className="text-sm text-[var(--color-primary)] hover:underline"
            >
              退出
            </button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* 左侧菜单 */}
        <aside className="w-60 bg-[var(--color-bg-sidebar)] text-white min-h-[calc(100vh-56px)] p-4">
          <nav className="space-y-2">
            <Link
              href="/dashboard"
              className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-300 hover:bg-white/10"
            >
              <span>📁</span>
              <span>我的项目</span>
            </Link>
            <Link
              href="/tasks"
              className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-300 hover:bg-white/10"
            >
              <span>✅</span>
              <span>任务列表</span>
            </Link>
            <Link
              href="/account"
              className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-300 hover:bg-white/10"
            >
              <span>👤</span>
              <span>账户</span>
            </Link>

            {/* 套餐状态 */}
            {subscription && (
              <div className="mt-8 p-4 bg-white/5 rounded-lg">
                <div className="text-sm text-gray-400 mb-2">套餐状态</div>
                <div className="text-lg font-medium">{subscription.remaining_words?.toLocaleString() || 0} 字</div>
                <div className="text-xs text-gray-400">
                  剩余 / {subscription.total_words?.toLocaleString() || 0}
                </div>
                <div className="mt-2 h-2 bg-gray-600 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--color-accent)]"
                    style={{ width: `${subscription.usage_percentage || 0}%` }}
                  />
                </div>
              </div>
            )}
          </nav>
        </aside>

        {/* 主内容区 */}
        <main className="flex-1 p-6">
          <div className="max-w-4xl">
            {/* 步骤进度指示器 */}
            <div className="mb-8">
              <div className="flex items-center justify-center gap-2 text-sm">
                <span className="flex items-center gap-1 text-green-600">
                  <span className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center">✓</span>
                  上传文件
                </span>
                <span className="mx-2 text-gray-300">──</span>
                <span className="flex items-center gap-1 text-green-600">
                  <span className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center">✓</span>
                  确认大纲
                </span>
                <span className="mx-2 text-gray-300">──</span>
                <span className="flex items-center gap-1 text-green-600">
                  <span className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center">✓</span>
                  格式设置
                </span>
                <span className="mx-2 text-gray-300">──</span>
                <span className="flex items-center gap-1 text-[var(--color-primary)] font-medium">
                  <span className="w-6 h-6 rounded-full bg-[var(--color-primary)] text-white flex items-center justify-center">4</span>
                  生成文档
                </span>
              </div>
            </div>

            <div className="flex justify-end mb-4">
              <Link href={`/projects/${projectId}/format`} className="text-sm text-gray-500 hover:text-gray-700">
                ← 返回格式设置
              </Link>
            </div>

            <div className="bg-[var(--color-bg-surface)] rounded-lg shadow p-6">
              <h1 className="text-lg font-semibold mb-6 text-[var(--color-text-primary)]">文档生成</h1>

              {/* 无任务时的空状态 */}
              {!task && !loading && (
                <div className="text-center py-12">
                  <div className="text-4xl mb-4">📋</div>
                  <div className="text-xl font-medium mb-2 text-[var(--color-text-primary)]">尚未开始生成</div>
                  <div className="text-sm text-[var(--color-text-secondary)] mb-6">
                    请先在格式设置页面完成配置并开始生成
                  </div>
                  <Link href={`/projects/${projectId}/format`} className="px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white rounded-lg">
                    去格式设置
                  </Link>
                </div>
              )}

              {/* 进度条 */}
              {task && (
                <div className="mb-6">
                  <div className="flex justify-between mb-2 text-[var(--color-text-primary)]">
                    <span>总进度</span>
                    <span>{Math.round(progress)}%</span>
                  </div>
                  <div className="h-3 bg-[var(--color-bg-base)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--color-primary)] transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="text-sm text-[var(--color-text-secondary)] mt-2">
                    {task.completed_chapters} / {task.total_chapters} 章节 · 预计剩余 {estimatedRemainingMinutes} 分钟
                  </div>
                </div>
              )}

              {task && (
                <div className="border border-[var(--color-border)] rounded-lg divide-y divide-[var(--color-border)] mb-6 max-h-64 overflow-y-auto">
                  {chapterRows.map((chapter, i) => {
                    const cp = checkpoints.find((c: any) => c.chapter_index === i)
                    const isDone = !!cp || i < task.completed_chapters
                    const isRunning = i === task.completed_chapters && task.status === 'running'
                    const words = cp?.word_count || 0
                    return (
                      <div key={`${chapter.title}-${i}`} className="p-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {isDone ? (
                            <span className="text-green-500 shrink-0">✅</span>
                          ) : isRunning ? (
                            <span className="text-[var(--color-primary)] animate-pulse shrink-0">⚙️</span>
                          ) : (
                            <span className="text-gray-300 shrink-0">○</span>
                          )}
                          <span className={`truncate ${chapter.level === 2 ? 'font-medium text-[var(--color-text-primary)]' : 'text-[var(--color-text-secondary)]'}`}>
                            {chapter.level === 3 ? `· ${chapter.title}` : chapter.title}
                          </span>
                        </div>
                        <span className="text-sm text-[var(--color-text-secondary)] shrink-0">
                          {isDone ? `${words.toLocaleString()}字` : isRunning ? '生成中...' : '-'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="text-sm text-[var(--color-text-secondary)] mb-6">
                已生成 {(task?.total_words_generated || 0).toLocaleString()} 字 / 目标 {targetWords.toLocaleString()} 字
              </div>

              {/* 额度耗尽提示 */}
              {isQuotaPaused && (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg mb-6">
                  <div className="font-medium text-yellow-700 mb-2">⚠️ 本期字数额度已耗尽，任务已暂停</div>
                  <div className="text-sm text-yellow-600 mb-4">
                    充值后继续时，系统将：
                    <br />① 退还本次任务已消耗的字数至您的额度
                    <br />② 依据您确认的大纲，从第一章重新完整生成
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleCancel} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm">取消任务</button>
                    <button onClick={handleRegenerate} className="px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white rounded-lg text-sm">联系管理员增加额度</button>
                  </div>
                </div>
              )}

              {/* 正常状态操作按钮 */}
              {!isQuotaPaused && (
                <div className="flex gap-4">
                  <button onClick={handleCancel} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg">⬜ 取消</button>
                  <button onClick={handleBackground} disabled={backgrounding} className="px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white rounded-lg disabled:opacity-60">
                    ⏸ 后台执行
                  </button>
                </div>
              )}

              {/* 完成提示 */}
              {task?.status === 'completed' && (
                <div className="text-center py-8">
                  <div className="text-4xl mb-4">🎉</div>
                  <div className="text-xl font-medium mb-4 text-[var(--color-text-primary)]">文档生成完成！</div>
                  <div className="flex gap-4 justify-center">
                    <Link href={`/projects/${projectId}/editor`} className="px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white rounded-lg">
                      查看文档
                    </Link>
                    <button className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg">
                      下载 Word
                    </button>
                  </div>
                </div>
              )}

              {/* 任务状态和错误信息显示 */}
              {task && task.status === 'failed' && (
                <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-red-600 text-xl">⚠️</span>
                    <span className="font-medium text-red-700 dark:text-red-300">生成失败</span>
                  </div>
                  <div className="text-red-600 dark:text-red-400 text-sm mb-3">
                    {task.error_message || '任务执行过程中发生未知错误'}
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href={`/projects/${projectId}/format`}
                      className="px-3 py-1.5 text-sm bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-900/60"
                    >
                      重新生成
                    </Link>
                    <button
                      onClick={() => navigator.clipboard.writeText(task.error_message || '')}
                      className="px-3 py-1.5 text-sm border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 rounded hover:bg-red-100 dark:hover:bg-red-900/40"
                    >
                      复制错误信息
                    </button>
                  </div>
                </div>
              )}

              {/* 任务正常状态显示 */}
              {task && task.status !== 'failed' && (
                <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm">
                  <div className="text-gray-500 dark:text-gray-400 mt-1">
                    已完成: {task.completed_chapters}/{task.total_chapters} 章节,
                    已生成: {task.total_words_generated} 字
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
