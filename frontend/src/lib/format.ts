import { getLang, translate } from '../i18n/core'

/** 'hi-IN' for Hindi, otherwise the same Indian English formats as before. */
const locale = () => (getLang() === 'hi' ? 'hi-IN' : 'en-IN')

/** The API sends UTC. SQLite (local dev) drops the "Z", and browsers would then read the time as local,
 *  so a fresh item could show "5h ago" in India. Treat timestamps without a zone as UTC. */
export function parseTime(iso: string): Date {
  return new Date(/(Z|[+-]\d{2}:?\d{2})$/.test(iso) || !iso.includes('T') ? iso : `${iso}Z`)
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = parseTime(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(getLang() === 'hi' ? 'hi-IN' : undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatDateTime(iso: string): string {
  const d = parseTime(iso)
  return d.toLocaleString(getLang() === 'hi' ? 'hi-IN' : undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
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

const cache = new Map<string, Intl.NumberFormat>()
function nf(kind: 'inr' | 'compact' | 'plain'): Intl.NumberFormat {
  const key = `${locale()}:${kind}`
  let f = cache.get(key)
  if (!f) {
    const o: Intl.NumberFormatOptions =
      kind === 'inr' ? { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }
      : kind === 'compact' ? { style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 1 }
      : {}
    f = new Intl.NumberFormat(locale(), o)
    cache.set(key, f)
  }
  return f
}

export const formatCurrency = (n: number) => nf('inr').format(n)
export const formatCurrencyCompact = (n: number) => nf('compact').format(n)
export const formatNumber = (n: number) => nf('plain').format(n)

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "2026-03" -> "Mar" (or "Jan ’27" for January, so year changes are visible) */
export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  const name =
    getLang() === 'hi'
      ? new Date(Date.UTC(y, (m ?? 1) - 1, 1)).toLocaleDateString('hi-IN', { month: 'short', timeZone: 'UTC' })
      : (MONTHS[(m ?? 1) - 1] ?? key)
  return m === 1 ? `${name} ’${String(y).slice(2)}` : name
}

export function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - parseTime(iso).getTime()) / 1000)
  if (seconds < 60) return translate('time.justNow')
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return translate('time.minutesAgo', { n: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return translate('time.hoursAgo', { n: hours })
  const days = Math.floor(hours / 24)
  return days < 30 ? translate('time.daysAgo', { n: days }) : formatDate(iso)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}