'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { tenantsAPI, plansAPI, subscriptionsAPI, extractData } from '@/lib/api'

export default function AdminTenantsPage() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const [user, setUser] = useState<any>(null)
  const [tenants, setTenants] = useState<any[]>([])
  const [plans, setPlans] = useState<any[]>([])
  const [subscriptions, setSubscriptions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showSubModal, setShowSubModal] = useState(false)
  const [editingTenant, setEditingTenant] = useState<any>(null)
  const [detailTenant, setDetailTenant] = useState<any>(null)
  const [formData, setFormData] = useState({ name: '', contact_person: '', contact_phone: '', contact_email: '', description: '' })
  const [editingFormData, setEditingFormData] = useState({ name: '', contact_person: '', contact_phone: '', contact_email: '', description: '' })
  const [subForm, setSubForm] = useState({ plan_id: 1, valid_days: 30, period_word_limit: 500000, remark: '' })

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
      const [tenantsRes, plansRes, subsRes] = await Promise.all([
        tenantsAPI.getTenants({ limit: 100 }),
        plansAPI.getPlans(),
        subscriptionsAPI.getAll()
      ])
      // 使用 extractData 统一处理返回格式
      setTenants(extractData(tenantsRes) || [])
      setPlans(extractData(plansRes) || [])
      setSubscriptions(extractData(subsRes) || [])
    } catch (error) {
      console.error('Failed to fetch data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateTenant = async () => {
    if (!formData.name) {
      alert('请填写租户名称')
      return
    }
    try {
      await tenantsAPI.createTenant(formData)
      setShowModal(false)
      setFormData({ name: '', contact_person: '', contact_phone: '', contact_email: '', description: '' })
      fetchData()
    } catch (error: any) {
      alert(error.response?.data?.detail || '创建失败')
    }
  }

  const openEdit = (tenant: any) => {
    setEditingTenant(tenant)
    setEditingFormData({
      name: tenant.name || '',
      contact_person: tenant.contact_person || '',
      contact_phone: tenant.contact_phone || '',
      contact_email: tenant.contact_email || '',
      description: tenant.description || ''
    })
    setShowDetailModal(true)
  }

  const handleUpdateTenant = async () => {
    if (!editingTenant) return
    if (!editingFormData.name) {
      alert('请填写租户名称')
      return
    }
    try {
      await tenantsAPI.updateTenant(editingTenant.id, editingFormData)
      setShowDetailModal(false)
      setEditingTenant(null)
      fetchData()
      alert('保存成功')
    } catch (error: any) {
      alert(error.response?.data?.detail || '保存失败')
    }
  }

  const openDetail = async (tenant: any) => {
    setDetailTenant(tenant)
    setShowDetailModal(true)
  }

  const openSubModal = (tenant: any) => {
    setDetailTenant(tenant)
    setSubForm({ plan_id: 1, valid_days: 30, period_word_limit: 500000, remark: '' })
    setShowSubModal(true)
  }

  const handleCreateSubscription = async () => {
    if (!detailTenant) return
    try {
      await subscriptionsAPI.create(detailTenant.id, subForm)
      setShowSubModal(false)
      setShowDetailModal(false)
      fetchData()
      alert('开通成功')
    } catch (error: any) {
      alert(error.response?.data?.detail || '开通失败')
    }
  }

  const getSubscription = (tenantId: number) => {
    return subscriptions.find(s => s.tenant_id === tenantId && s.status === 'active')
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
            <Link href="/admin/tenants" className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-blue-600">
              <span>🏢</span> 租户管理
            </Link>
            <Link href="/admin/plans" className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-300 hover:bg-white/10">
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
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">租户管理</h1>
            <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
              + 新建租户
            </button>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <table className="w-full">
              <thead className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                <tr className="text-left text-sm text-gray-500 dark:text-gray-400">
                  <th className="px-6 py-3 font-medium">租户名称</th>
                  <th className="px-6 py-3 font-medium">用户数</th>
                  <th className="px-6 py-3 font-medium">当前套餐</th>
                  <th className="px-6 py-3 font-medium">到期时间</th>
                  <th className="px-6 py-3 font-medium">用量</th>
                  <th className="px-6 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {tenants.map((tenant) => {
                  const sub = getSubscription(tenant.id)
                  return (
                    <tr key={tenant.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">{tenant.name}</td>
                      <td className="px-6 py-4 text-gray-900 dark:text-white">{tenant.user_count || 0} 人</td>
                      <td className="px-6 py-4 text-gray-900 dark:text-white">{sub?.plan_id ? '已开通' : '未开通'}</td>
                      <td className="px-6 py-4 text-gray-500 dark:text-gray-400">
                        {sub?.expire_at ? new Date(sub.expire_at).toLocaleDateString('zh-CN') : '-'}
                      </td>
                      <td className="px-6 py-4">
                        {sub ? (
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-500" style={{ width: `${Math.min((sub.period_used_words / sub.period_word_limit) * 100, 100)}%` }}></div>
                            </div>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {Math.round((sub.period_used_words / sub.period_word_limit) * 100)}%
                            </span>
                          </div>
                        ) : '-'}
                      </td>
                      <td className="px-6 py-4">
                        <button onClick={() => openDetail(tenant)} className="text-blue-600 dark:text-blue-400 hover:underline text-sm mr-3">详情</button>
                        <button onClick={() => openSubModal(tenant)} className="text-blue-600 dark:text-blue-400 hover:underline text-sm">开通套餐</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </main>
      </div>

      {/* 新建租户 Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">新建租户</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">租户名称 *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">联系人</label>
                <input
                  type="text"
                  value={formData.contact_person}
                  onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">联系电话</label>
                <input
                  type="text"
                  value={formData.contact_phone}
                  onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">联系邮箱</label>
                <input
                  type="email"
                  value={formData.contact_email}
                  onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">备注</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => { setShowModal(false); setFormData({ name: '', contact_person: '', contact_phone: '', contact_email: '', description: '' }) }} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300">
                取消
              </button>
              <button onClick={handleCreateTenant} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 租户详情/编辑 Modal */}
      {showDetailModal && detailTenant && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
              租户详情
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">租户名称 *</label>
                <input
                  type="text"
                  value={editingTenant ? editingFormData.name : detailTenant.name}
                  onChange={(e) => editingTenant && setEditingFormData({ ...editingFormData, name: e.target.value })}
                  disabled={!editingTenant}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">联系人</label>
                <input
                  type="text"
                  value={editingTenant ? editingFormData.contact_person : (detailTenant.contact_person || '')}
                  onChange={(e) => editingTenant && setEditingFormData({ ...editingFormData, contact_person: e.target.value })}
                  disabled={!editingTenant}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">联系电话</label>
                <input
                  type="text"
                  value={editingTenant ? editingFormData.contact_phone : (detailTenant.contact_phone || '')}
                  onChange={(e) => editingTenant && setEditingFormData({ ...editingFormData, contact_phone: e.target.value })}
                  disabled={!editingTenant}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">联系邮箱</label>
                <input
                  type="email"
                  value={editingTenant ? editingFormData.contact_email : (detailTenant.contact_email || '')}
                  onChange={(e) => editingTenant && setEditingFormData({ ...editingFormData, contact_email: e.target.value })}
                  disabled={!editingTenant}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">备注</label>
                <textarea
                  value={editingTenant ? editingFormData.description : (detailTenant.description || '')}
                  onChange={(e) => editingTenant && setEditingFormData({ ...editingFormData, description: e.target.value })}
                  disabled={!editingTenant}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">用户数量</label>
                <div className="text-gray-900 dark:text-white">{detailTenant.user_count || 0} 人</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">套餐状态</label>
                <div className="text-gray-900 dark:text-white">
                  {subscriptions.find(s => s.tenant_id === detailTenant.id)?.plan_id ? '已开通' : '未开通'}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              {editingTenant ? (
                <>
                  <button onClick={() => { setEditingTenant(null); setShowDetailModal(false) }} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300">
                    取消
                  </button>
                  <button onClick={handleUpdateTenant} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
                    保存
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => openEdit(detailTenant)} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300">
                    编辑
                  </button>
                  <button onClick={() => setShowDetailModal(false)} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300">
                    关闭
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 开通套餐 Modal */}
      {showSubModal && detailTenant && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
              为「{detailTenant.name}」开通套餐
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">选择套餐</label>
                <select
                  value={subForm.plan_id}
                  onChange={(e) => setSubForm({ ...subForm, plan_id: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.period_word_limit}字/{p.valid_days}天)</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">有效天数</label>
                <input
                  type="number"
                  value={subForm.valid_days}
                  onChange={(e) => setSubForm({ ...subForm, valid_days: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">备注</label>
                <input
                  type="text"
                  value={subForm.remark}
                  onChange={(e) => setSubForm({ ...subForm, remark: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowSubModal(false)} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300">
                取消
              </button>
              <button onClick={handleCreateSubscription} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
                确认开通
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
