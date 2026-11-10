import axios from 'axios'
import type {
  DashboardOverview,
  LeadAnalytics,
  RevenueAnalytics,
  ActivityEvent,
  Lead,
  LeadInput,
  LeadList,
  LeadPriority,
  LeadQuery,
  LeadStatus,
  TeamMember,
  User,
} from './types'

const TOKEN_KEY = 'nexora_token'

export const tokenStore = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },
  set: (token: string) => {
    try {
      localStorage.setItem(TOKEN_KEY, token)
    } catch {
      /* storage unavailable: user will simply need to sign in again */
    }
  },
  clear: () => {
    try {
      localStorage.removeItem(TOKEN_KEY)
    } catch {
      /* ignore */
    }
  },
}

// Render's free tier sleeps after inactivity; the first request can take ~30-60s.
// A generous timeout lets the UI show a "waking up" state instead of failing instantly.
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1',
  timeout: 60_000,
})

api.interceptors.request.use((config) => {
  const token = tokenStore.get()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export const UNAUTHORIZED_EVENT = 'nexora:unauthorized'

api.interceptors.response.use(
  (res) => res,
  (error) => {
    // A 401 on any call except login/signup means the session expired.
    const url: string = error?.config?.url ?? ''
    if (error?.response?.status === 401 && !url.startsWith('/auth/login') && !url.startsWith('/auth/signup')) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
    }
    return Promise.reject(error)
  },
)

/** Turns an API error into a message that is safe to show to the user. */
export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) return 'Can’t reach the server. Check your connection and try again.'
    const detail = error.response.data?.detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail) && detail[0]?.msg) {
      const where = Array.isArray(detail[0].loc) ? detail[0].loc[detail[0].loc.length - 1] : null
      return where ? `${where}: ${detail[0].msg}` : String(detail[0].msg)
    }
  }
  return fallback
}

// ---------- health ----------
export interface HealthResponse {
  status: 'ok' | 'degraded'
  service: string
  version: string
  environment: string
  database: 'ok' | 'unavailable'
  timestamp: string
}

export async function fetchHealth(): Promise<HealthResponse> {
  const { data } = await api.get<HealthResponse>('/health')
  return data
}

// ---------- auth ----------
export interface SignupInput {
  email: string
  password: string
  full_name: string
  organization_name: string
}

export const authApi = {
  signup: async (body: SignupInput) => (await api.post<{ access_token: string }>('/auth/signup', body)).data,
  login: async (email: string, password: string) =>
    (await api.post<{ access_token: string }>('/auth/login', { email, password })).data,
  logout: async () => api.post('/auth/logout'),
  me: async () => (await api.get<User>('/auth/me')).data,
  team: async () => (await api.get<TeamMember[]>('/team')).data,
}

// ---------- leads ----------
export const leadsApi = {
  list: async (query: LeadQuery) => {
    // Drop empty filters so they aren't sent as ?city=&status=
    const params = Object.fromEntries(Object.entries(query).filter(([, v]) => v !== '' && v !== undefined))
    return (await api.get<LeadList>('/leads', { params })).data
  },
  cities: async () => (await api.get<string[]>('/leads/cities')).data,
  get: async (id: string) => (await api.get<Lead>(`/leads/${id}`)).data,
  create: async (body: LeadInput) => (await api.post<Lead>('/leads', body)).data,
  update: async (id: string, body: Partial<LeadInput>) => (await api.patch<Lead>(`/leads/${id}`, body)).data,
  remove: async (id: string) => api.delete(`/leads/${id}`),
  activity: async (id: string) => (await api.get<ActivityEvent[]>(`/leads/${id}/activity`)).data,
  bulkDelete: async (ids: string[]) => (await api.post<{ deleted: number }>('/leads/bulk-delete', { ids })).data,
  bulkUpdate: async (ids: string[], changes: { status?: LeadStatus; priority?: LeadPriority }) =>
    (await api.post<{ updated: number }>('/leads/bulk-update', { ids, ...changes })).data,
}

// ---------- dashboard & analytics ----------
export const analyticsApi = {
  dashboard: async () => (await api.get<DashboardOverview>('/dashboard/overview')).data,
  revenue: async (months: number) => (await api.get<RevenueAnalytics>('/analytics/revenue', { params: { months } })).data,
  leads: async (months: number) => (await api.get<LeadAnalytics>('/analytics/leads', { params: { months } })).data,
}