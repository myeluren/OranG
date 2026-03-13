import axios, { AxiosResponse } from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// 提取API数据的辅助函数 - 支持多种返回格式
// {code: 0, data: [...]} 或直接返回 [...]
const extractData = (response: AxiosResponse) => {
  // 如果响应有 data 字段
  if (response?.data) {
    // 标准格式 {code: 0, data: [...]}
    if (response.data.data !== undefined) {
      return response.data.data
    }
    // 直接返回数组 [...] 的情况
    if (Array.isArray(response.data)) {
      return response.data
    }
  }
  return []
}

// 请求拦截器 - 添加Token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器 - 处理Token过期
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      try {
        const refreshToken = localStorage.getItem('refresh_token')
        if (refreshToken) {
          const response = await axios.post(`${API_URL}/api/v1/auth/refresh`, null, {
            params: { refresh_token: refreshToken }
          })

          if (response.data.code === 0) {
            localStorage.setItem('access_token', response.data.data.access_token)
            localStorage.setItem('refresh_token', response.data.data.refresh_token)

            originalRequest.headers.Authorization = `Bearer ${response.data.data.access_token}`
            return apiClient(originalRequest)
          }
        }
      } catch (refreshError) {
        // 刷新失败，跳转到登录页
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        localStorage.removeItem('user')
        window.location.href = '/login'
      }
    }

    return Promise.reject(error)
  }
)

export default apiClient
export { extractData }

// Auth API
export const authAPI = {
  login: (data: { username: string; password: string }) =>
    apiClient.post('/api/v1/auth/login', data),
  register: (data: { username: string; email: string; name: string; password: string }) =>
    apiClient.post('/api/v1/auth/register', data),
  checkUsername: (username: string) =>
    apiClient.get('/api/v1/auth/check-username', { params: { username } }),
  changePassword: (data: { old_password?: string; new_password: string }) =>
    apiClient.post('/api/v1/auth/change-password', data),
  refreshToken: (refreshToken: string) =>
    apiClient.post('/api/v1/auth/refresh', null, { params: { refresh_token: refreshToken } }),
  getCurrentUser: () => apiClient.get('/api/v1/auth/me'),
}

// Users API
export const usersAPI = {
  getUsers: (params?: { skip?: number; limit?: number; status_filter?: string; role?: string }) =>
    apiClient.get('/api/v1/users', { params }),
  getUser: (id: number) => apiClient.get(`/api/v1/users/${id}`),
  createUser: (data: any) => apiClient.post('/api/v1/users', data),
  updateUser: (id: number, data: any) => apiClient.put(`/api/v1/users/${id}`, data),
  resetPassword: (id: number) => apiClient.post(`/api/v1/users/${id}/reset-password`),
  updateStatus: (id: number, status: string) =>
    apiClient.patch(`/api/v1/users/${id}/status`, null, { params: { status } }),
}

// Tenants API
export const tenantsAPI = {
  getTenants: (params?: { skip?: number; limit?: number }) =>
    apiClient.get('/api/v1/tenants', { params }),
  getTenant: (id: number) => apiClient.get(`/api/v1/tenants/${id}`),
  createTenant: (data: { name: string }) => apiClient.post('/api/v1/tenants', data),
  updateTenant: (id: number, data: any) => apiClient.patch(`/api/v1/tenants/${id}`, data),
}

// Plans API
export const plansAPI = {
  getPlans: () => apiClient.get('/api/v1/plans'),
  getPlan: (id: number) => apiClient.get(`/api/v1/plans/${id}`),
  createPlan: (data: any) => apiClient.post('/api/v1/plans', data),
  updatePlan: (id: number, data: any) => apiClient.put(`/api/v1/plans/${id}`, data),
}

// Subscriptions API
export const subscriptionsAPI = {
  getSubscription: () => apiClient.get('/api/v1/subscriptions'),
  getUsage: () => apiClient.get('/api/v1/subscriptions/usage'),
  getAll: () => apiClient.get('/api/v1/subscriptions/all'),
  create: (tenantId: number, data: any) => apiClient.post('/api/v1/subscriptions', { tenant_id: tenantId, ...data }),
}

// Projects API
export const projectsAPI = {
  getProjects: (params?: { skip?: number; limit?: number; status_filter?: string }) =>
    apiClient.get('/api/v1/projects', { params }),
  getProject: (id: number) => apiClient.get(`/api/v1/projects/${id}`),
  createProject: (data: { title: string }) => apiClient.post('/api/v1/projects', data),
  updateProject: (id: number, data: any) => apiClient.patch(`/api/v1/projects/${id}`, data),
  deleteProject: (id: number) => apiClient.delete(`/api/v1/projects/${id}`),
  resetProject: (id: number) => apiClient.post(`/api/v1/projects/${id}/reset`),
  uploadFile: (id: number, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return apiClient.post(`/api/v1/projects/${id}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  deleteFile: (id: number) => apiClient.delete(`/api/v1/projects/${id}/file`),
}

// Tasks API
export const tasksAPI = {
  // 创建内容生成任务 (调用大模型生成)
  createTask: (projectId: number) =>
    apiClient.post('/api/v1/tasks', null, { params: { project_id: projectId } }),
  getTasks: (params?: { skip?: number; limit?: number; status_filter?: string }) =>
    apiClient.get('/api/v1/tasks', { params }),
  getTask: (id: number) => apiClient.get(`/api/v1/tasks/${id}`),
  pauseTask: (id: number) => apiClient.post(`/api/v1/tasks/${id}/pause`),
  resumeTask: (id: number) => apiClient.post(`/api/v1/tasks/${id}/resume`),
  cancelTask: (id: number) => apiClient.post(`/api/v1/tasks/${id}/cancel`),
  regenerateTask: (id: number) => apiClient.post(`/api/v1/tasks/${id}/regenerate`),
  retryTask: (id: number) => apiClient.post(`/api/v1/tasks/${id}/retry`),
  getCheckpoints: (id: number) => apiClient.get(`/api/v1/tasks/${id}/checkpoints`),
}

// LLM API
export const llmAPI = {
  checkConfig: (usageType: string = 'analysis') =>
    apiClient.get('/api/v1/llm/check-config', { params: { usage_type: usageType } }),
  getConfigs: (tenantId?: number) => apiClient.get('/api/v1/llm', { params: { tenant_id: tenantId } }),
  updateGlobalConfig: (data: any) => apiClient.put('/api/v1/llm/global', data),
  updateTenantConfig: (tenantId: number, data: any) => apiClient.put(`/api/v1/llm/tenant/${tenantId}`, data),
  deleteTenantConfig: (tenantId: number, usageType: string) =>
    apiClient.delete(`/api/v1/llm/tenant/${tenantId}`, { params: { usage_type: usageType } }),
  testConnection: (data: { provider: string; api_key: string; model: string; base_url?: string }) =>
    apiClient.post('/api/v1/llm/test', null, { params: data }),
}

// Admin API
export const adminAPI = {
  getStats: (days?: number) => apiClient.get('/api/v1/admin/stats', { params: { days } }),
  getTenantStats: (limit?: number) => apiClient.get('/api/v1/admin/stats/tenants', { params: { limit } }),
  getDailyStats: (days?: number) => apiClient.get('/api/v1/admin/stats/daily', { params: { days } }),
  getTaskDistribution: () => apiClient.get('/api/v1/admin/stats/task-distribution'),
}

// Register Requests API
export const registerRequestsAPI = {
  getRequests: (params?: { skip?: number; limit?: number; status_filter?: string }) =>
    apiClient.get('/api/v1/register-requests', { params }),
  approve: (id: number, data: { tenant_id: number; role: string }) =>
    apiClient.post(`/api/v1/register-requests/${id}/approve`, data),
  reject: (id: number, data: { note: string }) =>
    apiClient.post(`/api/v1/register-requests/${id}/reject`, data),
}

// Outline API - 大纲管理
export const outlineAPI = {
  // 获取大纲（优先从 Redis 获取）
  getOutline: (projectId: number) => apiClient.get(`/api/v1/projects/${projectId}/outline`),
  
  // 临时保存大纲到 Redis（自动保存用）
  saveToRedis: (projectId: number, outlineJson: string) => 
    apiClient.put(`/api/v1/projects/${projectId}/outline/redis`, JSON.stringify(outlineJson)),
  
  // 保存大纲到数据库（手动保存）
  saveToDb: (projectId: number) => 
    apiClient.post(`/api/v1/projects/${projectId}/outline/save-to-db`),
}
