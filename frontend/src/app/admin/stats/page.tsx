'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { adminAPI, extractData } from '@/lib/api'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts'

export default function AdminStatsPage() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const [user, setUser] = useState<any>(null)
  const [stats, setStats] = useState<any>(null)
  const [tenantStats, setTenantStats] = useState<any[]>([])
  const [dailyStats, setDailyStats] = useState<any[]>([])
  const [taskDist, setTaskDist] = useState<any[]>([])
  const [days, setDays] = useState(7)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)

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
    
    // 只有第一次加载时使用全局 loading，后续更新使用 updating
    if (stats === null) {
      fetchData(true)
    } else {
      fetchData(false)
    }
  }, [days])

  const fetchData = async (isInitial: boolean = false) => {
    if (isInitial) {
      setLoading(true)
    } else {
      setUpdating(true)
    }

    try {
      const [statsRes, tenantRes, dailyRes, distRes] = await Promise.all([
        adminAPI.getStats(days),
        adminAPI.getTenantStats(5),
        adminAPI.getDailyStats(days),
        adminAPI.getTaskDistribution()
      ])
      // 使用 extractData 统一处理返回格式
      setStats(statsRes.data || {})
      setTenantStats(extractData(tenantRes) || [])
      setDailyStats(extractData(dailyRes) || [])
      setTaskDist(extractData(distRes) || [])
    } catch (error: any) {
      console.error('Failed to fetch stats:', error)
      setStats({})
      setTenantStats([])
      setDailyStats([])
      setTaskDist([])
    } finally {
      setLoading(false)
      setUpdating(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user')
    router.push('/login')
  }

  const handleExport = () => {
    // 生成CSV报表
    const headers = ['日期', '租户数', '活跃用户', '生成字数', '任务数']
    const rows = (dailyStats || []).map((item: any) => [
      item.date,
      item.tenant_count || 0,
      item.active_users || 0,
      item.words || 0,
      item.task_count || 0
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n')

    // 下载CSV文件
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `BidAI统计报表_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
  }

  const COLORS = ['#00C896', '#FF3B5C', '#FF9500', '#0057FF', '#7B5CFF']

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
            <Link href="/admin/plans" className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-300 hover:bg-white/10">
              <span>📦</span> 套餐管理
            </Link>
            <Link href="/admin/llm" className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-300 hover:bg-white/10">
              <span>🤖</span> LLM配置
            </Link>
            <Link href="/admin/stats" className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-blue-600">
              <span>📊</span> 数据统计
            </Link>
          </nav>
        </aside>

        <main className="flex-1 p-6 relative">
          {/* 更新时的遮罩层 */}
          {updating && (
            <div className="absolute inset-0 bg-white/30 dark:bg-black/20 z-10 backdrop-blur-[1px] transition-all flex items-start justify-center pt-20">
              <div className="bg-white dark:bg-gray-800 shadow-lg rounded-full px-4 py-2 flex items-center gap-2 border border-gray-200 dark:border-gray-700">
                <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                <span className="text-sm font-medium text-gray-600 dark:text-gray-300">更新数据中...</span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">数据统计</h1>
            <div className="flex gap-2">
              <button onClick={() => setDays(7)} className={`px-4 py-2 rounded-lg text-sm transition-colors ${days === 7 ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>近7天</button>
              <button onClick={() => setDays(30)} className={`px-4 py-2 rounded-lg text-sm transition-colors ${days === 30 ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>近30天</button>
              <button onClick={() => setDays(90)} className={`px-4 py-2 rounded-lg text-sm transition-colors ${days === 90 ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>近90天</button>
            </div>
          </div>

          {/* 概览卡片 */}
          <div className="grid grid-cols-4 gap-4 mb-8">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-transparent hover:border-blue-500/30 transition-all">
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">租户总数</div>
              <div className="text-3xl font-bold text-gray-900 dark:text-white">{stats?.total_tenants || 0}</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-transparent hover:border-blue-500/30 transition-all">
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">活跃用户</div>
              <div className="text-3xl font-bold text-gray-900 dark:text-white">{stats?.active_users || 0}</div>
              <div className="text-xs text-gray-400 mt-1">近{days}天</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-transparent hover:border-blue-500/30 transition-all">
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">累计生成</div>
              <div className="text-3xl font-bold text-gray-900 dark:text-white">{((stats?.total_words_generated || 0) / 10000).toFixed(0)}万</div>
              <div className="text-xs text-gray-400 mt-1">字</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-transparent hover:border-blue-500/30 transition-all">
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">成功率</div>
              <div className="text-3xl font-bold text-gray-900 dark:text-white">{stats?.success_rate || 0}%</div>
            </div>
          </div>

          {/* 每日字数生成趋势 */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-8 border border-transparent">
            <h2 className="text-lg font-medium mb-4 text-gray-900 dark:text-white">每日字数生成趋势</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyStats}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#374151' : '#e5e7eb'} />
                  <XAxis dataKey="date" stroke={theme === 'dark' ? '#9ca3af' : '#6b7280'} fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke={theme === 'dark' ? '#9ca3af' : '#6b7280'} fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff', borderColor: theme === 'dark' ? '#374151' : '#e5e7eb', borderRadius: '8px' }} itemStyle={{ color: theme === 'dark' ? '#f3f4f6' : '#111827' }} />
                  <Line type="monotone" dataKey="words" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6' }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8">
            {/* 租户用量排行 */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-transparent">
              <h2 className="text-lg font-medium mb-4 text-gray-900 dark:text-white">租户用量排行 TOP 5</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={tenantStats} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#374151' : '#e5e7eb'} />
                    <XAxis type="number" stroke={theme === 'dark' ? '#9ca3af' : '#6b7280'} fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis dataKey="tenant_name" type="category" width={100} stroke={theme === 'dark' ? '#9ca3af' : '#6b7280'} fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff', borderColor: theme === 'dark' ? '#374151' : '#e5e7eb', borderRadius: '8px' }} />
                    <Bar dataKey="word_usage" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 任务状态分布 */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-transparent">
              <h2 className="text-lg font-medium mb-4 text-gray-900 dark:text-white">任务状态分布</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={taskDist}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ status, percentage }) => `${status}: ${percentage}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="count"
                    >
                      {taskDist.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff', borderColor: theme === 'dark' ? '#374151' : '#e5e7eb', borderRadius: '8px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button onClick={handleExport} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              导出报表
            </button>
          </div>
        </main>
      </div>
    </div>
  )
}
