'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import axios from 'axios'

export default function ChangePasswordPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [isFirstLogin, setIsFirstLogin] = useState(false)

  useEffect(() => {
    // 在客户端检查是否是首次登录
    const userStr = localStorage.getItem('user')
    if (userStr) {
      const user = JSON.parse(userStr)
      setIsFirstLogin(user.is_first_login === true)
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (formData.newPassword !== formData.confirmPassword) {
      setError('两次输入的密码不一致')
      return
    }

    if (formData.newPassword.length < 8) {
      setError('密码长度至少8位')
      return
    }

    if (!/\d/.test(formData.newPassword) || !/[a-zA-Z]/.test(formData.newPassword)) {
      setError('密码需包含字母和数字')
      return
    }

    setLoading(true)

    // 首次登录必须提供当前密码
    if (isFirstLogin && !formData.oldPassword) {
      setError('首次登录必须提供当前密码')
      setLoading(false)
      return
    }

    try {
      const token = localStorage.getItem('access_token')
      const response = await axios.post(
        'http://localhost:8000/api/v1/auth/change-password',
        {
          old_password: formData.oldPassword || undefined,
          new_password: formData.newPassword
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      )

      if (response.data.code === 0) {
        router.push('/dashboard')
      } else {
        setError(response.data.message || '修改失败')
      }
    } catch (err: any) {
      setError(err.response?.data?.message || '修改失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[var(--color-bg-base)] to-[var(--color-primary)]/10 relative overflow-hidden">
      <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-5" />
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-accent)]" />

      <div className="w-full max-w-md px-4">
        <div className="bg-[var(--color-bg-surface)] rounded-2xl shadow-xl p-8 relative z-10">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[var(--color-primary)] text-white text-2xl font-bold mb-4">
              🔐
            </div>
            <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">安全提醒</h1>
            <p className="text-[var(--color-text-secondary)] mt-2">
              {isFirstLogin ? '请立即修改初始密码' : '修改您的登录密码'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm border border-red-200">
                {error}
              </div>
            )}

            {isFirstLogin && (
              <div className="p-3 rounded-lg bg-yellow-50 text-yellow-700 text-sm border border-yellow-200">
                首次登录系统，请修改初始密码
              </div>
            )}

            {isFirstLogin && (
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                  当前密码（初始密码）
                </label>
                <input
                  type="password"
                  value={formData.oldPassword}
                  onChange={(e) => setFormData({ ...formData, oldPassword: e.target.value })}
                  className="input"
                  placeholder="请输入当前密码"
                  required={isFirstLogin}
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                新密码
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={formData.newPassword}
                onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
                className="input"
                placeholder="请输入新密码"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                确认新密码
              </label>
              <input
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                className="input"
                placeholder="请再次输入新密码"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary py-3 text-base disabled:opacity-50"
            >
              {loading ? '处理中...' : '确认修改，进入系统'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
