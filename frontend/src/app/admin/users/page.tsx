'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { usersAPI, tenantsAPI, extractData } from '@/lib/api'

export default function AdminUsersPage() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const [user, setUser] = useState<any>(null)
  const [users, setUsers] = useState<any[]>([])
  const [tenants, setTenants] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingUser, setEditingUser] = useState<any>(null)
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    name: '',
    password: '',
    role: 'user',
    tenant_id: 1,
    status: 'active'
  })

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
      const [usersRes, tenantsRes] = await Promise.all([
        usersAPI.getUsers({ limit: 100 }),
        tenantsAPI.getTenants({ limit: 100 })
      ])
      // 使用 extractData 统一处理返回格式
      setUsers(extractData(usersRes) || [])
      setTenants(extractData(tenantsRes) || [])
    } catch (error) {
      console.error('Failed to fetch data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateUser = async () => {
    try {
      await usersAPI.createUser(formData)
      setShowModal(false)
      resetForm()
      fetchData()
    } catch (error: any) {
      alert(error.response?.data?.detail || '创建失败')
    }
  }

  const handleUpdateUser = async () => {
    if (!editingUser) return
    try {
      await usersAPI.updateUser(editingUser.id, formData)
      setEditingUser(null)
      resetForm()
      fetchData()
    } catch (error: any) {
      alert(error.response?.data?.detail || '更新失败')
    }
  }

  const handleResetPassword = async (userId: number) => {
    if (!confirm('确定要重置该用户密码吗？')) return
    try {
      await usersAPI.resetPassword(userId)
      alert('密码已重置为初始密码')
    } catch (error) {
      alert('操作失败')
    }
  }

  const handleToggleStatus = async (userId: number, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'disabled' : 'active'
    try {
      await usersAPI.updateStatus(userId, newStatus)
      fetchData()
    } catch (error) {
      alert('操作失败')
    }
  }

  const resetForm = () => {
    setFormData({
      username: '',
      email: '',
      name: '',
      password: '',
      role: 'user',
      tenant_id: 1,
      status: 'active'
    })
  }

  const openEditModal = (u: any) => {
    setEditingUser(u)
    setFormData({
      username: u.username,
      email: u.email,
      name: u.name || '',
      password: '',
      role: u.role,
      tenant_id: u.tenant_id,
      status: u.status
    })
    setShowModal(true)
  }

  const handleLogout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user')
    router.push('/login')
  }

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-700',
      active: 'bg-green-100 text-green-700',
      disabled: 'bg-red-100 text-red-700',
      rejected: 'bg-gray-100 text-gray-700'
    }
    return map[status] || 'bg-gray-100 text-gray-700'
  }

  const getRoleBadge = (role: string) => {
    const map: Record<string, string> = {
      super_admin: 'bg-purple-100 text-purple-700',
      tenant_admin: 'bg-blue-100 text-blue-700',
      user: 'bg-gray-100 text-gray-700'
    }
    return map[role] || 'bg-gray-100 text-gray-700'
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
            <Link href="/admin/users" className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-blue-600">
              <span>👥</span> 用户管理
            </Link>
            <Link href="/admin/tenants" className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-300 hover:bg-white/10">
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
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">用户管理</h1>
            <button onClick={() => { resetForm(); setEditingUser(null); setShowModal(true) }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
              + 新建用户
            </button>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <table className="w-full">
              <thead className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                <tr className="text-left text-sm text-gray-500 dark:text-gray-400">
                  <th className="px-6 py-3 font-medium">姓名</th>
                  <th className="px-6 py-3 font-medium">用户名</th>
                  <th className="px-6 py-3 font-medium">邮箱</th>
                  <th className="px-6 py-3 font-medium">角色</th>
                  <th className="px-6 py-3 font-medium">状态</th>
                  <th className="px-6 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 text-gray-900 dark:text-white">{u.name}</td>
                    <td className="px-6 py-4 text-gray-900 dark:text-white">{u.username}</td>
                    <td className="px-6 py-4 text-gray-500 dark:text-gray-400">{u.email}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs ${getRoleBadge(u.role)}`}>
                        {u.role === 'super_admin' ? '超管' : u.role === 'tenant_admin' ? '管理员' : '用户'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs ${getStatusBadge(u.status)}`}>
                        {u.status === 'active' ? '正常' : u.status === 'disabled' ? '禁用' : '待审批'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button onClick={() => openEditModal(u)} className="text-blue-600 dark:text-blue-400 hover:underline text-sm mr-3">编辑</button>
                      <button onClick={() => handleResetPassword(u.id)} className="text-orange-600 dark:text-orange-400 hover:underline text-sm mr-3">重置密码</button>
                      <button onClick={() => handleToggleStatus(u.id, u.status)} className="text-gray-600 dark:text-gray-400 hover:underline text-sm">
                        {u.status === 'active' ? '禁用' : '启用'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
              {editingUser ? '编辑用户' : '新建用户'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">用户名 *</label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  disabled={!!editingUser}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">邮箱 *</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">姓名</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              {!editingUser && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">密码 *</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">角色</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="user">普通用户</option>
                  <option value="tenant_admin">租户管理员</option>
                  <option value="super_admin">超级管理员</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">租户</label>
                <select
                  value={formData.tenant_id}
                  onChange={(e) => setFormData({ ...formData, tenant_id: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              {editingUser && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">状态</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="active">正常</option>
                    <option value="disabled">禁用</option>
                  </select>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => { setShowModal(false); setEditingUser(null) }} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300">
                取消
              </button>
              <button onClick={editingUser ? handleUpdateUser : handleCreateUser} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
                {editingUser ? '保存' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
