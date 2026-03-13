'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { projectsAPI, subscriptionsAPI, tasksAPI } from '@/lib/api'

// 模板样式配置类型
interface TemplateStyle {
  titleFont: string
  titleSize: string
  titleWeight: string
  titleAlign: string
  bodyFont: string
  bodySize: string
  lineSpacing: string
  marginTop: string
  marginBottom: string
  marginLeft: string
  marginRight: string
  pageSize: string
  headerFont: string
  headerSize: string
}

// 模板配置
const templates = {
  government: {
    id: 'government',
    name: '政府标准',
    desc: '适用于政府采购、政务项目投标文件',
    styles: {
      titleFont: '黑体',
      titleSize: '16pt',
      titleWeight: '常规',
      titleAlign: 'center',
      bodyFont: '宋体',
      bodySize: '12pt',
      lineSpacing: '1.5倍',
      marginTop: '3cm',
      marginBottom: '2.5cm',
      marginLeft: '2.5cm',
      marginRight: '2cm',
      pageSize: 'A4',
      headerFont: '黑体',
      headerSize: '10.5pt'
    }
  },
  business: {
    id: 'business',
    name: '商务简洁',
    desc: '适用于企业商务投标、方案汇报',
    styles: {
      titleFont: 'Arial',
      titleSize: '18pt',
      titleWeight: 'Bold',
      titleAlign: 'left',
      bodyFont: 'Arial',
      bodySize: '11pt',
      lineSpacing: '1.2倍',
      marginTop: '2.5cm',
      marginBottom: '2cm',
      marginLeft: '2cm',
      marginRight: '2cm',
      pageSize: 'A4',
      headerFont: 'Arial',
      headerSize: '10pt'
    }
  },
  engineering: {
    id: 'engineering',
    name: '工程规范',
    desc: '适用于工程类、技术标投标文件',
    styles: {
      titleFont: '黑体',
      titleSize: '16pt',
      titleWeight: 'Bold',
      titleAlign: 'center',
      bodyFont: '仿宋_GB2312',
      bodySize: '12pt',
      lineSpacing: '2.0倍',
      marginTop: '3cm',
      marginBottom: '2.5cm',
      marginLeft: '2.8cm',
      marginRight: '2.5cm',
      pageSize: 'A4',
      headerFont: '黑体',
      headerSize: '10.5pt'
    }
  },
  custom: {
    id: 'custom',
    name: '自定义',
    desc: '自定义格式设置',
    styles: {
      titleFont: '黑体',
      titleSize: '16pt',
      titleWeight: '常规',
      titleAlign: 'center',
      bodyFont: '宋体',
      bodySize: '12pt',
      lineSpacing: '1.5倍',
      marginTop: '2.5cm',
      marginBottom: '2.5cm',
      marginLeft: '2.5cm',
      marginRight: '2cm',
      pageSize: 'A4',
      headerFont: '黑体',
      headerSize: '10.5pt'
    }
  }
}

// 可选的字体列表
const fontOptions = [
  '宋体', '黑体', '楷体', '仿宋_GB2312', '微软雅黑',
  'Arial', 'Times New Roman', 'Calibri', 'Helvetica'
]

// 可选的字号列表
const sizeOptions = ['9pt', '10pt', '10.5pt', '11pt', '12pt', '14pt', '16pt', '18pt', '20pt', '22pt', '24pt']

// 可选的字重列表
const weightOptions = ['常规', '中等', 'Bold', 'Bolder']

// 可选的对齐方式
const alignOptions = ['left', 'center', 'right']

// 可选的行距列表
const lineSpacingOptions = ['1.0倍', '1.15倍', '1.2倍', '1.5倍', '1.75倍', '2.0倍', '2.5倍']

// 可选的页边距列表
const marginOptions = ['1.5cm', '2.0cm', '2.5cm', '2.8cm', '3.0cm', '3.5cm', '4.0cm']

// 可选的纸张大小
const pageSizeOptions = ['A4', 'A3', 'Letter', 'Legal']

// 章节字数分配类型
interface ChapterDistribution {
  chapter_id: number
  chapter_name: string
  word_count: number
  percentage: number
}

function FormatContent() {
  const router = useRouter()
  const params = useParams()
  const { theme, setTheme } = useTheme()
  const [user, setUser] = useState<any>(null)
  const [project, setProject] = useState<any>(null)
  const [subscription, setSubscription] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [targetPages, setTargetPages] = useState(60)
  const [wordsPerPage, setWordsPerPage] = useState(700)
  const [template, setTemplate] = useState('government')
  const [showStyles, setShowStyles] = useState(true)
  const [showChapterModal, setShowChapterModal] = useState(false)
  const [editingStyles, setEditingStyles] = useState<TemplateStyle>(templates.government.styles)
  const [chapters, setChapters] = useState<ChapterDistribution[]>([])
  const [projectOutlines, setProjectOutlines] = useState<any[]>([])

  // 监听模板变化，更新可编辑样式
  useEffect(() => {
    if (template === 'custom') {
      // 自定义模板保持当前编辑的样式
      return
    }
    const templateStyles = templates[template as keyof typeof templates].styles
    setEditingStyles(prev => ({
      ...templateStyles,
      titleAlign: templateStyles.titleAlign || 'center'
    }))
  }, [template])

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

      // 获取项目大纲用于各章分配
      if (projectRes.data.outlines) {
        try {
          const outlines = JSON.parse(projectRes.data.outlines)
          setProjectOutlines(outlines)

          // 根据大纲生成分配数据
          const totalWords = (projectRes.data.target_pages || 60) * (projectRes.data.words_per_page || 700)
          const distribution: ChapterDistribution[] = []
          let chapterIndex = 0

          const processOutline = (items: any[], parentName: string = '') => {
            for (const item of items) {
              if (item.children && item.children.length > 0) {
                // 有子章节的作为一级章节
                const baseCount = Math.floor(totalWords / (items.filter(i => i.children && i.children.length > 0).length + 1))
                distribution.push({
                  chapter_id: chapterIndex++,
                  chapter_name: item.title || parentName,
                  word_count: baseCount,
                  percentage: Math.round((baseCount / totalWords) * 100)
                })
                processOutline(item.children, item.title)
              }
            }
          }

          processOutline(outlines)
          setChapters(distribution)
        } catch (e) {
          console.error('Failed to parse outlines:', e)
          // 如果没有大纲，生成默认的章节分配
          const totalWords = (projectRes.data.target_pages || 60) * (projectRes.data.words_per_page || 700)
          setChapters([
            { chapter_id: 1, chapter_name: '第一章', word_count: Math.floor(totalWords * 0.3), percentage: 30 },
            { chapter_id: 2, chapter_name: '第二章', word_count: Math.floor(totalWords * 0.25), percentage: 25 },
            { chapter_id: 3, chapter_name: '第三章', word_count: Math.floor(totalWords * 0.2), percentage: 20 },
            { chapter_id: 4, chapter_name: '第四章', word_count: Math.floor(totalWords * 0.15), percentage: 15 },
            { chapter_id: 5, chapter_name: '其他', word_count: Math.floor(totalWords * 0.1), percentage: 10 },
          ])
        }
      }

      if (projectRes.data.target_pages) {
        setTargetPages(projectRes.data.target_pages)
      } else {
        setTargetPages(60)
      }
      if (projectRes.data.words_per_page) {
        setWordsPerPage(projectRes.data.words_per_page)
      }
      if (projectRes.data.template) {
        setTemplate(projectRes.data.template)
      }
      // 加载保存的自定义样式
      if (projectRes.data.template_styles) {
        try {
          const savedStyles = JSON.parse(projectRes.data.template_styles)
          setEditingStyles(savedStyles)
        } catch (e) {
          console.error('Failed to parse saved styles:', e)
        }
      }
    } catch (error) {
      console.error('Failed to fetch data:', error)
    } finally {
      setLoading(false)
    }
  }

  // 当总字数变化时，更新各章分配
  useEffect(() => {
    if (chapters.length > 0 && totalWords > 0) {
      const newChapters = chapters.map((ch, idx) => {
        const newCount = Math.floor(totalWords * (ch.percentage / 100))
        return { ...ch, word_count: newCount }
      })
      setChapters(newChapters)
    }
  }, [targetPages, wordsPerPage])

  const totalWords = targetPages * wordsPerPage

  const handleSaveFormat = async () => {
    setSaving(true)
    try {
      // 1. 先保存项目设置，包括自定义样式
      await projectsAPI.updateProject(projectId, {
        target_pages: targetPages,
        words_per_page: wordsPerPage,
        template: template,
        template_styles: JSON.stringify(editingStyles), // 保存自定义样式
        status: 'format_set'
      })

      // 2. 创建生成任务，开始调用大模型生成
      await tasksAPI.createTask(projectId)

      // 3. 跳转到工作台页面
      router.push('/dashboard')
    } catch (error: any) {
      console.error('Failed to start generation:', error)
      const errorMsg = error?.response?.data?.detail || '开始生成失败'
      alert(errorMsg)
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
          <span className="text-[var(--color-text-secondary)]">· 格式设置</span>
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
          <div className="card p-6">
            <h1 className="text-xl font-semibold mb-6">格式与页数设置</h1>

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
                <span className="flex items-center gap-1 text-[var(--color-primary)] font-medium">
                  <span className="w-6 h-6 rounded-full bg-[var(--color-primary)] text-white flex items-center justify-center">3</span>
                  格式设置
                </span>
                <span className="mx-2 text-gray-300">──</span>
                <span className="flex items-center gap-1 text-gray-400">
                  <span className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center">4</span>
                  生成
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8">
              <div>
                <h3 className="font-medium mb-4">格式模板</h3>
                <div className="space-y-2">
                  {Object.values(templates).map((t) => (
                    <label key={t.id} className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-[var(--color-bg-base)] ${template === t.id ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5' : ''}`}>
                      <input
                        type="radio"
                        name="template"
                        checked={template === t.id}
                        onChange={() => setTemplate(t.id)}
                        className="w-4 h-4 text-[var(--color-primary)]"
                      />
                      <div>
                        <div className="font-medium">{t.name}</div>
                        <div className="text-xs text-[var(--color-text-secondary)]">{t.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>

                {/* 模板样式设置展示 */}
                <div className="mt-6">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-sm">模板样式设置</h4>
                    <button
                      onClick={() => setShowStyles(!showStyles)}
                      className="text-xs text-[var(--color-primary)] hover:underline"
                    >
                      {showStyles ? '收起详情' : '展开详情'}
                    </button>
                  </div>

                  {showStyles && (
                    <div className="border rounded-lg overflow-hidden bg-white dark:bg-gray-800">
                      {/* 标题样式 */}
                      <div className="p-3 border-b bg-gray-50 dark:bg-gray-700">
                        <div className="text-xs font-medium text-[var(--color-text-secondary)] mb-2">一级标题</div>
                        <div className="grid grid-cols-4 gap-2 text-sm">
                          <div>
                            <label className="text-xs text-gray-500">字体：</label>
                            <select
                              value={editingStyles.titleFont}
                              onChange={(e) => setEditingStyles({...editingStyles, titleFont: e.target.value})}
                              className="w-full mt-1 px-2 py-1 text-xs border rounded"
                            >
                              {fontOptions.map(f => <option key={f} value={f}>{f}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-gray-500">字号：</label>
                            <select
                              value={editingStyles.titleSize}
                              onChange={(e) => setEditingStyles({...editingStyles, titleSize: e.target.value})}
                              className="w-full mt-1 px-2 py-1 text-xs border rounded"
                            >
                              {sizeOptions.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-gray-500">字重：</label>
                            <select
                              value={editingStyles.titleWeight}
                              onChange={(e) => setEditingStyles({...editingStyles, titleWeight: e.target.value})}
                              className="w-full mt-1 px-2 py-1 text-xs border rounded"
                            >
                              {weightOptions.map(w => <option key={w} value={w}>{w}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-gray-500">对齐：</label>
                            <select
                              value={editingStyles.titleAlign}
                              onChange={(e) => setEditingStyles({...editingStyles, titleAlign: e.target.value})}
                              className="w-full mt-1 px-2 py-1 text-xs border rounded"
                            >
                              <option value="left">居左</option>
                              <option value="center">居中</option>
                              <option value="right">居右</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* 正文样式 */}
                      <div className="p-3 border-b bg-gray-50 dark:bg-gray-700">
                        <div className="text-xs font-medium text-[var(--color-text-secondary)] mb-2">正文样式</div>
                        <div className="grid grid-cols-3 gap-2 text-sm">
                          <div>
                            <label className="text-xs text-gray-500">字体：</label>
                            <select
                              value={editingStyles.bodyFont}
                              onChange={(e) => setEditingStyles({...editingStyles, bodyFont: e.target.value})}
                              className="w-full mt-1 px-2 py-1 text-xs border rounded"
                            >
                              {fontOptions.map(f => <option key={f} value={f}>{f}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-gray-500">字号：</label>
                            <select
                              value={editingStyles.bodySize}
                              onChange={(e) => setEditingStyles({...editingStyles, bodySize: e.target.value})}
                              className="w-full mt-1 px-2 py-1 text-xs border rounded"
                            >
                              {sizeOptions.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-gray-500">行距：</label>
                            <select
                              value={editingStyles.lineSpacing}
                              onChange={(e) => setEditingStyles({...editingStyles, lineSpacing: e.target.value})}
                              className="w-full mt-1 px-2 py-1 text-xs border rounded"
                            >
                              {lineSpacingOptions.map(l => <option key={l} value={l}>{l}</option>)}
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* 页边距 */}
                      <div className="p-3 border-b bg-gray-50 dark:bg-gray-700">
                        <div className="text-xs font-medium text-[var(--color-text-secondary)] mb-2">页边距</div>
                        <div className="grid grid-cols-4 gap-2 text-sm">
                          <div>
                            <label className="text-xs text-gray-500">上：</label>
                            <select
                              value={editingStyles.marginTop}
                              onChange={(e) => setEditingStyles({...editingStyles, marginTop: e.target.value})}
                              className="w-full mt-1 px-2 py-1 text-xs border rounded"
                            >
                              {marginOptions.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-gray-500">下：</label>
                            <select
                              value={editingStyles.marginBottom}
                              onChange={(e) => setEditingStyles({...editingStyles, marginBottom: e.target.value})}
                              className="w-full mt-1 px-2 py-1 text-xs border rounded"
                            >
                              {marginOptions.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-gray-500">左：</label>
                            <select
                              value={editingStyles.marginLeft}
                              onChange={(e) => setEditingStyles({...editingStyles, marginLeft: e.target.value})}
                              className="w-full mt-1 px-2 py-1 text-xs border rounded"
                            >
                              {marginOptions.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-gray-500">右：</label>
                            <select
                              value={editingStyles.marginRight}
                              onChange={(e) => setEditingStyles({...editingStyles, marginRight: e.target.value})}
                              className="w-full mt-1 px-2 py-1 text-xs border rounded"
                            >
                              {marginOptions.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* 页面设置 */}
                      <div className="p-3 bg-gray-50 dark:bg-gray-700">
                        <div className="text-xs font-medium text-[var(--color-text-secondary)] mb-2">页面设置</div>
                        <div className="grid grid-cols-3 gap-2 text-sm">
                          <div>
                            <label className="text-xs text-gray-500">纸张：</label>
                            <select
                              value={editingStyles.pageSize}
                              onChange={(e) => setEditingStyles({...editingStyles, pageSize: e.target.value})}
                              className="w-full mt-1 px-2 py-1 text-xs border rounded"
                            >
                              {pageSizeOptions.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-gray-500">页眉字体：</label>
                            <select
                              value={editingStyles.headerFont}
                              onChange={(e) => setEditingStyles({...editingStyles, headerFont: e.target.value})}
                              className="w-full mt-1 px-2 py-1 text-xs border rounded"
                            >
                              {fontOptions.map(f => <option key={f} value={f}>{f}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-gray-500">页眉字号：</label>
                            <select
                              value={editingStyles.headerSize}
                              onChange={(e) => setEditingStyles({...editingStyles, headerSize: e.target.value})}
                              className="w-full mt-1 px-2 py-1 text-xs border rounded"
                            >
                              {sizeOptions.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 样式预览 */}
                  <div className="mt-4 p-4 border rounded-lg bg-white dark:bg-gray-800">
                    <div className="text-xs font-medium text-[var(--color-text-secondary)] mb-3">预览效果</div>
                    <div className="space-y-3">
                      <div
                        className="text-center"
                        style={{
                          fontFamily: editingStyles.titleFont === 'Arial' ? 'Arial' : (editingStyles.titleFont.includes('黑体') ? 'SimHei, Microsoft YaHei' : editingStyles.titleFont),
                          fontSize: editingStyles.titleSize,
                          fontWeight: editingStyles.titleWeight === 'Bold' ? 'bold' : (editingStyles.titleWeight === 'Bolder' ? '800' : 'normal'),
                          textAlign: editingStyles.titleAlign as 'left' | 'center' | 'right'
                        }}
                      >
                        第一章 技术方案
                      </div>
                      <div className="text-gray-500 text-xs text-center">一级标题</div>
                      <div
                        className="mt-2"
                        style={{
                          fontFamily: editingStyles.bodyFont === 'Arial' ? 'Arial' : (editingStyles.bodyFont.includes('仿宋') ? 'FangSong_GB2312, SimSun' : editingStyles.bodyFont),
                          fontSize: editingStyles.bodySize,
                          lineHeight: editingStyles.lineSpacing.replace('倍', '')
                        }}
                      >
                        <p>1.1 项目理解与分析</p>
                        <p style={{ textIndent: '2em', marginTop: '0.5em' }}>
                          根据招标文件的要求，本项目需要充分理解项目背景、招标需求及评分标准...
                        </p>
                      </div>
                      <div className="text-gray-500 text-xs text-center">正文内容</div>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-medium mb-4">字数规划</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-[var(--color-text-secondary)] mb-1">目标页数</label>
                    <input
                      type="number"
                      value={targetPages}
                      onChange={(e) => setTargetPages(parseInt(e.target.value) || 60)}
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
                    <div className="text-lg font-medium mb-4">总字数: {totalWords.toLocaleString()} 字</div>
                  </div>

                  {/* 各章字数分配 */}
                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">各章字数分配</span>
                      <button
                        onClick={() => setShowChapterModal(true)}
                        className="text-xs text-[var(--color-primary)] hover:underline"
                      >
                        点击调整各章分配
                      </button>
                    </div>
                    <div className="space-y-2">
                      {chapters.slice(0, 5).map((ch, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <span className="text-sm w-20 truncate">{ch.chapter_name}</span>
                          <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[var(--color-primary)]"
                              style={{ width: `${ch.percentage}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500 w-16 text-right">
                            {ch.word_count.toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                    {chapters.length > 0 && (
                      <div className="mt-2 text-xs text-amber-600 flex items-center gap-1">
                        <span>⚠️</span>
                        <span>总分配需 = 总字数</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-4 mt-8">
              <Link href={`/projects/${projectId}/outline`} className="btn-secondary">
                ← 返回大纲
              </Link>
              <button onClick={handleSaveFormat} disabled={saving} className="btn-primary">
                {saving ? '正在生成...' : '开始生成文档 →'}
              </button>
            </div>
          </div>
        </main>
      </div>

      {/* 各章字数分配弹窗 */}
      {showChapterModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium">各章字数分配</h3>
              <button
                onClick={() => setShowChapterModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {chapters.map((ch, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <span className="text-sm w-20 truncate">{ch.chapter_name}</span>
                  <input
                    type="range"
                    min={0}
                    max={totalWords}
                    value={ch.word_count}
                    onChange={(e) => {
                      const newCount = parseInt(e.target.value) || 0
                      const newChapters = [...chapters]
                      newChapters[idx] = {
                        ...ch,
                        word_count: newCount,
                        percentage: Math.round((newCount / totalWords) * 100)
                      }
                      setChapters(newChapters)
                    }}
                    className="flex-1"
                  />
                  <input
                    type="number"
                    value={ch.word_count}
                    onChange={(e) => {
                      const newCount = parseInt(e.target.value) || 0
                      const newChapters = [...chapters]
                      newChapters[idx] = {
                        ...ch,
                        word_count: newCount,
                        percentage: Math.round((newCount / totalWords) * 100)
                      }
                      setChapters(newChapters)
                    }}
                    className="input w-20 text-right text-sm"
                    min={0}
                  />
                  <span className="text-xs text-gray-500 w-12">字 ({ch.percentage}%)</span>
                </div>
              ))}

              <div className="pt-4 border-t flex justify-between">
                <span className="text-sm text-gray-500">已分配:</span>
                <span className={`text-sm font-medium ${chapters.reduce((sum, ch) => sum + ch.word_count, 0) === totalWords ? 'text-green-600' : 'text-amber-600'}`}>
                  {chapters.reduce((sum, ch) => sum + ch.word_count, 0).toLocaleString()} / {totalWords.toLocaleString()} 字
                </span>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowChapterModal(false)}
                className="btn-secondary"
              >
                取消
              </button>
              <button
                onClick={() => setShowChapterModal(false)}
                className="btn-primary"
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function FormatPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">加载中...</div>}>
      <FormatContent />
    </Suspense>
  )
}
