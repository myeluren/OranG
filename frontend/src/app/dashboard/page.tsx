'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { projectsAPI, subscriptionsAPI, tasksAPI } from '@/lib/api'
import { formatDateTime } from '@/lib/dateUtils'

export default function DashboardPage() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const [user, setUser] = useState<any>(null)
  const [projects, setProjects] = useState<any[]>([])
  const [subscription, setSubscription] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [showViewModal, setShowViewModal] = useState(false)
  const [viewProject, setViewProject] = useState<any>(null)
  const [projectOutline, setProjectOutline] = useState<any>(null)
  const [projectContent, setProjectContent] = useState<any>(null)

  // 避免服务端渲染导致的主题问题
  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (!userData) {
      router.push('/login')
      return
    }
    try {
      setUser(JSON.parse(userData))
      fetchData()
    } catch (e) {
      console.error('Failed to parse user data:', e)
      router.push('/login')
    }
  }, [])

  const fetchData = async () => {
    try {
      const [projectsRes, usageRes] = await Promise.all([
        projectsAPI.getProjects({ limit: 10 }),
        subscriptionsAPI.getUsage()
      ])
      const projectsList = projectsRes.data || []
      setProjects(projectsList)
      setSubscription(usageRes.data)
    } catch (error) {
      console.error('Failed to fetch data:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (project: any) => {
    const status = project.status || 'draft'
    const statusMap: Record<string, { color: string; text: string }> = {
      draft: {
        color: 'bg-gray-100 text-gray-600',
        text: project.tender_file_name ? '待生成大纲' : '待上传文件'
      },
      outline_generated: { color: 'bg-blue-100 text-blue-600', text: '待确认大纲' },
      format_set: { color: 'bg-yellow-100 text-yellow-600', text: '待开始生成' },
      generating: { color: 'bg-purple-100 text-purple-600', text: '生成中' },
      completed: { color: 'bg-green-100 text-green-600', text: '已完成' },
      failed: { color: 'bg-red-100 text-red-600', text: '生成失败' },
      cancelled: { color: 'bg-gray-100 text-gray-600', text: '已取消' }
    }
    const s = statusMap[status] || statusMap.draft
    return <span className={`px-2 py-1 rounded-full text-xs font-medium ${s.color}`}>{s.text}</span>
  }

  const handleLogout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user')
    router.push('/login')
  }

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8002'

  const handleDeleteProject = async (id: number) => {
    if (!confirm('确定要删除这个项目吗？此操作不可恢复。')) return
    try {
      await projectsAPI.deleteProject(id)
      fetchData()
    } catch (error) {
      alert('删除失败')
    }
  }

  const handleDownload = async (projectId: number) => {
    try {
      // 先获取项目对应的任务ID
      const tasksRes = await tasksAPI.getTasks()
      const projectTask = tasksRes.data?.find((t: any) => t.project_id === projectId && t.status === 'completed')

      if (!projectTask) {
        alert('没有已完成的任务可下载')
        return
      }

      const response = await fetch(`${API_URL}/api/v1/tasks/${projectTask.id}/export/docx`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` }
      })
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `标书.docx`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      } else {
        alert('下载失败')
      }
    } catch (error) {
      alert('下载失败')
    }
  }

  // 重新生成失败的任务（额度耗尽或失败状态）
  const handleRegenerateFailed = async (projectId: number) => {
    if (!confirm('确定要重新生成吗？')) return
    try {
      // 先获取项目对应的任务ID
      const tasksRes = await tasksAPI.getTasks()
      const projectTask = tasksRes.data?.find((t: any) =>
        t.project_id === projectId && (t.status === 'failed' || t.status === 'paused_quota')
      )

      if (!projectTask) {
        alert('没有可重新生成的任务')
        return
      }

      await tasksAPI.regenerateTask(projectTask.id)
      fetchData()
    } catch (error) {
      alert('重新生成失败')
    }
  }

  // 继续编辑项目（根据项目状态跳转到对应的步骤）
  const handleRegenerate = async (project: any) => {
    let targetStep = 1
    let confirmMessage = ''

    switch (project.status) {
      case 'completed':
      case 'cancelled':
        // 已完成或已取消的项目，完全重置
        confirmMessage = '确定要重新生成吗？这将重置项目并重新开始生成流程。'
        break
      case 'outline_generated':
        // 大纲已生成，确认编辑大纲
        confirmMessage = '确定要重新编辑大纲吗？'
        break
      case 'format_set':
        // 格式已设置，确认重新设置格式
        confirmMessage = '确定要重新设置格式吗？'
        break
      case 'generating':
        // 生成中状态，跳转到生成进度页面
        router.push(`/projects/${project.id}/generate`)
        return
      default:
        confirmMessage = '确定要重新开始吗？'
    }

    if (!confirm(confirmMessage)) return

    try {
      // 对于 completed 和 cancelled 状态，需要重置项目
      if (project.status === 'completed' || project.status === 'cancelled') {
        await projectsAPI.resetProject(project.id)
      }

      // 根据项目状态跳转到对应的独立页面
      const status = project.status === 'completed' || project.status === 'cancelled' ? 'draft' : project.status
      if (status === 'draft') {
        if (project.tender_file_name) {
          // 有文件，跳转到大纲页面
          router.push(`/projects/${project.id}/outline`)
        } else {
          // 无文件，跳转到新建项目页面
          router.push(`/projects/new?projectId=${project.id}`)
        }
      } else if (status === 'outline_generated') {
        router.push(`/projects/${project.id}/outline`)
      } else if (status === 'format_set') {
        router.push(`/projects/${project.id}/format`)
      }
    } catch (error) {
      alert('操作失败')
    }
  }

  // 查看项目详情
  const handleView = async (project: any) => {
    setViewProject(project)
    setShowViewModal(true)
    setProjectOutline(null)
    setProjectContent(null)

    try {
      // 获取项目详情和大纲
      const projectRes = await projectsAPI.getProject(project.id)
      const projectData = projectRes.data

      if (projectData.outline) {
        setProjectOutline(projectData.outline)
      }

      // 获取任务列表，查找已完成的任务
      const tasksRes = await tasksAPI.getTasks()
      const completedTask = tasksRes.data?.find((t: any) =>
        t.project_id === project.id && t.status === 'completed'
      )

      if (completedTask) {
        // 获取任务生成的内容
        setProjectContent(completedTask.generated_content || '暂无生成内容')
      }
    } catch (error) {
      console.error('获取项目详情失败:', error)
    }
  }

  // 渲染主操作按钮
  const renderPrimaryAction = (project: any) => {
    console.log('Rendering primary action for project:', project.id, 'status:', project.status, 'file:', project.tender_file_name)
    const status = project.status || 'draft'
    // 1. 草稿状态逻辑
    if (status === 'draft') {
      if (!project.tender_file_name) {
        return (
          <button onClick={() => router.push(`/projects/new?projectId=${project.id}`)} className="text-[var(--color-primary)] hover:underline text-sm font-medium">
            上传文件
          </button>
        )
      }
      return (
        <button onClick={() => router.push(`/projects/${project.id}/outline`)} className="text-[var(--color-primary)] hover:underline text-sm font-medium">
          生成大纲
        </button>
      )
    }

    // 2. 其他状态逻辑
    switch (status) {
      case 'outline_generated':
        return (
          <button onClick={() => router.push(`/projects/${project.id}/outline`)} className="text-[var(--color-primary)] hover:underline text-sm font-medium">
            确认大纲
          </button>
        )
      case 'format_set':
        return (
          <button onClick={() => router.push(`/projects/${project.id}/format`)} className="text-[var(--color-primary)] hover:underline text-sm font-medium">
            开始生成
          </button>
        )
      case 'generating':
        return (
          <button onClick={() => router.push(`/projects/${project.id}/generate`)} className="text-purple-600 hover:underline text-sm font-medium">
            查看进度
          </button>
        )
      case 'failed':
        return (
          <button onClick={() => router.push(`/projects/${project.id}/generate`)} className="text-red-600 hover:underline text-sm font-medium">
            查看失败
          </button>
        )
      case 'completed':
        return (
          <button onClick={() => handleDownload(project.id)} className="text-[var(--color-success)] hover:underline text-sm font-medium">
            下载DOCX
          </button>
        )
      default:
        return null
    }
  }

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
          <span className="text-[var(--color-text-secondary)]">· 工作台</span>
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
              className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-[var(--color-primary)]"
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

            {/* 超级管理员后台入口 */}
            {user?.role === 'super_admin' && (
              <>
                <div className="mt-6 pt-4 border-t border-gray-600">
                  <div className="px-4 py-2 text-xs text-gray-500 uppercase">管理后台</div>
                </div>
                <Link
                  href="/admin/users"
                  className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-300 hover:bg-white/10"
                >
                  <span>👥</span>
                  <span>用户管理</span>
                </Link>
                <Link
                  href="/admin/tenants"
                  className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-300 hover:bg-white/10"
                >
                  <span>🏢</span>
                  <span>租户管理</span>
                </Link>
                <Link
                  href="/admin/plans"
                  className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-300 hover:bg-white/10"
                >
                  <span>📦</span>
                  <span>套餐管理</span>
                </Link>
                <Link
                  href="/admin/llm"
                  className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-300 hover:bg-white/10"
                >
                  <span>🤖</span>
                  <span>LLM配置</span>
                </Link>
                <Link
                  href="/admin/stats"
                  className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-300 hover:bg-white/10"
                >
                  <span>📊</span>
                  <span>数据统计</span>
                </Link>
              </>
            )}

            {/* 套餐状态 */}
            {subscription && subscription.has_subscription !== false ? (
              <div className="mt-8 p-4 bg-white/5 rounded-lg">
                <div className="text-sm text-gray-400 mb-2">套餐状态</div>
                {subscription.total_words > 0 ? (
                  <>
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
                    {subscription.expire_at && (
                      <div className="mt-2 text-xs text-gray-400">
                        到期: {new Date(subscription.expire_at).toLocaleDateString('zh-CN')}
                      </div>
                    )}
                    {subscription.is_low && (
                      <div className="mt-2 text-xs text-yellow-400">
                        ⚠️ 字数额度不足10%
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-sm text-yellow-400">
                    暂无套餐，请联系管理员开通
                  </div>
                )}
              </div>
            ) : subscription === null ? (
              <div className="mt-8 p-4 bg-white/5 rounded-lg">
                <div className="text-sm text-gray-400 mb-2">套餐状态</div>
                <div className="text-xs text-gray-400">加载中...</div>
              </div>
            ) : (
              <div className="mt-8 p-4 bg-white/5 rounded-lg">
                <div className="text-sm text-gray-400 mb-2">套餐状态</div>
                <div className="text-sm text-yellow-400">
                  暂无套餐，请联系管理员开通
                </div>
              </div>
            )}
          </nav>
        </aside>

        {/* 主内容区 */}
        <main className="flex-1 p-6">
          {/* 概览卡片 */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-[var(--color-bg-surface)] rounded-lg shadow p-6">
              <div className="text-sm text-[var(--color-text-secondary)] mb-1">本期用量</div>
              <div className="text-2xl font-bold text-[var(--color-text-primary)]">
                {subscription?.used_words?.toLocaleString() || 0}
              </div>
              {subscription?.total_words > 0 ? (
                <div className="text-sm text-[var(--color-text-secondary)]">
                  / {subscription?.total_words?.toLocaleString()} 字
                </div>
              ) : (
                <div className="text-sm text-yellow-600">
                  暂无套餐
                </div>
              )}
            </div>
            <div className="bg-[var(--color-bg-surface)] rounded-lg shadow p-6">
              <div className="text-sm text-[var(--color-text-secondary)] mb-1">进行中</div>
              <div className="text-2xl font-bold text-[var(--color-text-primary)]">
                {projects.filter(p => p.status === 'generating').length}
              </div>
              <div className="text-sm text-[var(--color-text-secondary)]">任务</div>
            </div>
            <div className="bg-[var(--color-bg-surface)] rounded-lg shadow p-6">
              <div className="text-sm text-[var(--color-text-secondary)] mb-1">已完成</div>
              <div className="text-2xl font-bold text-[var(--color-text-primary)]">
                {projects.filter(p => p.status === 'completed').length}
              </div>
              <div className="text-sm text-[var(--color-text-secondary)]">项目</div>
            </div>
          </div>

          {/* 项目列表 */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">我的项目</h2>
            <Link href="/projects/new" className="px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white rounded-lg transition-colors">
              + 新建项目
            </Link>
          </div>

          <div className="bg-[var(--color-bg-surface)] rounded-lg shadow overflow-hidden">
            {projects.length === 0 ? (
              <div className="p-8 text-center text-[var(--color-text-secondary)]">
                暂无项目，点击上方按钮创建新项目
              </div>
            ) : (
              <table className="w-full text-left">
                <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg-base)]">
                  <tr>
                    <th className="px-6 py-3 font-medium text-sm text-[var(--color-text-secondary)]">标书名称</th>
                    <th className="px-6 py-3 font-medium text-sm text-[var(--color-text-secondary)]">状态</th>
                    <th className="px-6 py-3 font-medium text-sm text-[var(--color-text-secondary)]">更新时间</th>
                    <th className="px-6 py-3 font-medium text-sm text-[var(--color-text-secondary)]">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {projects.map((project) => (
                    <tr key={project.id} className="hover:bg-[var(--color-bg-base)] transition-colors">
                      <td className="px-6 py-4 text-[var(--color-text-primary)]">{project.title}</td>
                      <td className="px-6 py-4">{getStatusBadge(project)}</td>
                      <td className="px-6 py-4 text-sm text-[var(--color-text-secondary)]">
                        {formatDateTime(project.updated_at)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-3">
                          {/* 1. 主操作按钮 */}
                          {renderPrimaryAction(project)}

                          {/* 2. 次要操作：查看 */}
                          <button onClick={() => handleView(project)} className="text-gray-500 hover:underline text-sm">
                            
                          </button>

                          {/* 3. 特殊操作：重新生成 (仅针对已完成、失败或取消) */}
                          {(project.status === 'completed' || project.status === 'failed' || project.status === 'cancelled') && (
                            <button onClick={() => handleRegenerate(project)} className="text-orange-500 hover:underline text-sm">
                              重新开始
                            </button>
                          )}

                          {/* 4. 删除 */}
                          <button onClick={() => handleDeleteProject(project.id)} className="text-[var(--color-danger)] hover:underline text-sm">
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </main>
      </div>

      {/* 查看弹窗 */}
      {showViewModal && viewProject && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-[var(--color-bg-surface)] rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4 text-[var(--color-text-primary)]">
              项目详情 - {viewProject.title}
            </h2>

            {/* 大纲 */}
            <div className="mb-6">
              <h3 className="text-md font-medium mb-2 text-[var(--color-text-primary)]">大纲</h3>
              <div className="bg-[var(--color-bg-base)] p-4 rounded-lg max-h-60 overflow-y-auto">
                {projectOutline ? (
                  <pre className="whitespace-pre-wrap text-sm text-[var(--color-text-secondary)]">
                    {typeof projectOutline === 'string' ? projectOutline : JSON.stringify(projectOutline, null, 2)}
                  </pre>
                ) : (
                  <p className="text-[var(--color-text-secondary)] text-sm">暂无大纲</p>
                )}
              </div>
            </div>

            {/* 生成内容 */}
            <div className="mb-6">
              <h3 className="text-md font-medium mb-2 text-[var(--color-text-primary)]">生成内容</h3>
              <div className="bg-[var(--color-bg-base)] p-4 rounded-lg max-h-96 overflow-y-auto">
                {projectContent ? (
                  <pre className="whitespace-pre-wrap text-sm text-[var(--color-text-secondary)]">
                    {projectContent}
                  </pre>
                ) : (
                  <p className="text-[var(--color-text-secondary)] text-sm">暂无生成内容</p>
                )}
              </div>
            </div>

            <div className="flex justify-end">
              <button onClick={() => setShowViewModal(false)} className="px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white rounded-lg">
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
