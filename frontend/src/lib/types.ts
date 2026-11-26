export type Role = 'owner' | 'admin' | 'manager' | 'employee'
export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'won' | 'lost'
export type LeadPriority = 'low' | 'medium' | 'high'

export const LEAD_STATUSES: LeadStatus[] = ['new', 'contacted', 'qualified', 'won', 'lost']
export const LEAD_PRIORITIES: LeadPriority[] = ['low', 'medium', 'high']

export const ROLE_RANK: Record<Role, number> = { employee: 0, manager: 1, admin: 2, owner: 3 }

export interface User {
  id: string
  email: string
  full_name: string
  role: Role
  organization: { id: string; name: string }
}

export interface TeamMember {
  id: string
  email: string
  full_name: string
  role: Role
}

export interface Lead {
  id: string
  name: string
  email: string | null
  phone: string | null
  company: string | null
  city: string | null
  source: string | null
  status: LeadStatus
  priority: LeadPriority
  assigned_to: string | null
  last_contacted_at: string | null
  created_at: string
  updated_at: string
}

export interface LeadList {
  items: Lead[]
  total: number
  page: number
  page_size: number
}

export interface LeadInput {
  name: string
  email: string | null
  phone: string | null
  company: string | null
  city: string | null
  source: string | null
  status: LeadStatus
  priority: LeadPriority
  assigned_to: string | null
  last_contacted_at: string | null
}

export interface LeadQuery {
  q?: string
  city?: string
  priority?: LeadPriority | ''
  status?: LeadStatus | ''
  stale_days?: number
  assigned?: 'me' | 'none'
  created_days?: number
  sort: string
  order: 'asc' | 'desc'
  page: number
  page_size: number
}

/** The filters a saved view remembers (the server accepts only these keys). */
export interface ViewFilters {
  q?: string
  city?: string
  priority?: LeadPriority
  status?: LeadStatus
  stale_days?: number
  assigned?: 'me' | 'none'
  created_days?: number
  sort?: string
  order?: 'asc' | 'desc'
}

export interface SavedView {
  id: string
  name: string
  filters: ViewFilters
  shared: boolean
  mine: boolean
  created_at: string
}

export interface ActivityEvent {
  id: string
  action: string
  details: Record<string, unknown> | null
  actor_name: string | null
  created_at: string
}

// ---------- analytics ----------
export interface Kpis {
  total_leads: number
  won_leads: number
  total_revenue: number
  conversion_rate: number
  active_workflows: number
  pending_approvals: number
  documents_indexed: number
}
export interface MonthRevenue {
  month: string
  revenue: number
  deals: number
}
export interface MonthLeads {
  month: string
  created: number
  won: number
  conversion_rate: number
}
export interface LabelCount {
  label: string
  count: number
}
export interface LabelRevenue {
  label: string
  revenue: number
  deals: number
}
export interface SalesPerson {
  id: string | null
  name: string
  revenue: number
  deals: number
  leads_assigned: number
  leads_won: number
  conversion_rate: number
}
export interface ActivityItem {
  id: string
  action: string
  entity_type: string
  summary: string
  actor_name: string | null
  created_at: string
}
export interface DashboardOverview {
  kpis: Kpis
  monthly_revenue: MonthRevenue[]
  lead_acquisition: MonthLeads[]
  leads_by_city: LabelCount[]
  sales_performance: SalesPerson[]
  recent_activity: ActivityItem[]
}
export interface RevenueAnalytics {
  months: number
  total: number
  monthly: MonthRevenue[]
  by_city: LabelRevenue[]
  by_salesperson: SalesPerson[]
}
export interface LeadAnalytics {
  months: number
  acquisition: MonthLeads[]
  by_status: LabelCount[]
  by_source: LabelCount[]
  by_city: LabelCount[]
}

// ---------- knowledge base ----------
export type DocumentStatus = 'pending' | 'processing' | 'ready' | 'failed'

export interface DocumentItem {
  id: string
  filename: string
  file_type: 'pdf' | 'docx' | 'txt'
  file_size: number
  status: DocumentStatus
  error_message: string | null
  page_count: number | null
  chunk_count: number
  created_at: string
  updated_at: string
}

export interface SearchHit {
  chunk_id: string
  document_id: string
  filename: string
  page_number: number | null
  chunk_index: number
  content: string
  score: number
}

export interface Citation {
  number: number
  chunk_id: string
  document_id: string
  filename: string
  page_number: number | null
  chunk_index: number
  snippet: string
  score: number
}

export interface AskResponse {
  answer: string
  found: boolean
  reason: 'no_sources' | 'insufficient' | 'ungrounded' | null
  citations: Citation[]
  sources_considered: number
  model: string | null
  latency_ms: number
  prompt_tokens: number | null
  completion_tokens: number | null
}

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
export const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.txt']

// ---------- AI assistant ----------
export interface ChatLead {
  id: string
  name: string
  company: string | null
  city: string | null
  email: string | null
  status: LeadStatus
  priority: LeadPriority
  last_contacted_at: string | null
}

export interface ToolStep {
  name: string
  status: 'ok' | 'error' | 'blocked'
  duration_ms: number
  summary: string | null
  error: string | null
}

export interface SourceItem {
  number: number
  chunk_id: string
  document_id: string
  filename: string
  page_number: number | null
  chunk_index: number
  snippet: string
  score: number
  cited: boolean
}

export interface SalesSummaryData {
  currency: string
  months: number
  total_revenue: number
  total_deals: number
  average_deal: number
  best_month: MonthRevenue | null
  monthly: MonthRevenue[]
  top_cities: LabelRevenue[]
  top_salespeople: { name: string; revenue: number; deals: number; conversion_rate: number }[]
}

export interface LeadAnalyticsData {
  months: number
  leads_created_in_period: number
  of_which_won_today: number
  conversion_rate_percent: number
  monthly: MonthLeads[]
  all_leads_by_status: LabelCount[]
  all_leads_by_source: LabelCount[]
  all_leads_by_city: LabelCount[]
}

export interface AnalyticsRow {
  label: string
  value: number
  previous?: number
  change?: number
  change_pct?: number | null
  contribution_pct?: number
}

export interface AnalyticsResult {
  metric: string
  metric_label: string
  unit: 'currency' | 'count' | 'percent'
  group_by: string | null
  group_label: string | null
  period: { label: string; start: string | null; end: string | null }
  previous_period: { label: string; start: string | null; end: string | null } | null
  filters: Record<string, string>
  total: number
  previous_total: number | null
  rows: AnalyticsRow[]
  total_groups: number
  truncated: boolean
  notes: string[]
  chart: { type: 'bar' | 'line'; x_key: string; y_key: string } | null
}

export interface AnalyticsAnswer {
  answer: string
  results: AnalyticsResult[]
  run_id: string
  trace_id: string
  duration_ms: number | null
  tools: { name: string; status: string; summary: string; error: string | null; duration_ms: number }[]
}

// ---------- email drafts and approvals ----------
export interface EmailDraft {
  id: string
  lead_id: string | null
  lead_name: string | null
  to_email: string | null
  subject: string
  body: string
  tone: string
  purpose: string
  status: 'draft' | 'pending_approval' | 'sent' | 'failed' | 'discarded'
  ai_generated: boolean
  approval_id: string | null
  sent_at: string | null
  created_at: string
  updated_at: string
}

export interface EmailMeta {
  tones: string[]
  purposes: string[]
  provider: string
  simulated: boolean
}

export interface ApprovalItem {
  id: string
  action_type: string
  entity_id: string | null
  title: string
  payload: { to?: string; subject?: string; body?: string; lead_name?: string; lead_id?: string }
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'failed' | 'cancelled'
  requested_by_name: string | null
  requested_via: string
  decided_by_name: string | null
  decided_at: string | null
  decision_note: string | null
  executed_at: string | null
  result: { provider?: string; simulated?: boolean } | null
  error_message: string | null
  created_at: string
  can_decide: boolean
  can_cancel: boolean
}

// ---------- workflows ----------
export type WorkflowCondition = {
  field: 'priority' | 'status' | 'city' | 'source' | 'days_since_contact' | 'has_email'
  op: 'eq' | 'neq' | 'gte' | 'lte'
  value: string | number | boolean
}
export type WorkflowAction =
  | { type: 'draft_email'; tone: string; purpose: string; instructions?: string }
  | { type: 'request_approval' }
  | { type: 'update_lead'; status?: LeadStatus; priority?: LeadPriority }

export interface WorkflowDefinition {
  name: string
  description: string | null
  trigger_type: 'manual' | 'lead_created'
  conditions: WorkflowCondition[]
  actions: WorkflowAction[]
  is_active: boolean
}
export interface Workflow extends WorkflowDefinition {
  id: string
  created_by_name: string | null
  created_at: string
  updated_at: string
  run_count: number
  last_run: { id: string; status: string; lead_name: string | null; created_at: string } | null
}
export interface ExecutionStep {
  index: number
  type: string
  status: 'ok' | 'error' | 'waiting'
  summary: string
  error: string | null
  duration_ms: number
  attempts: number
  at: string
}
export interface Execution {
  id: string
  workflow_id: string | null
  workflow_name: string
  lead_id: string | null
  lead_name: string | null
  trigger_source: string
  status: 'queued' | 'running' | 'waiting_approval' | 'completed' | 'failed' | 'cancelled' | 'skipped'
  cursor: number
  total_steps: number
  attempts: number
  definition: { conditions: WorkflowCondition[]; actions: WorkflowAction[] }
  steps: ExecutionStep[]
  context: { approval_id?: string; draft_id?: string }
  error_message: string | null
  trace_id: string
  started_at: string | null
  finished_at: string | null
  created_at: string
  created_by_name: string | null
}
export interface BriefingItem {
  key: string
  title: string
  value: string
  detail: string
  tone: 'good' | 'warn' | 'neutral'
  href: string
}

export type Block =
  | {
      type: 'workflow_status'
      tool: string
      data: { workflows: { id: string; name: string; trigger: string; active: boolean; steps: string[]; recent_runs: { id: string; status: string; lead: string | null; error: string | null }[] }[] }
    }
  | {
      type: 'email_drafts'
      tool: string
      data: { drafts: Pick<EmailDraft, 'id' | 'lead_name' | 'to_email' | 'subject' | 'body' | 'status'>[]; skipped: { reason: string; lead_name?: string }[] }
    }
  | {
      type: 'approval_requests'
      tool: string
      data: { approvals: { id: string; title: string; status: string; to: string; subject: string }[]; skipped: { reason: string }[] }
    }
  | { type: 'analytics_result'; tool: string; data: AnalyticsResult }
  | { type: 'activity'; tools: ToolStep[] }
  | {
      type: 'leads'
      tool: string
      data: { total_matching: number; returned: number; filters: Record<string, string | number>; leads: ChatLead[] }
    }
  | {
      type: 'lead_saved'
      tool: string
      data: { created?: boolean; updated?: boolean; changed?: Record<string, [unknown, unknown]>; lead: ChatLead }
    }
  | { type: 'sales_summary'; tool: string; data: SalesSummaryData }
  | { type: 'lead_analytics'; tool: string; data: LeadAnalyticsData }
  | { type: 'sources'; sources: SourceItem[] }

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  blocks: Block[] | null
  run_id: string | null
  created_at: string
}

export interface ConversationSummary {
  id: string
  title: string
  created_at: string
  updated_at: string
}

export interface ConversationDetail extends ConversationSummary {
  messages: ChatMessage[]
}

export interface ChatResponse {
  conversation: ConversationSummary
  user_message: ChatMessage
  assistant_message: ChatMessage
  run_id: string
  trace_id: string
  usage: {
    steps: number
    tool_calls: number
    prompt_tokens: number | null
    completion_tokens: number | null
    duration_ms: number | null
  }
}


// ---------- observability ----------
export interface RunSummary {
  id: string
  trace_id: string
  status: 'running' | 'completed' | 'failed'
  model: string
  user_name: string | null
  steps: number
  tool_call_count: number
  total_tokens: number | null
  error_message: string | null
  started_at: string
  duration_ms: number | null
}

export interface TraceStep {
  sequence: number
  tool_name: string
  status: 'ok' | 'error' | 'blocked'
  arguments: Record<string, unknown> | string | null
  summary: string | null
  error_message: string | null
  duration_ms: number
  offset_ms: number
}

export interface Trace {
  run: RunSummary
  prompt_tokens: number | null
  completion_tokens: number | null
  finished_at: string | null
  timeline: TraceStep[]
}

export interface ObservabilityStats {
  days: number
  runs: number
  failed: number
  failure_rate: number
  avg_duration_ms: number | null
  p95_duration_ms: number | null
  total_tokens: number
  tool_calls: number
  tool_errors: number
  blocked_tool_calls: number
  by_tool: { tool: string; calls: number; errors: number; blocked: number; avg_ms: number }[]
}

export interface ActivityItem {
  id: string
  action: string
  entity_type: string
  entity_id: string | null
  actor_name: string | null
  created_at: string
  details: Record<string, unknown> | null
}

// ---------- notifications ----------
export interface AppNotification {
  id: string
  kind: string
  title: string
  body: string | null
  link: string | null
  read_at: string | null
  created_at: string
}

// ---------- tasks ----------
export interface Task {
  id: string
  title: string
  notes: string | null
  status: 'open' | 'done'
  due_at: string | null
  overdue: boolean
  completed_at: string | null
  lead_id: string | null
  lead_name: string | null
  assigned_to: string | null
  assigned_name: string | null
  created_by: string | null
  created_at: string
}
export interface TaskList {
  items: Task[]
  total: number
}
export interface TaskSummary {
  open: number
  overdue: number
  due_soon: number
}
export interface NewTask {
  title: string
  due_at?: string | null
  lead_id?: string | null
  assigned_to?: string | null
  notes?: string | null
}