import { afterEach, describe, expect, it, vi } from 'vitest'
import { setLang } from '../i18n/core'
import { formatCurrency, formatCurrencyCompact, formatNumber, monthLabel, timeAgo } from './format'

afterEach(() => {
  setLang('en')
  vi.useRealTimers()
})

describe('formats follow the language', () => {
  it('keeps Indian digit grouping in both languages', () => {
    expect(formatNumber(3616500)).toBe('36,16,500')
    expect(formatCurrency(3616500)).toContain('36,16,500')
    setLang('hi')
    expect(formatNumber(3616500)).toBe('36,16,500')
    expect(formatCurrency(3616500)).toContain('36,16,500')
  })

  it('writes compact amounts in lakh in Hindi', () => {
    setLang('hi')
    expect(formatCurrencyCompact(3600000)).toMatch(/लाख/)
  })

  it('names months in Hindi', () => {
    expect(monthLabel('2026-03')).toBe('Mar')
    setLang('hi')
    expect(monthLabel('2026-03')).toMatch(/[ऀ-ॿ]/)
  })

  it('says how long ago in the chosen language', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-27T10:00:00Z'))
    expect(timeAgo('2026-11-27T09:00:00Z')).toBe('1h ago')
    setLang('hi')
    expect(timeAgo('2026-11-27T09:00:00Z')).toBe('1 घंटे पहले')
    expect(timeAgo('2026-11-27T09:59:50Z')).toBe('अभी')
  })
})