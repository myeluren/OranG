'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import axios from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8002'

export default function RegisterPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: ''
  })
  const [showPassword, setShowPassword] = useState(false)
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'unavailable'>('idle')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // 实时校验用户名
  useEffect(() => {
    if (formData.username.length < 3) {
      setUsernameStatus('idle')
      return
    }

    const timer = setTimeout(async () => {
      setUsernameStatus('checking')
      try {
        const response = await axios.get(`${API_URL}/api/v1/auth/check-username`, {
          params: { username: formData.username }
        })
        // 处理限流等错误响应
        if (response.status === 429) {
          setUsernameStatus('idle')
          return
        }
        if (response.data && response.data.available !== undefined) {
          setUsernameStatus(response.data.available ? 'available' : 'unavailable')
        } else {
          setUsernameStatus('idle')
        }
      } catch (err: any) {
        // 如果是限流错误(429)，忽略错误，保持原状态
        if (err.response?.status === 429) {
          console.warn('Rate limit reached')
        } else {
          console.error('Username check error:', err)
        }
        setUsernameStatus('idle')
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [formData.username])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (formData.password !== formData.confirmPassword) {
      setError('两次输入的密码不一致')
      return
    }

    if (formData.password.length < 8) {
      setError('密码长度至少8位')
      return
    }

    if (!/\d/.test(formData.password) || !/[a-zA-Z]/.test(formData.password)) {
      setError('密码需包含字母和数字')
      return
    }

    if (usernameStatus !== 'available') {
      setError('请使用可用的用户名')
      return
    }

    setLoading(true)

    try {
      const response = await axios.post(`${API_URL}/api/v1/auth/register`, {
        username: formData.username,
        email: formData.email,
        password: formData.password
      })

      if (response.data.code === 0) {
        // 显示成功页面
        router.push('/register/success')
      } else {
        setError(response.data.message || '注册失败')
      }
    } catch (err: any) {
      setError(err.response?.data?.message || '注册失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  const getPasswordStrength = () => {
    if (!formData.password) return 0
    let strength = 0
    if (formData.password.length >= 8) strength++
    if (/\d/.test(formData.password)) strength++
    if (/[a-zA-Z]/.test(formData.password)) strength++
    if (/[!@#$%^&*]/.test(formData.password)) strength++
    return strength
  }

  const passwordStrength = getPasswordStrength()

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[var(--color-bg-base)] to-[var(--color-primary)]/10 relative overflow-hidden">
      <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-5" />
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-accent)]" />

      <div className="w-full max-w-md px-4 py-8">
        <div className="bg-[var(--color-bg-surface)] rounded-2xl shadow-xl p-8 relative z-10">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[var(--color-primary)] text-white text-2xl font-bold mb-4">
              BidAI
            </div>
            <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">创建新账号</h1>
            <p className="text-[var(--color-text-secondary)] mt-2">注册后需等待管理员审批，审批通过后可登录</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm border border-red-200">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                邮箱地址 *
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="input"
                placeholder="请输入邮箱地址"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                用户名 * <span className="text-xs font-normal text-[var(--color-text-secondary)]">（登录时使用，注册后不可修改）</span>
              </label>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                className="input"
                placeholder="请输入用户名（字母/数字/下划线）"
                maxLength={30}
                required
              />
              {usernameStatus === 'checking' && (
                <p className="text-sm text-[var(--color-text-secondary)] mt-1">校验中...</p>
              )}
              {usernameStatus === 'available' && (
                <p className="text-sm text-green-600 mt-1">✓ 用户名可用</p>
              )}
              {usernameStatus === 'unavailable' && formData.username.length >= 3 && (
                <p className="text-sm text-red-600 mt-1">✗ 用户名已被使用</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                登录密码 * <span className="text-xs font-normal text-[var(--color-text-secondary)]">≥8位，含字母+数字</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="input pr-10"
                  placeholder="请输入密码"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]"
                >
                  {showPassword ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
              {formData.password && (
                <div className="mt-2">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded ${
                          passwordStrength >= i
                            ? passwordStrength <= 2 ? 'bg-red-500' : passwordStrength === 3 ? 'bg-yellow-500' : 'bg-green-500'
                            : 'bg-gray-200'
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                    强度：{passwordStrength <= 1 ? '弱' : passwordStrength <= 2 ? '中' : '强'}
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                确认密码 *
              </label>
              <input
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                className="input"
                placeholder="请再次输入密码"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading || usernameStatus !== 'available'}
              className="w-full btn-primary py-3 text-base disabled:opacity-50"
            >
              {loading ? '提交中...' : '提交注册申请'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-[var(--color-text-secondary)]">
            已有账号？{' '}
            <Link href="/login" className="text-[var(--color-primary)] hover:underline">
              返回登录
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
