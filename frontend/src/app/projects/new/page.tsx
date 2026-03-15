'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { projectsAPI, subscriptionsAPI, llmAPI } from '@/lib/api'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8002'

function NewProjectContent() {
  const router = useRouter()
  const params = useSearchParams()
  const { theme, setTheme } = useTheme()
  const projectIdParam = params.get('projectId')

  const [user, setUser] = useState<any>(null)
  const [subscription, setSubscription] = useState<any>(null)
  const [projectId, setProjectId] = useState<number | null>(projectIdParam ? parseInt(projectIdParam) : null)
  const [title, setTitle] = useState('')
  const [project, setProject] = useState<any>(null)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [errorModal, setErrorModal] = useState<{ show: boolean; message: string }>({ show: false, message: '' })
  const fileInputRef = useRef<HTMLInputElement>(null)

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
      const usageRes = await subscriptionsAPI.getUsage()
      setSubscription(usageRes.data)

      if (projectId) {
        const projectRes = await projectsAPI.getProject(projectId)
        setProject(projectRes.data)
      }
    } catch (error) {
      console.error('Failed to fetch data:', error)
    }
  }

  // 创建项目
  const handleCreateProject = async () => {
    if (!title.trim()) return
    setCreating(true)
    try {
      const res = await projectsAPI.createProject({ title })
      setProjectId(res.data.id)
      setProject(res.data)
      // 创建成功后停留在当前页面，等待用户上传文件和生成大纲
      // router.push(`/projects/${res.data.id}/outline`)
    } catch (error: any) {
      alert(error.response?.data?.detail || '创建项目失败，请确保已开通订阅')
    } finally {
      setCreating(false)
    }
  }

  // 上传文件
  const handleUpload = async (uploadFile?: File) => {
    const fileToUpload = uploadFile || file
    if (!fileToUpload || !projectId) return
    setUploading(true)
    try {
      await projectsAPI.uploadFile(projectId, fileToUpload)
      const res = await projectsAPI.getProject(projectId)
      setProject(res.data)
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (error) {
      alert('上传失败')
    } finally {
      setUploading(false)
    }
  }

  // 拖拽处理
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) {
      const validTypes = ['.pdf', '.docx', '.doc']
      const ext = droppedFile.name.substring(droppedFile.name.lastIndexOf('.')).toLowerCase()
      if (validTypes.includes(ext)) {
        setFile(droppedFile)
        handleUpload(droppedFile)
      } else {
        alert('仅支持 PDF、Word 文件')
      }
    }
  }

  // 生成大纲并跳转
  const handleGenerateOutline = async () => {
    if (!projectId) return
    setLoading(true)
    try {
      // 1. 先检查 LLM 是否已配置
      const checkRes = await llmAPI.checkConfig('analysis')
      if (checkRes.data.code === 0 && !checkRes.data.data.is_configured) {
        alert('系统未配置大模型（LLM），请联系管理员在后台配置 API Key 后再试。')
        setLoading(false)
        return
      }

      // 2. 调用生成大纲接口
      const token = localStorage.getItem('access_token')
      const res = await fetch(`${API_URL}/api/v1/projects/${projectId}/outline/generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.code === 0) {
        // 生成成功后跳转到大纲页面
        router.push(`/projects/${projectId}/outline`)
      } else {
        setErrorModal({ show: true, message: data.detail || data.message || '生成大纲失败：' + (data.detail || '未知错误') })
      }
    } catch (error: any) {
      setErrorModal({ show: true, message: '生成大纲失败：' + (error.response?.data?.detail || error.message || '网络错误') })
    } finally {
      setLoading(false)
    }
  }

  // 删除文件
  const handleDeleteFile = async () => {
    if (!projectId) return
    if (!confirm('确定要删除招标文件吗？删除后将清空大纲，项目将回到初始状态。')) return
    try {
      await projectsAPI.deleteFile(projectId)
      const res = await projectsAPI.getProject(projectId)
      setProject(res.data)
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (error) {
      alert('删除失败')
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user')
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-base)]">
      {/* 顶部导航 */}
      <header className="h-14 bg-[var(--color-bg-surface)] border-b border-[var(--color-border)] flex items-center justify-between px-6">
        <div className="flex items-center gap-2">
          <Link href="/dashboard" className="text-xl font-bold text-[var(--color-primary)]">BidAI</Link>
          <span className="text-[var(--color-text-secondary)]">· 新建项目</span>
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
          <div className="card p-8 max-w-2xl mx-auto">
            <h1 className="text-xl font-semibold mb-6">新建项目</h1>

            {!projectId ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-lg font-semibold mb-3 text-[var(--color-text-primary)]">项目名称</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="input text-lg py-3"
                    placeholder="请输入项目名称"
                  />
                </div>
                <button
                  onClick={handleCreateProject}
                  disabled={!title.trim() || creating}
                  className="btn-primary disabled:opacity-50"
                >
                  {creating ? '创建中...' : '创建项目'}
                </button>
              </div>
            ) : (
              <div>
                {/* 步骤导航 */}
                <div className="mb-4">
                  <div className="flex items-center justify-center gap-2 text-sm">
                    <span className="flex items-center gap-1 text-green-600">
                      <span>✓</span> ① 创建项目
                    </span>
                    <span className="text-gray-400 mx-2">→</span>
                    <span className="flex items-center gap-1 text-[var(--color-primary)] font-medium">
                      <span>②</span> 上传文件
                    </span>
                    <span className="text-gray-400 mx-2">→</span>
                    <span className="text-gray-400">③ 确认大纲</span>
                    <span className="text-gray-400 mx-2">→</span>
                    <span className="text-gray-400">④ 格式设置</span>
                    <span className="text-gray-400 mx-2">→</span>
                    <span className="text-gray-400">⑤ 生成</span>
                  </div>
                </div>

                {/* 项目名称 */}
                <div className="mb-6 p-4 bg-[var(--color-bg-base)] rounded-lg">
                  <div className="text-sm text-[var(--color-text-secondary)]">项目名称</div>
                  <div className="text-lg font-medium">{project?.title || title}</div>
                </div>

                {/* 上传区域 */}
                <div
                  className="border-2 border-dashed border-[var(--color-border)] rounded-xl p-8 text-center mb-6"
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx,.doc"
                    onChange={(e) => {
                      const selectedFile = e.target.files?.[0] || null
                      if (selectedFile) {
                        setFile(selectedFile)
                        handleUpload(selectedFile)
                      }
                    }}
                    className="hidden"
                    id="file-upload"
                  />
                  <label htmlFor="file-upload" className="cursor-pointer">
                    <div className="text-4xl mb-4">📄</div>
                    <div className="text-[var(--color-text-primary)] mb-2">
                      拖拽招标文件至此处，或点击选择文件
                    </div>
                    <div className="text-sm text-[var(--color-text-secondary)]">
                      支持 PDF、Word（.docx/.doc） 最大 50MB
                    </div>
                    <div className="text-sm text-yellow-600 mt-2">
                      ⚠️ 不支持扫描件，需含文字层
                    </div>
                  </label>
                </div>

                {file && (
                  <div className="flex items-center justify-between p-4 bg-[var(--color-bg-base)] rounded-lg mb-4">
                    <div className="flex items-center gap-3">
                      <span>📄</span>
                      <span>{file.name}</span>
                      {uploading && <span className="text-[var(--color-primary)] text-sm">上传中...</span>}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => { setFile(null); if(fileInputRef.current) fileInputRef.current.value = '' }} disabled={uploading} className="text-red-500 text-sm disabled:opacity-50">
                        {uploading ? '上传中' : '取消'}
                      </button>
                    </div>
                  </div>
                )}

                {project?.tender_file_name && (
                  <div className="p-4 bg-green-50 rounded-lg mb-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span>✅</span>
                        <span>{project.tender_file_name}</span>
                      </div>
                      <button onClick={handleDeleteFile} className="text-red-500 text-sm">删除文件</button>
                    </div>
                    <div className="text-sm text-green-600 mt-2">
                      解析完成，已提取 {project.tender_file_word_count || 0} 字
                    </div>
                  </div>
                )}

                <div className="flex gap-4">
                  <Link href="/dashboard" className="btn-secondary">
                    返回工作台
                  </Link>
                  <button
                    onClick={async () => {
                      // 先从服务器获取最新的项目数据，确认文件是否已上传
                      setLoading(true)
                      try {
                        const projectRes = await projectsAPI.getProject(projectId)
                        const latestProject = projectRes.data

                        if (!latestProject.tender_file_name) {
                          alert('请先上传招标文件')
                          setLoading(false)
                          return
                        }

                        // 更新本地项目状态
                        setProject(latestProject)

                        // 1. 先检查 LLM 是否已配置
                        const checkRes = await llmAPI.checkConfig('analysis')
                        if (checkRes.data.code === 0 && !checkRes.data.data.is_configured) {
                          alert('系统未配置大模型（LLM），请联系管理员在后台配置 API Key 后再试。')
                          setLoading(false)
                          return
                        }

                        // 2. 调用生成大纲接口
                        const token = localStorage.getItem('access_token')
                        const res = await fetch(`${API_URL}/api/v1/projects/${projectId}/outline/generate`, {
                          method: 'POST',
                          headers: { Authorization: `Bearer ${token}` }
                        })
                        const data = await res.json()
                        if (data.code === 0) {
                          // 将大纲数据通过 URL 参数传递给大纲页面，避免重复加载
                          const outlineData = encodeURIComponent(JSON.stringify(data.data.outline))
                          router.push(`/projects/${projectId}/outline?outline=${outlineData}`)
                        } else {
                          setErrorModal({ show: true, message: data.detail || data.message || '生成大纲失败：' + (data.detail || '未知错误') })
                        }
                      } catch (error: any) {
                        setErrorModal({ show: true, message: '生成大纲失败：' + (error.response?.data?.detail || error.message || '网络错误') })
                      } finally {
                        setLoading(false)
                      }
                    }}
                    disabled={loading || !project?.tender_file_name}
                    className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {loading ? (
                      <>
                        <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
                        <span>AI 正在分析招标文件并生成大纲，请稍候...</span>
                      </>
                    ) : (
                      '生成大纲 →'
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* 错误提示弹窗 */}
      {errorModal.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-lg">
            <h2 className="text-lg font-semibold mb-4 text-red-600">错误提示</h2>
            <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg max-h-60 overflow-y-auto mb-4">
              <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">{errorModal.message}</pre>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(errorModal.message)
                }}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300"
              >
                复制
              </button>
              <button
                onClick={() => setErrorModal({ show: false, message: '' })}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// 包装组件，用于处理 useSearchParams
export default function NewProjectPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">加载中...</div>}>
      <NewProjectContent />
    </Suspense>
  )
}
