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
  sort: string
  order: 'asc' | 'desc'
  page: number
  page_size: number
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

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
export const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.txt']