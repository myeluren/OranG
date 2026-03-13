'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { plansAPI, extractData } from '@/lib/api'

export default function AdminPlansPage() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const [user, setUser] = useState<any>(null)
  const [plans, setPlans] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingPlan, setEditingPlan] = useState<any>(null)
  const [formData, setFormData] = useState({
    name: '',
    price: 0,
    period_word_limit: 500000,
    valid_days: 30,
    features: { templates: ['standard'], priority_queue: false, sla: 'normal' }
  })
  const [wordsPerPage, setWordsPerPage] = useState(700)
  const [saving, setSaving] = useState(false)

  // 加载保存的设置
  useEffect(() => {
    const saved = localStorage.getItem('words_per_page')
    if (saved) {
      setWordsPerPage(parseInt(saved))
    }
  }, [])

  const handleSaveWordsPerPage = () => {
    localStorage.setItem('words_per_page', wordsPerPage.toString())
    alert('保存成功')
  }

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (!userData) {
      router.push('/login')
      return
    }
    const parsedUser = JSON.parse(userData)
    setUser(parsedUser)
    if (parsedUser.role !== 'super_admin') {
      router.push('/dashboard')
      return
    }
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const res = await plansAPI.getPlans()
      // 使用 extractData 统一处理返回格式
      setPlans(extractData(res) || [])
    } catch (error) {
      console.error('Failed to fetch plans:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    try {
      await plansAPI.createPlan(formData)
      setShowModal(false)
      resetForm()
      fetchData()
    } catch (error: any) {
      alert(error.response?.data?.detail || '创建失败')
    }
  }

  const handleUpdate = async () => {
    if (!editingPlan) return
    try {
      await plansAPI.updatePlan(editingPlan.id, formData)
      setEditingPlan(null)
      resetForm()
      fetchData()
    } catch (error: any) {
      alert(error.response?.data?.detail || '更新失败')
    }
  }

  const handleToggleStatus = async (planId: number, currentStatus: boolean) => {
    try {
      await plansAPI.updatePlan(planId, { is_active: !currentStatus })
      fetchData()
    } catch (error) {
      alert('操作失败')
    }
  }

  const resetForm = () => {
    setFormData({
      name: '',
      price: 0,
      period_word_limit: 500000,
      valid_days: 30,
      features: { templates: ['standard'], priority_queue: false, sla: 'normal' }
    })
  }

  const openEditModal = (plan: any) => {
    setEditingPlan(plan)
    setFormData({
      name: plan.name,
      price: plan.price,
      period_word_limit: plan.period_word_limit,
      valid_days: plan.valid_days,
      features: plan.features_json || { templates: ['standard'], priority_queue: false, sla: 'normal' }
    })
    setShowModal(true)
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="h-14 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-6">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold text-blue-600 dark:text-blue-400">BidAI</span>
          <span className="text-gray-500 dark:text-gray-400">· 管理后台</span>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button onClick={handleLogout} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">退出</button>
        </div>
      </header>

      <div className="flex">
        <aside className="w-56 bg-gray-900 text-white min-h-[calc(100vh-56px)] p-4">
          <nav className="space-y-1">
            <Link href="/dashboard" className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-300 hover:bg-white/10 mb-4">
              <span>←</span> 返回主工作台
            </Link>
            <Link href="/admin/users" className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-300 hover:bg-white/10">
              <span>👥</span> 用户管理
            </Link>
            <Link href="/admin/tenants" className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-300 hover:bg-white/10">
              <span>🏢</span> 租户管理
            </Link>
            <Link href="/admin/plans" className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-blue-600">
              <span>📦</span> 套餐管理
            </Link>
            <Link href="/admin/llm" className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-300 hover:bg-white/10">
              <span>🤖</span> LLM配置
            </Link>
            <Link href="/admin/stats" className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-300 hover:bg-white/10">
              <span>📊</span> 数据统计
            </Link>
          </nav>
        </aside>

        <main className="flex-1 p-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">套餐管理</h1>
            <button onClick={() => { resetForm(); setEditingPlan(null); setShowModal(true) }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
              + 新建套餐
            </button>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden mb-8">
            <table className="w-full">
              <thead className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                <tr className="text-left text-sm text-gray-500 dark:text-gray-400">
                  <th className="px-6 py-3 font-medium">套餐名称</th>
                  <th className="px-6 py-3 font-medium">月费</th>
                  <th className="px-6 py-3 font-medium">字数/期</th>
                  <th className="px-6 py-3 font-medium">有效天数</th>
                  <th className="px-6 py-3 font-medium">状态</th>
                  <th className="px-6 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {plans.map((plan) => (
                  <tr key={plan.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">{plan.name}</td>
                    <td className="px-6 py-4 text-gray-900 dark:text-white">¥{plan.price}</td>
                    <td className="px-6 py-4 text-gray-900 dark:text-white">{(plan.period_word_limit / 10000).toFixed(0)}万字</td>
                    <td className="px-6 py-4 text-gray-900 dark:text-white">{plan.valid_days}天</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs ${plan.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                        {plan.is_active ? '上架' : '下架'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button onClick={() => openEditModal(plan)} className="text-blue-600 dark:text-blue-400 hover:underline text-sm mr-3">编辑</button>
                      <button onClick={() => handleToggleStatus(plan.id, plan.is_active)} className="text-gray-600 dark:text-gray-400 hover:underline text-sm">
                        {plan.is_active ? '下架' : '上架'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 全局参数 */}
          <div>
            <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">全局参数</h2>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <div className="flex items-center gap-4">
                <label className="text-sm text-gray-700 dark:text-gray-300">每页基准字数:</label>
                <input
                  type="number"
                  value={wordsPerPage}
                  onChange={(e) => setWordsPerPage(parseInt(e.target.value) || 700)}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white w-24"
                />
                <span className="text-sm text-gray-500 dark:text-gray-400">字/页</span>
                <button onClick={handleSaveWordsPerPage} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
                  保存
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
              {editingPlan ? '编辑套餐' : '新建套餐'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">套餐名称 *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">价格(元) *</label>
                <input
                  type="number"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">字数限额/期 *</label>
                <input
                  type="number"
                  value={formData.period_word_limit}
                  onChange={(e) => setFormData({ ...formData, period_word_limit: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">有效天数 *</label>
                <input
                  type="number"
                  value={formData.valid_days}
                  onChange={(e) => setFormData({ ...formData, valid_days: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => { setShowModal(false); setEditingPlan(null) }} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300">
                取消
              </button>
              <button onClick={editingPlan ? handleUpdate : handleCreate} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
                {editingPlan ? '保存' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
