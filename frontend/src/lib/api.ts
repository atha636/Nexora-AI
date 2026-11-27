import axios from 'axios'
import type {
  AppNotification,
  ActivityItem,
  ObservabilityStats,
  RunSummary,
  Trace,
  BriefingItem,
  Execution,
  Workflow,
  WorkflowDefinition,
  ApprovalItem,
  EmailDraft,
  EmailMeta,
  AnalyticsAnswer,
  AskResponse,
  ChatResponse,
  ConversationDetail,
  ConversationSummary,
  DocumentItem,
  SearchHit,
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
  NewTask,
  Role,
  Task,
  TaskList,
  TaskSummary,
  TeamMember,
  User,
  SavedView,
  BriefingSummary,
  ChatTurn,
  LeadAnswer,
  ViewFilters,
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

// ---------- settings & team management ----------
export interface NewMemberInput {
  full_name: string
  email: string
  password: string
  role: Exclude<Role, 'owner'>
}

export const accountApi = {
  updateProfile: async (full_name: string) => (await api.patch<User>('/account/profile', { full_name })).data,
  changePassword: async (current_password: string, new_password: string) =>
    api.post('/account/password', { current_password, new_password }),
  renameOrganization: async (name: string) => (await api.patch<User>('/account/organization', { name })).data,
}

export const teamApi = {
  add: async (body: NewMemberInput) => (await api.post<TeamMember>('/team', body)).data,
  changeRole: async (id: string, role: Exclude<Role, 'owner'>) =>
    (await api.patch<TeamMember>(`/team/${id}`, { role })).data,
  remove: async (id: string) => api.delete(`/team/${id}`),
}

// ---------- leads ----------
export const leadsApi = {
  list: async (query: LeadQuery) => {
    // Drop empty filters so they aren't sent as ?city=&status=
    const params = Object.fromEntries(Object.entries(query).filter(([, v]) => v !== '' && v !== undefined))
    return (await api.get<LeadList>('/leads', { params })).data
  },
  cities: async () => (await api.get<string[]>('/leads/cities')).data,
  ask: async (id: string, question: string, history: ChatTurn[]) =>
    (await api.post<LeadAnswer>(`/leads/${id}/ask`, { question, history }, { timeout: 60_000 })).data,
  get: async (id: string) => (await api.get<Lead>(`/leads/${id}`)).data,
  create: async (body: LeadInput) => (await api.post<Lead>('/leads', body)).data,
  update: async (id: string, body: Partial<LeadInput>) => (await api.patch<Lead>(`/leads/${id}`, body)).data,
  remove: async (id: string) => api.delete(`/leads/${id}`),
  activity: async (id: string) => (await api.get<ActivityEvent[]>(`/leads/${id}/activity`)).data,
  bulkDelete: async (ids: string[]) => (await api.post<{ deleted: number }>('/leads/bulk-delete', { ids })).data,
  bulkUpdate: async (ids: string[], changes: { status?: LeadStatus; priority?: LeadPriority }) =>
    (await api.post<{ updated: number }>('/leads/bulk-update', { ids, ...changes })).data,
}

export const viewsApi = {
  list: async () => (await api.get<SavedView[]>('/views')).data,
  create: async (body: { name: string; filters: ViewFilters; shared: boolean }) =>
    (await api.post<SavedView>('/views', body)).data,
  remove: async (id: string) => api.delete(`/views/${id}`),
}

// ---------- dashboard & analytics ----------
export const analyticsApi = {
  dashboard: async () => (await api.get<DashboardOverview>('/dashboard/overview')).data,
  briefingSummary: async () => (await api.post<BriefingSummary>('/dashboard/briefing/summary', {}, { timeout: 60_000 })).data,
  briefing: async () => (await api.get<{ items: BriefingItem[] }>('/dashboard/briefing')).data,
  revenue: async (months: number) => (await api.get<RevenueAnalytics>('/analytics/revenue', { params: { months } })).data,
  leads: async (months: number) => (await api.get<LeadAnalytics>('/analytics/leads', { params: { months } })).data,
  // The AI may run several queries, so allow more time than the default.
  ask: async (question: string) =>
    (await api.post<AnalyticsAnswer>('/analytics/ask', { question }, { timeout: 120_000 })).data,
}

// ---------- knowledge base ----------
export const documentsApi = {
  list: async () => (await api.get<DocumentItem[]>('/documents')).data,
  upload: async (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return (await api.post<DocumentItem>('/documents/upload', form)).data
  },
  remove: async (id: string) => api.delete(`/documents/${id}`),
  reindex: async (id: string) => (await api.post<DocumentItem>(`/documents/${id}/reindex`)).data,
  search: async (query: string, topK = 5) =>
    (await api.post<{ query: string; hits: SearchHit[] }>('/documents/search', { query, top_k: topK })).data,
  ask: async (question: string) => (await api.post<AskResponse>('/documents/ask', { question })).data,
}

// ---------- AI assistant ----------
export const agentApi = {
  conversations: async () => (await api.get<ConversationSummary[]>('/agent/conversations')).data,
  conversation: async (id: string) => (await api.get<ConversationDetail>(`/agent/conversations/${id}`)).data,
  remove: async (id: string) => api.delete(`/agent/conversations/${id}`),
  // The agent may call several tools in a row, so allow more time than the default.
  chat: async (message: string, conversationId: string | null) =>
    (
      await api.post<ChatResponse>(
        '/agent/chat',
        { message, conversation_id: conversationId },
        { timeout: 120_000 },
      )
    ).data,
}

// ---------- email drafts ----------
export interface DraftInput {
  lead_id: string
  tone: string
  purpose: string
  instructions?: string
}

export const emailsApi = {
  meta: async () => (await api.get<EmailMeta>('/emails/meta')).data,
  list: async (status?: string) =>
    (await api.get<{ items: EmailDraft[]; total: number }>('/emails/drafts', { params: { status, page_size: 50 } })).data,
  // Writing a draft calls the AI model, so allow extra time.
  create: async (input: DraftInput) => (await api.post<EmailDraft>('/emails/drafts', input, { timeout: 90_000 })).data,
  update: async (id: string, input: { subject?: string; body?: string }) =>
    (await api.patch<EmailDraft>(`/emails/drafts/${id}`, input)).data,
  remove: async (id: string) => api.delete(`/emails/drafts/${id}`),
  requestApproval: async (id: string) => (await api.post<ApprovalItem>(`/emails/drafts/${id}/request-approval`)).data,
}

// ---------- approvals ----------
export const approvalsApi = {
  list: async (scope: 'pending' | 'history') =>
    (await api.get<{ items: ApprovalItem[]; total: number; pending: number }>('/approvals', { params: { scope, page_size: 50 } })).data,
  approve: async (id: string, note?: string) => (await api.post<ApprovalItem>(`/approvals/${id}/approve`, { note })).data,
  reject: async (id: string, note?: string) => (await api.post<ApprovalItem>(`/approvals/${id}/reject`, { note })).data,
  cancel: async (id: string) => (await api.post<ApprovalItem>(`/approvals/${id}/cancel`)).data,
}

// ---------- workflows ----------
export const workflowsApi = {
  list: async () => (await api.get<Workflow[]>('/workflows')).data,
  create: async (body: WorkflowDefinition) => (await api.post<Workflow>('/workflows', body)).data,
  update: async (id: string, body: Partial<WorkflowDefinition>) => (await api.patch<Workflow>(`/workflows/${id}`, body)).data,
  remove: async (id: string) => api.delete(`/workflows/${id}`),
  // Running drafts emails with the AI, so allow extra time.
  execute: async (id: string, leadId: string) =>
    (await api.post<Execution>(`/workflows/${id}/execute`, { lead_id: leadId }, { timeout: 120_000 })).data,
  executions: async (status?: string) =>
    (await api.get<{ items: Execution[]; total: number }>('/workflows/executions', { params: { status, page_size: 50 } })).data,
  run: async (id: string) => (await api.post<Execution>(`/workflows/executions/${id}/run`, undefined, { timeout: 120_000 })).data,
  retry: async (id: string) => (await api.post<Execution>(`/workflows/executions/${id}/retry`, undefined, { timeout: 120_000 })).data,
  cancel: async (id: string) => (await api.post<Execution>(`/workflows/executions/${id}/cancel`)).data,
}

// ---------- observability (managers and above) ----------
export const observabilityApi = {
  stats: async (days = 7) => (await api.get<ObservabilityStats>('/observability/stats', { params: { days } })).data,
  runs: async (status?: string) =>
    (await api.get<{ items: RunSummary[]; total: number }>('/agent/runs', { params: { status, limit: 50 } })).data,
  trace: async (id: string) => (await api.get<Trace>(`/agent/runs/${id}/trace`)).data,
  activity: async (action?: string) =>
    (await api.get<{ items: ActivityItem[]; total: number }>('/activity', { params: { action: action || undefined, limit: 50 } })).data,
}

// ---------- notifications ----------
export const notificationsApi = {
  list: async () => (await api.get<{ items: AppNotification[]; unread: number }>('/notifications', { params: { limit: 20 } })).data,
  read: async (id: string) => (await api.post<AppNotification>(`/notifications/${id}/read`)).data,
  readAll: async () => (await api.post<{ marked: number }>('/notifications/read-all')).data,
}

// ---------- tasks ----------
export const tasksApi = {
  list: async (params: { scope?: 'mine' | 'all'; state?: 'open' | 'done' | 'all'; lead_id?: string }) =>
    (await api.get<TaskList>('/tasks', { params })).data,
  summary: async () => (await api.get<TaskSummary>('/tasks/summary')).data,
  create: async (body: NewTask) => (await api.post<Task>('/tasks', body)).data,
  update: async (id: string, body: Partial<Pick<Task, 'title' | 'notes' | 'due_at' | 'assigned_to' | 'status'>>) =>
    (await api.patch<Task>(`/tasks/${id}`, body)).data,
  remove: async (id: string) => api.delete(`/tasks/${id}`),
}