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