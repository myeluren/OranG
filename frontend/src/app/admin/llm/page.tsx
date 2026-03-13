'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { llmAPI, tenantsAPI, extractData } from '@/lib/api'

export default function AdminLLMPage() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const [user, setUser] = useState<any>(null)

  // 供应商默认模型映射
  const defaultModels: Record<string, { analysis: string; generation: string }> = {
    qianwen: { analysis: 'qwen-long', generation: 'qwen-max' },
    openai: { analysis: 'gpt-4o', generation: 'gpt-4o' },
    anthropic: { analysis: 'claude-3-opus-20240229', generation: 'claude-3-opus-20240229' },
    wenxin: { analysis: 'ernie-4.0-8k', generation: 'ernie-4.0-8k' },
    zhipu: { analysis: 'glm-4', generation: 'glm-4' },
    moonshot: { analysis: 'moonshot-v1-8k', generation: 'moonshot-v1-8k' },
    custom: { analysis: '', generation: '' }
  }

  const [globalConfigs, setGlobalConfigs] = useState<any>({
    analysis: { provider: 'qianwen', model: 'qwen-long', api_key: '', base_url: '' },
    generation: { provider: 'qianwen', model: 'qwen-max', api_key: '', base_url: '' }
  })
  const [tenantConfigs, setTenantConfigs] = useState<any[]>([])
  const [tenants, setTenants] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showTenantModal, setShowTenantModal] = useState(false)
  const [selectedTenant, setSelectedTenant] = useState<any>(null)

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
      const [llmRes, tenantsRes] = await Promise.all([
        llmAPI.getConfigs(),
        tenantsAPI.getTenants({ limit: 100 })
      ])
      // 使用 extractData 统一处理返回格式
      setTenants(extractData(tenantsRes) || [])

      // 从localStorage读取保存的api_key
      const savedAnalysisKey = localStorage.getItem('llm_api_key_analysis') || ''
      const savedGenerationKey = localStorage.getItem('llm_api_key_generation') || ''

      // llmRes.data 已经是后端返回的对象 {code: 0, data: {...}}
      const llmData = llmRes.data?.data || llmRes.data || {}

      if (llmData.global) {
        const configs = llmData.global
        const analysis = configs.find((c: any) => c.usage_type === 'analysis')
        const generation = configs.find((c: any) => c.usage_type === 'generation')
        if (analysis) {
          // 如果有配置（说明之前保存过），优先使用localStorage中保存的key
          setGlobalConfigs((prev: any) => ({
            ...prev,
            analysis: {
              ...analysis,
              api_key: savedAnalysisKey || '******'
            }
          }))
        }
        if (generation) {
          setGlobalConfigs((prev: any) => ({
            ...prev,
            generation: {
              ...generation,
              api_key: savedGenerationKey || '******'
            }
          }))
        }
      }
      setTenantConfigs(llmData.tenants || [])
    } catch (error) {
      console.error('Failed to fetch LLM configs:', error)
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

  // 处理供应商变更，自动带出默认模型
  const handleProviderChange = (type: 'analysis' | 'generation', provider: string) => {
    const defaultModel = defaultModels[provider]?.[type] || ''
    setGlobalConfigs({
      ...globalConfigs,
      [type]: {
        ...globalConfigs[type],
        provider,
        model: defaultModel
      }
    })
  }

  const handleSaveGlobal = async (type: 'analysis' | 'generation') => {
    // 验证必填字段
    if (!globalConfigs[type].base_url) {
      alert('请填写 Base URL')
      return
    }
    // 如果显示的是占位符，说明没有输入新的key，但允许保存（使用已存在的key）
    const isPlaceholder = globalConfigs[type].api_key === '******'
    const hasNewKey = globalConfigs[type].api_key && globalConfigs[type].api_key !== '******'
    if (!hasNewKey && !isPlaceholder) {
      alert('请填写 API Key')
      return
    }
    // 保存当前输入的 api_key（如果用户输入了新的就用新的，否则传undefined保持原值）
    const currentApiKey = hasNewKey ? globalConfigs[type].api_key : undefined
    try {
      await llmAPI.updateGlobalConfig({
        provider: globalConfigs[type].provider,
        model: globalConfigs[type].model,
        api_key: currentApiKey,
        base_url: globalConfigs[type].base_url || undefined,
        usage_type: type
      })
      alert('保存成功')
      // 保存到localStorage
      if (hasNewKey) {
        localStorage.setItem(`llm_api_key_${type}`, globalConfigs[type].api_key)
      }
      // 保留当前输入的 api_key，不重新从服务器获取
      setGlobalConfigs((prev: any) => ({
        ...prev,
        [type]: {
          ...prev[type],
          provider: globalConfigs[type].provider,
          model: globalConfigs[type].model,
          base_url: globalConfigs[type].base_url,
          api_key: hasNewKey ? globalConfigs[type].api_key : (isPlaceholder ? '******' : globalConfigs[type].api_key)
        }
      }))
    } catch (error: any) {
      alert(error.response?.data?.detail || '保存失败')
    }
  }

  const handleTest = async (type: 'analysis' | 'generation') => {
    // 验证必填字段
    if (!globalConfigs[type].base_url) {
      alert('请填写 Base URL')
      return
    }
    // 如果显示的是占位符，从localStorage获取之前保存的key
    let apiKey = globalConfigs[type].api_key
    if (apiKey === '******') {
      apiKey = localStorage.getItem(`llm_api_key_${type}`) || ''
    }
    if (!apiKey) {
      alert('请填写 API Key')
      return
    }
    try {
      await llmAPI.testConnection({
        provider: globalConfigs[type].provider,
        model: globalConfigs[type].model,
        api_key: apiKey,
        base_url: globalConfigs[type].base_url
      })
      alert('连接成功')
    } catch (error: any) {
      alert(error.response?.data?.detail || '连接失败')
    }
  }

  // 添加租户配置
  const handleAddTenantConfig = async () => {
    if (!selectedTenant?.id) {
      alert('请选择租户')
      return
    }
    if (!selectedTenant?.model) {
      alert('请填写模型')
      return
    }
    try {
      await llmAPI.updateTenantConfig(selectedTenant.id, {
        provider: selectedTenant.provider,
        model: selectedTenant.model,
        api_key: selectedTenant.api_key || undefined,
        base_url: selectedTenant.base_url || undefined,
        usage_type: selectedTenant.usage_type
      })
      alert('添加成功')
      setShowTenantModal(false)
      setSelectedTenant(null)
      fetchData()
    } catch (error: any) {
      alert(error.response?.data?.detail || '添加失败')
    }
  }

  // 删除租户配置
  const handleDeleteTenantConfig = async (config: any) => {
    if (!confirm('确定要删除该租户配置吗？')) return
    try {
      await llmAPI.deleteTenantConfig(config.tenant_id, config.usage_type)
      fetchData()
    } catch (error: any) {
      alert(error.response?.data?.detail || '删除失败')
    }
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
            <Link href="/admin/plans" className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-300 hover:bg-white/10">
              <span>📦</span> 套餐管理
            </Link>
            <Link href="/admin/llm" className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-blue-600">
              <span>🤖</span> LLM配置
            </Link>
            <Link href="/admin/stats" className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-300 hover:bg-white/10">
              <span>📊</span> 数据统计
            </Link>
          </nav>
        </aside>

        <main className="flex-1 p-6">
          <h1 className="text-xl font-semibold mb-6 text-gray-900 dark:text-white">LLM 大模型配置</h1>

          {/* 全局默认配置 */}
          <div className="mb-8">
            <h2 className="text-lg font-medium mb-4 text-gray-900 dark:text-white">全局默认配置</h2>

            {/* 分析模型 */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-4">
              <h3 className="font-medium mb-4 text-gray-900 dark:text-white">分析模型（招标文件解析 → 大纲生成）</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">供应商</label>
                  <select
                    value={globalConfigs.analysis.provider}
                    onChange={(e) => handleProviderChange('analysis', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="qianwen">阿里云通义千问</option>
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="wenxin">百度文心一言</option>
                    <option value="zhipu">智谱AI</option>
                    <option value="moonshot">Moonshot</option>
                    <option value="custom">自定义</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">模型</label>
                  <input
                    type="text"
                    value={globalConfigs.analysis.model}
                    onChange={(e) => setGlobalConfigs({ ...globalConfigs, analysis: { ...globalConfigs.analysis, model: e.target.value }})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="如: qwen-long, gpt-4o"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">API Key</label>
                  <input
                    type="password"
                    value={globalConfigs.analysis.api_key}
                    onChange={(e) => setGlobalConfigs({ ...globalConfigs, analysis: { ...globalConfigs.analysis, api_key: e.target.value }})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="请输入API Key"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">Base URL（必填）</label>
                  <input
                    type="text"
                    value={globalConfigs.analysis.base_url}
                    onChange={(e) => setGlobalConfigs({ ...globalConfigs, analysis: { ...globalConfigs.analysis, base_url: e.target.value }})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="如: https://api.openai.com/v1"
                  />
                </div>
                <div>
                  <button onClick={() => handleTest('analysis')} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                    测试连接
                  </button>
                </div>
                <div className="flex justify-end">
                  <button onClick={() => handleSaveGlobal('analysis')} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
                    保存配置
                  </button>
                </div>
              </div>
            </div>

            {/* 生成模型 */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h3 className="font-medium mb-4 text-gray-900 dark:text-white">生成模型（标书正文章节撰写）</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">供应商</label>
                  <select
                    value={globalConfigs.generation.provider}
                    onChange={(e) => handleProviderChange('generation', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="qianwen">阿里云通义千问</option>
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="wenxin">百度文心一言</option>
                    <option value="zhipu">智谱AI</option>
                    <option value="moonshot">Moonshot</option>
                    <option value="custom">自定义</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">模型</label>
                  <input
                    type="text"
                    value={globalConfigs.generation.model}
                    onChange={(e) => setGlobalConfigs({ ...globalConfigs, generation: { ...globalConfigs.generation, model: e.target.value }})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="如: qwen-max, gpt-4o"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">API Key</label>
                  <input
                    type="password"
                    value={globalConfigs.generation.api_key}
                    onChange={(e) => setGlobalConfigs({ ...globalConfigs, generation: { ...globalConfigs.generation, api_key: e.target.value }})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="请输入API Key"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">Base URL（必填）</label>
                  <input
                    type="text"
                    value={globalConfigs.generation.base_url}
                    onChange={(e) => setGlobalConfigs({ ...globalConfigs, generation: { ...globalConfigs.generation, base_url: e.target.value }})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="如: https://api.openai.com/v1"
                  />
                </div>
                <div>
                  <button onClick={() => handleTest('generation')} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                    测试连接
                  </button>
                </div>
                <div className="flex justify-end">
                  <button onClick={() => handleSaveGlobal('generation')} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
                    保存配置
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 租户独立配置 */}
          <div className="mt-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white">租户独立配置</h2>
              <button
                onClick={() => setShowTenantModal(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
              >
                + 添加租户配置
              </button>
            </div>

            {tenantConfigs.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                暂无租户独立配置
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                <table className="w-full">
                  <thead className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                    <tr className="text-left text-sm text-gray-500 dark:text-gray-400">
                      <th className="px-6 py-3 font-medium">租户</th>
                      <th className="px-6 py-3 font-medium">类型</th>
                      <th className="px-6 py-3 font-medium">供应商</th>
                      <th className="px-6 py-3 font-medium">模型</th>
                      <th className="px-6 py-3 font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {tenantConfigs.map((config: any) => (
                      <tr key={config.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="px-6 py-4 text-gray-900 dark:text-white">
                          {tenants.find(t => t.id === config.tenant_id)?.name || `租户 #${config.tenant_id}`}
                        </td>
                        <td className="px-6 py-4 text-gray-900 dark:text-white">
                          {config.usage_type === 'analysis' ? '分析模型' : '生成模型'}
                        </td>
                        <td className="px-6 py-4 text-gray-900 dark:text-white">{config.provider}</td>
                        <td className="px-6 py-4 text-gray-900 dark:text-white">{config.model}</td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => handleDeleteTenantConfig(config)}
                            className="text-red-600 dark:text-red-400 hover:underline text-sm"
                          >
                            删除
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 添加租户配置弹窗 */}
          {showTenantModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-lg">
                <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">添加租户独立配置</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">选择租户</label>
                    <select
                      value={selectedTenant?.id || ''}
                      onChange={(e) => {
                        const tenant = tenants.find(t => t.id === parseInt(e.target.value))
                        setSelectedTenant(tenant)
                      }}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="">请选择租户</option>
                      {tenants.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">配置类型</label>
                    <select
                      value={selectedTenant?.usage_type || 'analysis'}
                      onChange={(e) => setSelectedTenant({ ...selectedTenant, usage_type: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="analysis">分析模型</option>
                      <option value="generation">生成模型</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">供应商</label>
                    <select
                      value={selectedTenant?.provider || 'qianwen'}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                        const provider = e.target.value as string
                        const defaultModel = (defaultModels as any)[provider]?.[selectedTenant?.usage_type || 'analysis'] || ''
                        setSelectedTenant({ ...selectedTenant, provider: e.target.value, model: defaultModel })
                      }}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="qianwen">阿里云通义千问</option>
                      <option value="openai">OpenAI</option>
                      <option value="anthropic">Anthropic</option>
                      <option value="wenxin">百度文心一言</option>
                      <option value="zhipu">智谱AI</option>
                      <option value="moonshot">Moonshot</option>
                      <option value="custom">自定义</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">模型</label>
                    <input
                      type="text"
                      value={selectedTenant?.model || ''}
                      onChange={(e) => setSelectedTenant({ ...selectedTenant, model: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="如: qwen-long, gpt-4o"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">API Key</label>
                    <input
                      type="password"
                      value={selectedTenant?.api_key || ''}
                      onChange={(e) => setSelectedTenant({ ...selectedTenant, api_key: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="请输入API Key"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Base URL</label>
                    <input
                      type="text"
                      value={selectedTenant?.base_url || ''}
                      onChange={(e) => setSelectedTenant({ ...selectedTenant, base_url: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="如: https://api.openai.com/v1"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-3 mt-6">
                  <button
                    onClick={() => { setShowTenantModal(false); setSelectedTenant(null) }}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleAddTenantConfig}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                  >
                    添加
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
