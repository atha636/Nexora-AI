import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatBytes, formatCurrency, fromDateInput, monthLabel, parseTime, timeAgo, titleCase, toDateInput } from './format'

describe('parseTime', () => {
  it('treats timestamps without a zone as UTC (SQLite drops the Z)', () => {
    expect(parseTime('2026-11-09T10:00:00').toISOString()).toBe('2026-11-09T10:00:00.000Z')
  })
  it('keeps explicit zones', () => {
    expect(parseTime('2026-11-09T10:00:00+05:30').toISOString()).toBe('2026-11-09T04:30:00.000Z')
    expect(parseTime('2026-11-09T10:00:00Z').toISOString()).toBe('2026-11-09T10:00:00.000Z')
  })
})

describe('date inputs', () => {
  it('round-trips', () => {
    expect(toDateInput('2026-11-09T00:00:00Z')).toBe('2026-11-09')
    expect(fromDateInput('2026-11-09')).toBe('2026-11-09T00:00:00.000Z')
  })
  it('handles empty and invalid values', () => {
    expect(toDateInput(null)).toBe('')
    expect(fromDateInput('')).toBeNull()
    expect(fromDateInput('not-a-date')).toBeNull()
  })
})

describe('timeAgo', () => {
  afterEach(() => vi.useRealTimers())
  it('uses friendly units', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-09T12:00:00Z'))
    expect(timeAgo('2026-11-09T11:59:40Z')).toBe('just now')
    expect(timeAgo('2026-11-09T11:30:00Z')).toBe('30m ago')
    expect(timeAgo('2026-11-09T09:00:00Z')).toBe('3h ago')
    expect(timeAgo('2026-11-06T12:00:00Z')).toBe('3d ago')
  })
})

describe('misc formatters', () => {
  it('formats bytes', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })
  it('formats rupees with Indian grouping', () => {
    expect(formatCurrency(1234567)).toContain('12,34,567')
  })
  it('labels months and marks January with the year', () => {
    expect(monthLabel('2026-03')).toBe('Mar')
    expect(monthLabel('2027-01')).toBe('Jan ’27')
  })
  it('title-cases', () => expect(titleCase('hello')).toBe('Hello'))
})