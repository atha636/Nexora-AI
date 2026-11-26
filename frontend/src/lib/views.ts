import type { LeadQuery, ViewFilters } from './types'

/** Quick filters shown as chips. "me" and "none" share one key, so they exclude each other. */
export const SMART_FILTERS: { id: string; label: string; patch: Partial<LeadQuery>; isOn: (q: LeadQuery) => boolean }[] = [
  { id: 'stale', label: 'Not contacted in 7 days', patch: { stale_days: 7 }, isOn: (q) => q.stale_days === 7 },
  { id: 'mine', label: 'Assigned to me', patch: { assigned: 'me' }, isOn: (q) => q.assigned === 'me' },
  { id: 'unassigned', label: 'Unassigned', patch: { assigned: 'none' }, isOn: (q) => q.assigned === 'none' },
  { id: 'new', label: 'New this week', patch: { created_days: 7 }, isOn: (q) => q.created_days === 7 },
]

/** What a "clear everything" looks like: every filter off, sort back to newest first. */
export const CLEARED: Partial<LeadQuery> = {
  q: '', city: '', priority: '', status: '', stale_days: undefined, assigned: undefined, created_days: undefined,
  sort: 'created_at', order: 'desc',
}

/** The filters worth saving from the current query (empty ones are left out). */
export function filtersFromQuery(q: LeadQuery): ViewFilters {
  const f: ViewFilters = {}
  if (q.q?.trim()) f.q = q.q.trim()
  if (q.city) f.city = q.city
  if (q.priority) f.priority = q.priority
  if (q.status) f.status = q.status
  if (q.stale_days) f.stale_days = q.stale_days
  if (q.assigned) f.assigned = q.assigned
  if (q.created_days) f.created_days = q.created_days
  return f
}

/** Applying a view replaces every filter, so leftovers from the previous one never linger. */
export function queryPatchFromView(f: ViewFilters): Partial<LeadQuery> {
  return {
    ...CLEARED,
    q: f.q ?? '',
    city: f.city ?? '',
    priority: f.priority ?? '',
    status: f.status ?? '',
    stale_days: f.stale_days,
    assigned: f.assigned,
    created_days: f.created_days,
    sort: f.sort ?? 'created_at',
    order: f.order ?? 'desc',
    page: 1,
  }
}

export function sameFilters(a: ViewFilters, b: ViewFilters): boolean {
  const keys = ['q', 'city', 'priority', 'status', 'stale_days', 'assigned', 'created_days'] as const
  return keys.every((k) => (a[k] ?? null) === (b[k] ?? null))
}

export const hasAnyFilter = (q: LeadQuery) => Object.keys(filtersFromQuery(q)).length > 0