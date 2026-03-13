'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { authAPI, subscriptionsAPI, usersAPI } from '@/lib/api'

export default function AccountPage() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const [user, setUser] = useState<any>(null)
  const [subscription, setSubscription] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [passwordData, setPasswordData] = useState({ old: '', new: '', confirm: '' })

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
      const [userRes, subRes] = await Promise.all([
        authAPI.getCurrentUser(),
        subscriptionsAPI.getUsage()
      ])
      setUser(userRes.data)
      setSubscription(subRes.data)
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user')
    router.push('/login')
  }

  const handleChangeTheme = async (newTheme: string) => {
    setTheme(newTheme)
    try {
      await usersAPI.updateUser(user.id, { theme: newTheme })
    } catch (error) {
      console.error('保存主题失败:', error)
    }
  }

  const handleChangePassword = async () => {
    if (passwordData.new !== passwordData.confirm) {
      alert('两次密码不一致')
      return
    }
    if (passwordData.new.length < 8) {
      alert('密码长度至少8位')
      return
    }
    try {
      await authAPI.changePassword({ old_password: passwordData.old, new_password: passwordData.new })
      alert('密码修改成功')
      setShowPasswordForm(false)
      setPasswordData({ old: '', new: '', confirm: '' })
    } catch (error: any) {
      alert(error.response?.data?.message || '修改失败')
    }
  }

  const roleText = { super_admin: '超级管理员', tenant_admin: '租户管理员', user: '普通用户' }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--color-primary)]"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-base)]">
      <header className="h-14 bg-[var(--color-bg-surface)] border-b border-[var(--color-border)] flex items-center justify-between px-6">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold text-[var(--color-primary)]">BidAI</span>
          <span className="text-[var(--color-text-secondary)]">· 账户中心</span>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={handleLogout} className="text-sm text-[var(--color-primary)] hover:underline">退出</button>
        </div>
      </header>

      <div className="flex">
        <aside className="w-60 bg-[var(--color-bg-sidebar)] text-white min-h-[calc(100vh-56px)] p-4">
          <nav className="space-y-2">
            <Link href="/dashboard" className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-300 hover:bg-white/10">
              <span>📁</span> 我的项目
            </Link>
            <Link href="/tasks" className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-300 hover:bg-white/10">
              <span>✅</span> 任务列表
            </Link>
            <Link href="/account" className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-[var(--color-primary)]">
              <span>👤</span> 账户
            </Link>

            {subscription && subscription.has_subscription !== false ? (
              <div className="mt-8 p-4 bg-white/5 rounded-lg">
                <div className="text-sm text-gray-400 mb-2">套餐状态</div>
                {subscription.total_words > 0 ? (
                  <>
                    <div className="text-lg font-medium">{subscription.remaining_words?.toLocaleString() || 0} 字</div>
                    <div className="text-xs text-gray-400">剩余 / {subscription.total_words?.toLocaleString() || 0}</div>
                    <div className="mt-2 h-2 bg-gray-600 rounded-full overflow-hidden">
                      <div className="h-full bg-[var(--color-accent)]" style={{ width: `${subscription.usage_percentage || 0}%` }} />
                    </div>
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

        <main className="flex-1 p-6">
          <h1 className="text-xl font-semibold mb-6">账户中心</h1>

          <div className="grid grid-cols-2 gap-6 mb-8">
            {/* 基本信息 */}
            <div className="card p-6">
              <h2 className="font-medium mb-4">基本信息</h2>
              <div className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-secondary)]">姓名</span>
                  <span>{user?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-secondary)]">用户名</span>
                  <span>{user?.username}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-secondary)]">邮箱</span>
                  <span>{user?.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-secondary)]">角色</span>
                  <span>{roleText[user?.role as keyof typeof roleText]}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-secondary)]">租户</span>
                  <span>{user?.tenant_id ? `租户 #${user.tenant_id}` : '-'}</span>
                </div>
                <button
                  onClick={() => setShowPasswordForm(!showPasswordForm)}
                  className="btn-secondary w-full mt-4"
                >
                  修改密码
                </button>

                {showPasswordForm && (
                  <div className="mt-4 pt-4 border-t space-y-3">
                    <input
                      type="password"
                      placeholder="当前密码"
                      value={passwordData.old}
                      onChange={(e) => setPasswordData({ ...passwordData, old: e.target.value })}
                      className="input text-sm"
                    />
                    <input
                      type="password"
                      placeholder="新密码"
                      value={passwordData.new}
                      onChange={(e) => setPasswordData({ ...passwordData, new: e.target.value })}
                      className="input text-sm"
                    />
                    <input
                      type="password"
                      placeholder="确认新密码"
                      value={passwordData.confirm}
                      onChange={(e) => setPasswordData({ ...passwordData, confirm: e.target.value })}
                      className="input text-sm"
                    />
                    <button onClick={handleChangePassword} className="btn-primary w-full">
                      确认修改
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* 套餐与用量 */}
            <div className="card p-6">
              <h2 className="font-medium mb-4">套餐与用量</h2>
              {subscription && subscription.has_subscription !== false ? (
                subscription.total_words > 0 ? (
                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <span className="text-[var(--color-text-secondary)]">当前套餐</span>
                      <span className="font-medium">基础版</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--color-text-secondary)]">订阅时间</span>
                      <span>{subscription.expire_at ? new Date(subscription.expire_at).toLocaleDateString('zh-CN') : '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--color-text-secondary)]">到期时间</span>
                      <span>{subscription.expire_at ? new Date(subscription.expire_at).toLocaleDateString('zh-CN') : '-'}</span>
                    </div>
                    <div className="pt-4 border-t">
                      <div className="text-sm text-[var(--color-text-secondary)] mb-2">本期字数</div>
                      <div className="text-2xl font-bold">
                        {subscription.used_words?.toLocaleString() || 0}
                        <span className="text-sm font-normal text-[var(--color-text-secondary)]"> / {subscription.total_words?.toLocaleString()}</span>
                      </div>
                      <div className="h-3 bg-gray-200 rounded-full mt-2 overflow-hidden">
                        <div
                          className={`h-full ${(subscription.usage_percentage || 0) > 90 ? 'bg-red-500' : 'bg-[var(--color-primary)]'}`}
                          style={{ width: `${subscription.usage_percentage || 0}%` }}
                        />
                      </div>
                      {subscription.is_low && (
                        <div className="mt-2 text-sm text-yellow-600">
                          ⚠️ 字数不足请联系管理员
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-yellow-600">
                    暂无套餐，请联系管理员开通
                  </div>
                )
              ) : (
                <div className="text-center py-8 text-[var(--color-text-secondary)]">
                  暂无订阅信息
                </div>
              )}
            </div>
          </div>

          {/* 外观设置 */}
          <div className="card p-6 mb-8">
            <h2 className="font-medium mb-4">外观设置</h2>
            <div className="flex items-center gap-4">
              <span className="text-[var(--color-text-secondary)]">界面主题</span>
              <button
                onClick={() => handleChangeTheme('light')}
                className={`px-4 py-2 rounded-lg border ${theme === 'light' ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10' : 'border-[var(--color-border)]'}`}
              >
                ☀️ 白天模式
              </button>
              <button
                onClick={() => handleChangeTheme('dark')}
                className={`px-4 py-2 rounded-lg border ${theme === 'dark' ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10' : 'border-[var(--color-border)]'}`}
              >
                🌙 深夜模式
              </button>
            </div>
          </div>

          {/* 套餐开通记录 */}
          <div className="card p-6">
            <h2 className="font-medium mb-4">套餐开通记录</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--color-text-secondary)] border-b">
                  <th className="pb-2 font-medium">时间</th>
                  <th className="pb-2 font-medium">套餐</th>
                  <th className="pb-2 font-medium">字数限额</th>
                  <th className="pb-2 font-medium">到期时间</th>
                  <th className="pb-2 font-medium">状态</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="py-3">2026-03-01</td>
                  <td>基础版</td>
                  <td>50万字</td>
                  <td>2026-04-15</td>
                  <td><span className="text-green-600">✅ 有效</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  )
}
