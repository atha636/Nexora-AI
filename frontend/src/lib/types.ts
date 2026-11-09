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