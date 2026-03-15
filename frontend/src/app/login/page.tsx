'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import Link from 'next/link'
import axios from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8002'

export default function LoginPage() {
  const router = useRouter()
  const { setTheme } = useTheme()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await axios.post(`${API_URL}/api/v1/auth/login`, {
        username,
        password
      })

      if (response.data.code === 0) {
        // 保存token
        localStorage.setItem('access_token', response.data.access_token)
        localStorage.setItem('refresh_token', response.data.refresh_token)
        localStorage.setItem('user', JSON.stringify(response.data.user))

        // 设置主题
        if (response.data.user.theme) {
          setTheme(response.data.user.theme)
        }

        // 检查是否首次登录
        if (response.data.user.is_first_login) {
          router.push('/change-password')
        } else {
          router.push('/dashboard')
        }
      } else {
        setError(response.data.message || '登录失败')
      }
    } catch (err: any) {
      setError(err.response?.data?.message || '用户名或密码错误')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[var(--color-bg-base)] to-[var(--color-primary)]/10 relative overflow-hidden">
      {/* 背景装饰 */}
      <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-5" />
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-accent)]" />

      <div className="w-full max-w-md px-4">
        <div className="bg-[var(--color-bg-surface)] rounded-2xl shadow-xl p-8 relative z-10">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[var(--color-primary)] text-white text-2xl font-bold mb-4">
              BidAI
            </div>
            <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">欢迎回来</h1>
            <p className="text-[var(--color-text-secondary)] mt-2">请使用您的账号登录</p>
          </div>

          {/* 登录表单 */}
          <form onSubmit={handleLogin} className="space-y-6">
            {error && (
              <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm border border-red-200">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                用户名
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input"
                placeholder="请输入用户名"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                密码
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary py-3 text-base disabled:opacity-50"
            >
              {loading ? '登录中...' : '立即登录'}
            </button>
          </form>

          {/* 底部链接 */}
          <div className="mt-6 text-center text-sm text-[var(--color-text-secondary)]">
            还没有账号？{' '}
            <Link href="/register" className="text-[var(--color-primary)] hover:underline">
              点击注册
            </Link>
          </div>
          <div className="mt-2 text-center text-sm text-[var(--color-text-secondary)]">
            忘记密码？请联系管理员重置
          </div>
        </div>

        <div className="text-center mt-6 text-sm text-[var(--color-text-secondary)]">
          © 2026 BidAI · v2.2
        </div>
      </div>
    </div>
  )
}
