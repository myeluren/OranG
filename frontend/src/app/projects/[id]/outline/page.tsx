'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { projectsAPI, subscriptionsAPI, outlineAPI } from '@/lib/api'
import OutlineEditor from '@/components/OutlineEditor'

// 类型定义
interface OutlineNode {
  id: string
  level: number
  title: string
  children: OutlineNode[]
}

function OutlineContent() {
  const router = useRouter()
  const params = useParams()
  const { theme, setTheme } = useTheme()
  const [user, setUser] = useState<any>(null)
  const [project, setProject] = useState<any>(null)
  const [subscription, setSubscription] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [outline, setOutline] = useState<OutlineNode[]>([])
  const projectId = parseInt(params.id as string)

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (!userData) {
      router.push('/login')
      return
    }
    setUser(JSON.parse(userData))
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const [projectRes, usageRes] = await Promise.all([
        projectsAPI.getProject(projectId),
        subscriptionsAPI.getUsage()
      ])
      setProject(projectRes.data)
      setSubscription(usageRes.data)

      // 优先从 Redis 获取大纲
      try {
        const outlineRes = await outlineAPI.getOutline(projectId)
        if (outlineRes.data.data && outlineRes.data.data.outline) {
          const parsed = outlineRes.data.data.outline
          // 递归为每个节点（包括子节点）生成唯一ID和设置level
          const generateIds = (nodes: OutlineNode[], currentLevel: number, prefix = ''): OutlineNode[] => {
            return nodes.map((node: OutlineNode, index: number) => {
              const nodeId = node.id || `node_${prefix}${index}_${Date.now()}`
              return {
                ...node,
                id: nodeId,
                level: currentLevel, // 确保有正确的层级
                children: node.children && node.children.length > 0
                  ? generateIds(node.children, currentLevel + 1, `${prefix}${index}_`)
                  : []
              }
            })
          }
          const withIds = generateIds(parsed, 1) // 从第一层开始
          setOutline(withIds)
          console.log('大纲来源:', outlineRes.data.data.source)
          return
        }
      } catch (outlineError) {
        console.log('Redis 中无大纲，尝试从 MySQL 获取')
      }

      // 从 MySQL 获取大纲
      if (projectRes.data.outline_json) {
        try {
          const parsed = JSON.parse(projectRes.data.outline_json)
          // 递归为每个节点（包括子节点）生成唯一ID和设置level
          const generateIds = (nodes: OutlineNode[], currentLevel: number, prefix = ''): OutlineNode[] => {
            return nodes.map((node: OutlineNode, index: number) => {
              const nodeId = node.id || `node_${prefix}${index}_${Date.now()}`
              return {
                ...node,
                id: nodeId,
                level: currentLevel, // 确保有正确的层级
                children: node.children && node.children.length > 0
                  ? generateIds(node.children, currentLevel + 1, `${prefix}${index}_`)
                  : []
              }
            })
          }
          const withIds = generateIds(parsed, 1) // 从第一层开始
          setOutline(withIds)
        } catch (e) {
          console.error('Failed to parse outline:', e)
        }
      }
    } catch (error) {
      console.error('Failed to fetch data:', error)
    } finally {
      setLoading(false)
    }
  }

  // 自动保存到 Redis（防抖）
  useEffect(() => {
    if (outline.length === 0 || !project) return
    
    const timer = setTimeout(async () => {
      try {
        await outlineAPI.saveToRedis(projectId, JSON.stringify(outline))
        console.log('已自动保存到 Redis')
      } catch (error) {
        console.error('自动保存失败:', error)
      }
    }, 1000) // 1秒防抖

    return () => clearTimeout(timer)
  }, [outline, projectId, project])

  // 处理大纲变化
  const handleOutlineChange = (newOutline: OutlineNode[]) => {
    setOutline(newOutline)
    // 更新项目的 outline_json
    if (project) {
      setProject({
        ...project,
        outline_json: JSON.stringify(newOutline)
      })
    }
  }

  const handleSaveOutline = async () => {
    setSaving(true)
    try {
      // 保存到 MySQL 数据库
      await outlineAPI.saveToDb(projectId)
      router.push(`/projects/${projectId}/format`)
    } catch (error) {
      alert('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user')
    router.push('/login')
  }

  if (loading) {
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
          <Link href="/dashboard" className="text-xl font-bold text-[var(--color-primary)]">BidAI</Link>
          <span className="text-[var(--color-text-secondary)]">· 确认大纲</span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-2 rounded-lg hover:bg-[var(--color-bg-base)]"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--color-text-secondary)]">{user?.name}</span>
            <button onClick={handleLogout} className="text-sm text-[var(--color-primary)] hover:underline">
              退出
            </button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* 左侧菜单 */}
        <aside className="w-60 bg-[var(--color-bg-sidebar)] text-white min-h-[calc(100vh-56px)] p-4">
          <nav className="space-y-2">
            <Link href="/dashboard" className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-300 hover:bg-white/10">
              <span>📁</span>
              <span>我的项目</span>
            </Link>
            <Link href="/tasks" className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-300 hover:bg-white/10">
              <span>✅</span>
              <span>任务列表</span>
            </Link>
            <Link href="/account" className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-300 hover:bg-white/10">
              <span>👤</span>
              <span>账户</span>
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

        {/* 主内容区 */}
        <main className="flex-1 p-6">
          {/* 步骤导航 */}
          <div className="mb-6">
            <div className="flex items-center justify-center gap-2 text-sm">
              <span className="flex items-center gap-1 text-green-600">
                <span>✓</span> 上传文件
              </span>
              <span className="text-gray-400 mx-2">→</span>
              <span className="flex items-center gap-1 text-[var(--color-primary)] font-medium">
                <span>②</span> 确认大纲
              </span>
              <span className="text-gray-400 mx-2">→</span>
              <span className="text-gray-400">③ 格式设置</span>
              <span className="text-gray-400 mx-2">→</span>
              <span className="text-gray-400">④ 生成</span>
            </div>
          </div>

          <div className="card p-6">
            <h1 className="text-xl font-semibold mb-2">确认大纲</h1>
            <p className="text-sm text-[var(--color-text-secondary)] mb-6">
              ℹ️ AI 已根据招标文件的投标要求与评分标准生成大纲，请核对并按需调整。
            </p>

            {project?.outline_json ? (
              <div className="border border-[var(--color-border)] rounded-lg p-4 mb-6 min-h-[400px] bg-gray-50 dark:bg-gray-900">
                <OutlineEditor
                  value={outline}
                  onChange={handleOutlineChange}
                />
              </div>
            ) : (
              <div className="text-center py-8 text-[var(--color-text-secondary)]">
                暂无大纲，请先上传招标文件并生成大纲
              </div>
            )}

            {/* 章节统计 */}
            {outline.length > 0 && (
              <div className="mb-4 text-sm text-[var(--color-text-secondary)]">
                共 {outline.length} 章
              </div>
            )}

            <div className="flex gap-4">
              <Link href={`/projects/${projectId}`} className="btn-secondary">
                ← 返回
              </Link>
              <button onClick={handleSaveOutline} disabled={saving || !project?.outline_json} className="btn-primary">
                {saving ? '保存中...' : '确认大纲，下一步 →'}
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

export default function OutlinePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">加载中...</div>}>
      <OutlineContent />
    </Suspense>
  )
}
