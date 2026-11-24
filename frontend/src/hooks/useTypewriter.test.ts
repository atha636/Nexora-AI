import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTypewriter } from './useTypewriter'

describe('useTypewriter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never
  })
  afterEach(() => vi.useRealTimers())

  it('shows everything at once when disabled', () => {
    const { result } = renderHook(() => useTypewriter('one two three', false))
    expect(result.current).toMatchObject({ shown: 'one two three', done: true })
  })

  it('reveals words over time, then finishes with the exact text', () => {
    const { result } = renderHook(() => useTypewriter('one two three four', true))
    expect(result.current.done).toBe(false)
    act(() => void vi.advanceTimersByTime(60))
    expect(result.current.shown.length).toBeGreaterThan(0)
    act(() => void vi.advanceTimersByTime(3000))
    expect(result.current).toMatchObject({ shown: 'one two three four', done: true })
  })

  it('can be skipped', () => {
    const { result } = renderHook(() => useTypewriter('a b c d e f', true))
    act(() => result.current.skip())
    expect(result.current.done).toBe(true)
  })

  it('does not animate tables or code', () => {
    const table = 'Intro\n| a | b |\n|---|---|\n| 1 | 2 |'
    const { result } = renderHook(() => useTypewriter(table, true))
    expect(result.current).toMatchObject({ shown: table, done: true })
  })
})