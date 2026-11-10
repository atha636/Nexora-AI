export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** `2026-11-09T00:00:00Z` -> `2026-11-09` for <input type="date"> */
export function toDateInput(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : ''
}

/** `2026-11-09` -> ISO string (or null when empty) */
export function fromDateInput(value: string): string | null {
  if (!value) return null
  const d = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const inrCompact = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  notation: 'compact',
  maximumFractionDigits: 1,
})

export const formatCurrency = (n: number) => inr.format(n)
export const formatCurrencyCompact = (n: number) => inrCompact.format(n)
export const formatNumber = (n: number) => new Intl.NumberFormat('en-IN').format(n)

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "2026-03" -> "Mar" (or "Jan ’27" for January, so year changes are visible) */
export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  const name = MONTHS[(m ?? 1) - 1] ?? key
  return m === 1 ? `${name} ’${String(y).slice(2)}` : name
}

export function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return days < 30 ? `${days}d ago` : formatDate(iso)
}