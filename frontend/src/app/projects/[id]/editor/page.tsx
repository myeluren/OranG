'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { projectsAPI } from '@/lib/api'

export default function EditorPage() {
  const router = useRouter()
  const params = useParams()
  const projectId = parseInt(params.id as string)
  const [project, setProject] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState(0)

  useEffect(() => {
    fetchProject()
  }, [projectId])

  const fetchProject = async () => {
    try {
      const res = await projectsAPI.getProject(projectId)
      setProject(res.data)
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  // 模拟大纲数据
  const outline = [
    { title: '第一章 技术方案', sections: ['1.1 项目理解与分析', '1.2 总体技术思路'] },
    { title: '第二章 项目管理方案', sections: ['2.1 项目组织架构', '2.2 进度计划安排'] },
    { title: '第三章 质量保障体系', sections: ['3.1 质量管理制度', '3.2 质量控制措施'] },
    { title: '第四章 商务方案', sections: ['4.1 报价说明', '4.2 服务承诺'] },
  ]

  const currentSection = outline[Math.floor(activeSection / 2)]
  const currentWords = Math.round(Math.random() * 1000 + 500)
  const totalWords = Math.round(Math.random() * 30000 + 10000)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--color-primary)]"></div>
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
          <button className="btn-secondary text-sm">💾 自动保存</button>
          <button className="btn-primary text-sm">导出 Word</button>
        </div>
      </header>

      <div className="flex-1 flex">
        {/* 左侧大纲 */}
        <aside className="w-64 bg-[var(--color-bg-surface)] border-r border-[var(--color-border)] p-4 overflow-y-auto">
          <h3 className="font-medium mb-4 text-sm text-[var(--color-text-secondary)]">章节目录</h3>
          <div className="space-y-2">
            {outline.map((chapter, i) => (
              <div key={i}>
                <button
                  onClick={() => setActiveSection(i * 2)}
                  className={`w-full text-left px-2 py-1.5 rounded text-sm ${
                    Math.floor(activeSection / 2) === i
                      ? 'bg-[var(--color-primary)] text-white'
                      : 'hover:bg-[var(--color-bg-base)]'
                  }`}
                >
                  ▼ {chapter.title}
                </button>
                {chapter.sections.map((section, j) => (
                  <button
                    key={j}
                    onClick={() => setActiveSection(i * 2 + j + 1)}
                    className={`w-full text-left px-4 py-1 text-sm ${
                      activeSection === i * 2 + j + 1
                        ? 'text-[var(--color-primary)]'
                        : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                    }`}
                  >
                    › {section}
                  </button>
                ))}
              </div>
            ))}
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
          </div>

          {/* 编辑区域 */}
          <div className="flex-1 p-8 overflow-y-auto">
            <div className="max-w-3xl mx-auto bg-white shadow-sm border border-[var(--color-border)] min-h-[600px] p-12">
              <h1 className="text-center text-xl font-bold mb-8">{project?.title}</h1>
              <h2 className="text-lg font-bold mb-4">{currentSection?.title}</h2>
              <div className="prose max-w-none">
                <p className="text-[var(--color-text-primary)] leading-relaxed mb-4">
                  本项目位于某市核心区域，根据招标文件要求，我方对项目背景及核心诉求进行了深入分析...
                </p>
                <p className="text-[var(--color-text-primary)] leading-relaxed mb-4">
                  通过对招标文件的详细解读，我方充分理解了项目的技术要求、质量标准和交付周期...
                </p>
                <p className="text-[var(--color-text-primary)] leading-relaxed mb-4">
                  结合我方在类似项目中的成功经验，制定了切实可行的技术方案和项目管理计划...
                </p>
              </div>
            </div>
          </div>
        </main>

        {/* 右侧统计 */}
        <aside className="w-48 bg-[var(--color-bg-surface)] border-l border-[var(--color-border)] p-4">
          <h3 className="font-medium mb-4 text-sm text-[var(--color-text-secondary)]">字数统计</h3>
          <div className="space-y-4">
            <div>
              <div className="text-sm text-[var(--color-text-secondary)]">当前章</div>
              <div className="text-xl font-bold">{currentWords} <span className="text-sm font-normal">字</span></div>
              <div className="text-xs text-[var(--color-text-secondary)]">目标 900 字</div>
              <div className="h-1.5 bg-gray-200 rounded-full mt-1">
                <div className="h-full bg-green-500 rounded-full" style={{ width: '70%' }}></div>
              </div>
            </div>
            <div>
              <div className="text-sm text-[var(--color-text-secondary)]">全文</div>
              <div className="text-xl font-bold">{totalWords} <span className="text-sm font-normal">字</span></div>
              <div className="text-xs text-[var(--color-text-secondary)]">目标 {project?.target_pages * project?.words_per_page || 35000} 字</div>
              <div className="h-1.5 bg-gray-200 rounded-full mt-1">
                <div className="h-full bg-[var(--color-primary)] rounded-full" style={{ width: '65%' }}></div>
              </div>
            </div>
          </div>

          <div className="mt-8">
            <button className="w-full btn-secondary text-sm mb-2">
              重新生成当前章节
            </button>
          </div>
        </aside>
      </div>
    </div>
  )
}
