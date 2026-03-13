'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { registerRequestsAPI, tenantsAPI, extractData } from '@/lib/api'
import { formatDateTime } from '@/lib/dateUtils'

export default function RegisterRequestsPage() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const [user, setUser] = useState<any>(null)
  const [requests, setRequests] = useState<any[]>([])
  const [tenants, setTenants] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [showApproveModal, setShowApproveModal] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState<any>(null)
  const [approveForm, setApproveForm] = useState({ tenant_id: 1, role: 'user' })
  const [rejectNote, setRejectNote] = useState('')

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
      const [requestsRes, tenantsRes] = await Promise.all([
        registerRequestsAPI.getRequests({ limit: 100 }),
        tenantsAPI.getTenants({ limit: 100 })
      ])
      // 使用 extractData 统一处理返回格式
      setRequests(extractData(requestsRes) || [])
      setTenants(extractData(tenantsRes) || [])
    } catch (error) {
      console.error('Failed to fetch data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = (request: any) => {
    setSelectedRequest(request)
    setApproveForm({ tenant_id: request.tenant_id || 1, role: 'user' })
    setShowApproveModal(true)
  }

  const handleReject = (request: any) => {
    setSelectedRequest(request)
    setRejectNote('')
    setShowRejectModal(true)
  }

  const submitApprove = async () => {
    if (!selectedRequest) return
    try {
      await registerRequestsAPI.approve(selectedRequest.id, approveForm)
      setShowApproveModal(false)
      setSelectedRequest(null)
      fetchData()
    } catch (error: any) {
      alert(error.response?.data?.detail || '操作失败')
    }
  }

  const submitReject = async () => {
    if (!selectedRequest) return
    if (!rejectNote.trim()) {
      alert('请填写拒绝原因')
      return
    }
    try {
      await registerRequestsAPI.reject(selectedRequest.id, { note: rejectNote })
      setShowRejectModal(false)
      setSelectedRequest(null)
      fetchData()
    } catch (error: any) {
      alert(error.response?.data?.detail || '操作失败')
    }
  }

  const filteredRequests = filter === 'all'
    ? requests
    : requests.filter(r => r.status === filter)

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { color: string; text: string }> = {
      pending: { color: 'bg-yellow-100 text-yellow-700', text: '待审批' },
      approved: { color: 'bg-green-100 text-green-700', text: '已开通' },
      rejected: { color: 'bg-red-100 text-red-700', text: '已拒绝' }
    }
    const s = statusMap[status] || { color: 'bg-gray-100 text-gray-700', text: status }
    return <span className={`px-2 py-1 rounded-full text-xs ${s.color}`}>{s.text}</span>
  }

  const getFilterCount = (status: string) => {
    if (status === 'all') return requests.length
    return requests.filter(r => r.status === status).length
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
      {/* 顶部导航 */}
      <header className="h-14 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-6">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold text-blue-600 dark:text-blue-400">BidAI</span>
          <span className="text-gray-500 dark:text-gray-400">· 注册审批</span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-700 dark:text-gray-200">{user?.name}</span>
            <button
              onClick={() => {
                localStorage.removeItem('access_token')
                localStorage.removeItem('refresh_token')
                localStorage.removeItem('user')
                router.push('/login')
              }}
              className="text-sm text-blue-600 hover:underline dark:text-blue-400"
            >
              退出
            </button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* 左侧菜单 */}
        <aside className="w-60 bg-gray-900 text-white min-h-[calc(100vh-56px)] p-4">
          <nav className="space-y-2">
            <Link
              href="/admin/users"
              className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-300 hover:bg-white/10"
            >
              <span>👥</span>
              <span>用户管理</span>
            </Link>
            <Link
              href="/admin/register-requests"
              className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-blue-600"
            >
              <span>📋</span>
              <span>注册审批</span>
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
          </nav>
        </aside>

        {/* 主内容区 */}
        <main className="flex-1 p-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">注册审批</h1>
          </div>

          {/* 筛选标签 */}
          <div className="flex gap-2 mb-6">
            {[
              { key: 'all', label: '全部' },
              { key: 'pending', label: '待审批' },
              { key: 'approved', label: '已开通' },
              { key: 'rejected', label: '已拒绝' }
            ].map(item => (
              <button
                key={item.key}
                onClick={() => setFilter(item.key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === item.key
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {item.label} ({getFilterCount(item.key)})
              </button>
            ))}
          </div>

          {/* 申请列表 */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            {filteredRequests.length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                暂无注册申请
              </div>
            ) : (
              <table className="w-full text-left">
                <thead className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-6 py-3 font-medium text-sm text-gray-500 dark:text-gray-400">用户名</th>
                    <th className="px-6 py-3 font-medium text-sm text-gray-500 dark:text-gray-400">姓名</th>
                    <th className="px-6 py-3 font-medium text-sm text-gray-500 dark:text-gray-400">邮箱</th>
                    <th className="px-6 py-3 font-medium text-sm text-gray-500 dark:text-gray-400">状态</th>
                    <th className="px-6 py-3 font-medium text-sm text-gray-500 dark:text-gray-400">申请时间</th>
                    <th className="px-6 py-3 font-medium text-sm text-gray-500 dark:text-gray-400">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredRequests.map(request => (
                    <tr key={request.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4 text-gray-900 dark:text-white">{request.username}</td>
                      <td className="px-6 py-4 text-gray-900 dark:text-white">{request.name}</td>
                      <td className="px-6 py-4 text-gray-500 dark:text-gray-400">{request.email}</td>
                      <td className="px-6 py-4">{getStatusBadge(request.status)}</td>
                      <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                        {formatDateTime(request.created_at)}
                      </td>
                      <td className="px-6 py-4">
                        {request.status === 'pending' && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleApprove(request)}
                              className="px-3 py-1 text-sm bg-green-600 hover:bg-green-700 text-white rounded"
                            >
                              开通
                            </button>
                            <button
                              onClick={() => handleReject(request)}
                              className="px-3 py-1 text-sm bg-red-600 hover:bg-red-700 text-white rounded"
                            >
                              拒绝
                            </button>
                          </div>
                        )}
                        {request.status === 'rejected' && (
                          <div className="text-sm text-gray-500">
                            拒绝原因: {request.review_note}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </main>
      </div>

      {/* 开通弹窗 */}
      {showApproveModal && selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
              开通账号 - {selectedRequest.username}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  所属租户
                </label>
                <select
                  value={approveForm.tenant_id}
                  onChange={(e) => setApproveForm({ ...approveForm, tenant_id: parseInt(e.target.value) })}
                  className="input"
                >
                  {tenants.map(tenant => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  角色
                </label>
                <select
                  value={approveForm.role}
                  onChange={(e) => setApproveForm({ ...approveForm, role: e.target.value })}
                  className="input"
                >
                  <option value="user">普通用户</option>
                  <option value="tenant_admin">租户管理员</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowApproveModal(false)}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                取消
              </button>
              <button
                onClick={submitApprove}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                确认开通
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 拒绝弹窗 */}
      {showRejectModal && selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
              拒绝申请 - {selectedRequest.username}
            </h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                拒绝原因
              </label>
              <textarea
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                className="input h-24 resize-none"
                placeholder="请填写拒绝原因"
              />
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowRejectModal(false)}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                取消
              </button>
              <button
                onClick={submitReject}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                确认拒绝
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
