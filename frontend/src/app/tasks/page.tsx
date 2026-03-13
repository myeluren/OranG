'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { tasksAPI, subscriptionsAPI } from '@/lib/api'
import { formatDateTime } from '@/lib/dateUtils'

export default function TasksPage() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const [user, setUser] = useState<any>(null)
  const [tasks, setTasks] = useState<any[]>([])
  const [subscription, setSubscription] = useState<any>(null)
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (!userData) {
      router.push('/login')
      return
    }
    setUser(JSON.parse(userData))
    fetchData()
  }, [])

  useEffect(() => {
    fetchData()
  }, [statusFilter])

  const fetchData = async () => {
    try {
      const [tasksRes, usageRes] = await Promise.all([
        tasksAPI.getTasks({ status_filter: statusFilter || undefined }),
        subscriptionsAPI.getUsage()
      ])
      setTasks(tasksRes.data || [])
      setSubscription(usageRes.data)
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handlePause = async (taskId: number) => {
    try {
      await tasksAPI.pauseTask(taskId)
      fetchData()
    } catch (error) {
      alert('操作失败')
    }
  }

  const handleResume = async (taskId: number) => {
    try {
      await tasksAPI.resumeTask(taskId)
      fetchData()
    } catch (error) {
      alert('操作失败')
    }
  }

  const handleCancel = async (taskId: number) => {
    if (!confirm('确定要取消任务吗？')) return
    try {
      await tasksAPI.cancelTask(taskId)
      fetchData()
    } catch (error) {
      alert('操作失败')
    }
  }

  const handleRegenerate = async (taskId: number) => {
    if (!confirm('重新生成将退回已消耗字数，确定要继续吗？')) return
    try {
      await tasksAPI.regenerateTask(taskId)
      fetchData()
    } catch (error) {
      alert('操作失败')
    }
  }

  const handleRetry = async (taskId: number) => {
    try {
      await tasksAPI.retryTask(taskId)
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

  const getStatusBadge = (status: string) => {
    const map: Record<string, { color: string; text: string }> = {
      pending: { color: 'bg-gray-100 text-gray-600', text: '等待中' },
      running: { color: 'bg-blue-100 text-blue-600', text: '生成中' },
      paused_manual: { color: 'bg-yellow-100 text-yellow-600', text: '已暂停' },
      paused_quota: { color: 'bg-orange-100 text-orange-600', text: '额度不足' },
      completed: { color: 'bg-green-100 text-green-600', text: '已完成' },
      failed: { color: 'bg-red-100 text-red-600', text: '失败' },
      cancelled: { color: 'bg-gray-100 text-gray-600', text: '已取消' }
    }
    return map[status] || map.pending
  }

  const statusFilters = [
    { key: null, label: '全部' },
    { key: 'running', label: '进行中' },
    { key: 'completed', label: '已完成' },
    { key: 'failed', label: '失败' },
  ]

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--color-primary)]"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-base)]">
      <header className="h-14 bg-[var(--color-bg-surface)] border-b border-[var(--color-border)] flex items-center justify-between px-6">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold text-[var(--color-primary)]">BidAI</span>
          <span className="text-[var(--color-text-secondary)]">· 任务列表</span>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="p-2 rounded-lg hover:bg-[var(--color-bg-base)]">
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button onClick={handleLogout} className="text-sm text-[var(--color-primary)] hover:underline">退出</button>
        </div>
      </header>

      <div className="flex">
        <aside className="w-60 bg-[var(--color-bg-sidebar)] text-white min-h-[calc(100vh-56px)] p-4">
          <nav className="space-y-2">
            <Link href="/dashboard" className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-300 hover:bg-white/10">
              <span>📁</span> 我的项目
            </Link>
            <Link href="/tasks" className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-[var(--color-primary)]">
              <span>✅</span> 任务列表
            </Link>
            <Link href="/account" className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-300 hover:bg-white/10">
              <span>👤</span> 账户
            </Link>

            {subscription && (
              <div className="mt-8 p-4 bg-white/5 rounded-lg">
                <div className="text-sm text-gray-400 mb-2">套餐状态</div>
                <div className="text-lg font-medium">{subscription.remaining_words?.toLocaleString() || 0} 字</div>
                <div className="text-xs text-gray-400">剩余 / {subscription.total_words?.toLocaleString() || 0}</div>
                <div className="mt-2 h-2 bg-gray-600 rounded-full overflow-hidden">
                  <div className="h-full bg-[var(--color-accent)]" style={{ width: `${subscription.usage_percentage || 0}%` }} />
                </div>
              </div>
            )}
          </nav>
        </aside>

        <main className="flex-1 p-6">
          <h1 className="text-xl font-semibold mb-6">生成任务列表</h1>

          {/* 筛选 */}
          <div className="flex gap-2 mb-6">
            {statusFilters.map(f => (
              <button
                key={f.key || 'all'}
                onClick={() => setStatusFilter(f.key)}
                className={`px-4 py-2 rounded-lg text-sm ${
                  statusFilter === f.key
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="card">
            {tasks.length === 0 ? (
              <div className="p-8 text-center text-[var(--color-text-secondary)]">暂无任务</div>
            ) : (
              <div className="divide-y divide-[var(--color-border)]">
                {tasks.map(task => {
                  const badge = getStatusBadge(task.status)
                  const progress = task.total_chapters > 0 ? (task.completed_chapters / task.total_chapters * 100) : 0
                  return (
                    <div key={task.id} className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <span className="font-medium">项目 #{task.project_id}</span>
                          <span className={`ml-3 px-2 py-0.5 rounded-full text-xs ${badge.color}`}>{badge.text}</span>
                        </div>
                        <div className="text-sm text-[var(--color-text-secondary)]">
                          {formatDateTime(task.created_at)}
                        </div>
                      </div>

                      {task.status === 'running' && (
                        <div className="mb-3">
                          <div className="flex justify-between text-sm mb-1">
                            <span>进度 {task.completed_chapters}/{task.total_chapters} 章节</span>
                            <span>{Math.round(progress)}%</span>
                          </div>
                          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div className="h-full bg-[var(--color-primary)]" style={{ width: `${progress}%` }} />
                          </div>
                        </div>
                      )}

                      {task.status === 'paused_quota' && (
                        <div className="mb-3 text-sm text-orange-600">
                          已消耗字数将在重新生成时退还
                        </div>
                      )}

                      {task.status === 'failed' && task.error_message && (
                        <div className="mb-3 text-sm text-red-600">
                          错误: {task.error_message}
                        </div>
                      )}

                      <div className="flex gap-2">
                        {task.status === 'running' && (
                          <button onClick={() => handlePause(task.id)} className="btn-secondary text-sm">暂停</button>
                        )}
                        {task.status === 'paused_manual' && (
                          <button onClick={() => handleResume(task.id)} className="btn-primary text-sm">继续</button>
                        )}
                        {task.status === 'paused_quota' && (
                          <button onClick={() => handleRegenerate(task.id)} className="btn-primary text-sm">重新生成</button>
                        )}
                        {task.status === 'failed' && (
                          <button onClick={() => handleRetry(task.id)} className="btn-primary text-sm">重试</button>
                        )}
                        {['running', 'paused_manual', 'paused_quota'].includes(task.status) && (
                          <button onClick={() => handleCancel(task.id)} className="btn-secondary text-sm">取消</button>
                        )}
                        {task.status === 'completed' && (
                          <Link href={`/projects/${task.project_id}/editor`} className="btn-primary text-sm">编辑</Link>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
