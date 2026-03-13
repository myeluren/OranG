'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { projectsAPI, subscriptionsAPI, llmAPI } from '@/lib/api'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

function NewProjectContent() {
  const router = useRouter()
  const params = useSearchParams()
  const { theme, setTheme } = useTheme()
  const step = parseInt(params.get('step') || '1')
  const projectIdParam = params.get('projectId')

  const [user, setUser] = useState<any>(null)
  const [subscription, setSubscription] = useState<any>(null)
  const [projectId, setProjectId] = useState<number | null>(projectIdParam ? parseInt(projectIdParam) : null)
  const [title, setTitle] = useState('')
  const [project, setProject] = useState<any>(null)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [outline, setOutline] = useState<any[]>([])
  const [editingOutline, setEditingOutline] = useState<any[]>([])
  const [targetPages, setTargetPages] = useState(50)
  const [wordsPerPage, setWordsPerPage] = useState(700)
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [errorModal, setErrorModal] = useState<{ show: boolean; message: string }>({ show: false, message: '' })
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 步骤名称
  const stepNames = ['上传文件', '确认大纲', '格式设置', '生成']

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

  // 当 step 变化时刷新项目数据
  useEffect(() => {
    if (step === 1 && projectId) {
      fetchData()
    }
  }, [step])

  // 创建项目
  const handleCreateProject = async () => {
    if (!title.trim()) return
    setCreating(true)
    try {
      const res = await projectsAPI.createProject({ title })
      setProjectId(res.data.id)
      setProject(res.data)
      router.push(`/projects/new?step=1&projectId=${res.data.id}`)
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
        // 自动上传
        handleUpload(droppedFile)
      } else {
        alert('仅支持 PDF、Word 文件')
      }
    }
  }

  // 生成大纲
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

      // 2. 调用生成接口
      const token = localStorage.getItem('access_token')
      const res = await fetch(`${API_URL}/api/v1/projects/${projectId}/outline/generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.code === 0) {
        setOutline(data.data.outline || [])
        const res2 = await projectsAPI.getProject(projectId)
        setProject(res2.data)
      } else {
        alert(data.message || '生成大纲失败')
      }
    } catch (error) {
      alert('生成大纲失败')
    } finally {
      setLoading(false)
    }
  }

  // 保存格式设置
  const handleSaveFormat = async () => {
    if (!projectId) return
    try {
      // 检查 LLM 是否已配置（生成模型）
      const checkRes = await llmAPI.checkConfig('generation')
      if (checkRes.data.code === 0 && !checkRes.data.data.is_configured) {
        alert('系统未配置大模型（LLM），请联系管理员在后台配置 API Key 后再试。')
        return
      }

      await projectsAPI.updateProject(projectId, {
        target_pages: targetPages,
        words_per_page: wordsPerPage,
        status: 'format_set'
      })
      router.push(`/projects/${projectId}/generate`)
    } catch (error) {
      alert('保存失败')
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
      setOutline([])
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

  const totalWords = targetPages * wordsPerPage

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
          {/* 步骤条 */}
          <div className="mb-8">
            <div className="flex items-center justify-center mb-2">
              {stepNames.map((s, i) => (
                <div key={i} className="flex items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                    step > i + 1 ? 'bg-green-500 text-white' :
                    step === i + 1 ? 'bg-[var(--color-primary)] text-white' :
                    'bg-gray-200 text-gray-500'
                  }`}>
                    {step > i + 1 ? '✓' : i + 1}
                  </div>
                  <span className={`ml-2 ${step === i + 1 ? 'text-[var(--color-primary)] font-medium' : 'text-gray-500'}`}>{s}</span>
                  {i < 3 && <span className="mx-4 text-gray-300">——</span>}
                </div>
              ))}
            </div>
            {projectId && (
              <div className="text-center text-sm text-gray-500">
                项目：{project?.title || title}
              </div>
            )}
          </div>

          {/* Step 1: 上传文件 */}
          {step === 1 && (
            <div className="card p-8">
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
                          // 自动上传
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
                    <div className="p-4 bg-green-50 rounded-lg mb-4">
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
                            setOutline(data.data.outline || [])
                            setEditingOutline(data.data.outline || [])
                            router.push(`/projects/new?step=2&projectId=${projectId}`)
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
                      className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? '生成中...' : '下一步：生成大纲 →'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2: 大纲 */}
          {step === 2 && (
            <div className="card p-8">
              <h1 className="text-xl font-semibold mb-2">确认大纲</h1>
              <p className="text-sm text-[var(--color-text-secondary)] mb-6">
                ℹ️ AI 已根据招标文件的投标要求与评分标准生成大纲，请核对并按需调整。您也可以手动添加、修改、删除章节。
              </p>

              {!outline.length ? (
                <div className="text-center py-8">
                  <button
                    onClick={handleGenerateOutline}
                    disabled={loading}
                    className="btn-primary"
                  >
                    {loading ? '生成中...' : 'AI 生成大纲'}
                  </button>
                </div>
              ) : (
                <div>
                  {/* 大纲编辑区域 */}
                  <div className="border border-[var(--color-border)] rounded-lg p-4 mb-6 max-h-96 overflow-y-auto">
                    {editingOutline.map((chapter, i) => (
                      <div key={i} className="mb-4 p-3 bg-[var(--color-bg-base)] rounded-lg">
                        <div className="flex items-center gap-2">
                          <span className="text-[var(--color-primary)] font-medium">第 {i + 1} 章</span>
                          <input
                            type="text"
                            value={chapter.title}
                            onChange={(e) => {
                              const newOutline = [...editingOutline]
                              newOutline[i].title = e.target.value
                              setEditingOutline(newOutline)
                            }}
                            className="flex-1 input text-sm"
                            placeholder="章节标题"
                          />
                          <button
                            onClick={() => {
                              const newOutline = editingOutline.filter((_, idx) => idx !== i)
                              setEditingOutline(newOutline)
                            }}
                            className="text-red-500 text-sm"
                          >
                            删除
                          </button>
                        </div>
                        {/* 章节内容 */}
                        <div className="ml-4 mt-2 space-y-2">
                          {chapter.children?.map((section: any, j: number) => (
                            <div key={j} className="flex items-center gap-2">
                              <span className="text-gray-400">›</span>
                              <input
                                type="text"
                                value={section.title}
                                onChange={(e) => {
                                  const newOutline = [...editingOutline]
                                  newOutline[i].children[j].title = e.target.value
                                  setEditingOutline(newOutline)
                                }}
                                className="flex-1 input text-sm"
                                placeholder="章节内容"
                              />
                              <button
                                onClick={() => {
                                  const newOutline = [...editingOutline]
                                  newOutline[i].children = newOutline[i].children.filter((_: any, idx: number) => idx !== j)
                                  setEditingOutline(newOutline)
                                }}
                                className="text-red-400 text-xs"
                              >
                                删除
                              </button>
                            </div>
                          ))}
                          <button
                            onClick={() => {
                              const newOutline = [...editingOutline]
                              if (!newOutline[i].children) newOutline[i].children = []
                              newOutline[i].children.push({ title: '' })
                              setEditingOutline(newOutline)
                            }}
                            className="text-[var(--color-primary)] text-sm"
                          >
                            + 添加内容
                          </button>
                        </div>
                      </div>
                    ))}
                    {/* 添加章节按钮 */}
                    <button
                      onClick={() => {
                        setEditingOutline([...editingOutline, { title: '', children: [] }])
                      }}
                      className="w-full p-3 border-2 border-dashed border-[var(--color-border)] rounded-lg text-[var(--color-primary)] hover:bg-[var(--color-bg-base)]"
                    >
                      + 添加章节
                    </button>
                  </div>

                  <p className="text-sm text-[var(--color-text-secondary)] mb-4">
                    共 {editingOutline.length} 章
                  </p>

                  <div className="flex gap-4">
                    <button
                      onClick={() => router.push(`/projects/new?step=1&projectId=${projectId}`)}
                      className="btn-secondary"
                    >
                      ← 返回上传文件
                    </button>
                    <button
                      onClick={async () => {
                        if (!projectId) {
                          alert('项目不存在，请重新创建')
                          return
                        }
                        setLoading(true)
                        try {
                          // 保存大纲到服务器
                          await projectsAPI.updateProject(projectId, {
                            outline_json: JSON.stringify(editingOutline)
                          })
                          // 保存后继续到格式设置
                          router.push(`/projects/new?step=3&projectId=${projectId}`)
                        } catch (error: any) {
                          alert('保存大纲失败：' + (error.response?.data?.detail || '网络错误'))
                        } finally {
                          setLoading(false)
                        }
                      }}
                      disabled={loading}
                      className="btn-primary"
                    >
                      {loading ? '保存中...' : '确认大纲，下一步 →'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: 格式设置 */}
          {step === 3 && (
            <div className="card p-8">
              <h1 className="text-xl font-semibold mb-6">格式设置</h1>

              <div className="grid grid-cols-2 gap-8">
                <div>
                  <h3 className="font-medium mb-4">字数规划</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm text-[var(--color-text-secondary)] mb-1">目标页数</label>
                      <input
                        type="number"
                        value={targetPages}
                        onChange={(e) => setTargetPages(parseInt(e.target.value) || 50)}
                        className="input w-32"
                        min={1}
                        max={999}
                      />
                      <span className="ml-2">页</span>
                    </div>
                    <div>
                      <label className="block text-sm text-[var(--color-text-secondary)] mb-1">每页字数</label>
                      <input
                        type="number"
                        value={wordsPerPage}
                        onChange={(e) => setWordsPerPage(parseInt(e.target.value) || 700)}
                        className="input w-32"
                      />
                      <span className="ml-2">字</span>
                    </div>
                    <div className="pt-4 border-t">
                      <div className="text-lg font-medium">总字数: {totalWords.toLocaleString()} 字</div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-medium mb-4">格式模板</h3>
                  <div className="space-y-2">
                    {['政府标准', '商务简洁', '工程规范'].map((name, i) => (
                      <label key={i} className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-[var(--color-bg-base)]">
                        <input type="radio" name="template" defaultChecked={i === 0} />
                        <span>{name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-4 mt-8">
                <button
                  onClick={() => router.push(`/projects/new?step=2&projectId=${projectId}`)}
                  className="btn-secondary"
                >
                  ← 返回大纲
                </button>
                <button onClick={handleSaveFormat} className="btn-primary">
                  开始生成文档 →
                </button>
              </div>
            </div>
          )}
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
