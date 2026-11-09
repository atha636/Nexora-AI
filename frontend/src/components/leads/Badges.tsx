import { titleCase } from '../../lib/format'
import type { LeadPriority, LeadStatus } from '../../lib/types'

const statusStyle: Record<LeadStatus, string> = {
  new: 'bg-electric/15 text-electric',
  contacted: 'bg-amber-400/15 text-amber-300',
  qualified: 'bg-brand/20 text-violet-300',
  won: 'bg-emerald-400/15 text-emerald-300',
  lost: 'bg-slate-500/20 text-slate-400',
}

const priorityStyle: Record<LeadPriority, string> = {
  high: 'bg-red-500/15 text-red-300',
  medium: 'bg-amber-400/15 text-amber-300',
  low: 'bg-slate-500/20 text-slate-400',
}

const base = 'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium'

export const StatusBadge = ({ status }: { status: LeadStatus }) => (
  <span className={`${base} ${statusStyle[status]}`}>{titleCase(status)}</span>
)

export const PriorityBadge = ({ priority }: { priority: LeadPriority }) => (
  <span className={`${base} ${priorityStyle[priority]}`}>{titleCase(priority)}</span>
)