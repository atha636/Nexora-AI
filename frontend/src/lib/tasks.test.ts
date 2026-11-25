import { describe, expect, it } from 'vitest'
import { dueInfo, endOfLocalDay, groupTasks, localDate } from './tasks'
import type { Task } from './types'

const NOW = new Date(2026, 10, 25, 10, 0) // 25 Nov 2026, 10:00 local
const task = (due_at: string | null, extra: Partial<Task> = {}): Task => ({
  id: Math.random().toString(), title: 't', notes: null, status: 'open', due_at, overdue: false, completed_at: null,
  lead_id: null, lead_name: null, assigned_to: null, assigned_name: null, created_by: null, created_at: '2026-11-01T00:00:00Z', ...extra,
})
const at = (y: number, m: number, d: number, h = 23, min = 59) => new Date(y, m - 1, d, h, min).toISOString()

describe('dates', () => {
  it('formats local dates and adds days across month ends', () => {
    expect(localDate(0, NOW)).toBe('2026-11-25')
    expect(localDate(7, NOW)).toBe('2026-12-02')
  })
  it('a chosen date means the end of that day', () => {
    const d = new Date(endOfLocalDay('2026-11-25')!)
    expect([d.getHours(), d.getMinutes(), d.getDate()]).toEqual([23, 59, 25])
    expect(endOfLocalDay('')).toBeNull()
  })
})

describe('dueInfo', () => {
  it('describes each situation in plain words', () => {
    expect(dueInfo(task(null), NOW)).toEqual({ label: 'No due date', state: 'none' })
    expect(dueInfo(task(at(2026, 11, 25)), NOW)).toEqual({ label: 'Due today', state: 'today' })
    expect(dueInfo(task(at(2026, 11, 26)), NOW)).toEqual({ label: 'Due tomorrow', state: 'soon' })
    expect(dueInfo(task(at(2026, 11, 24), { overdue: true }), NOW)).toEqual({ label: 'Overdue · yesterday', state: 'overdue' })
    expect(dueInfo(task(at(2026, 11, 20), { overdue: true }), NOW)).toEqual({ label: 'Overdue · 5 days', state: 'overdue' })
    expect(dueInfo(task(at(2026, 12, 20)), NOW).state).toBe('later')
    expect(dueInfo(task(at(2026, 11, 28)), NOW).state).toBe('soon')
  })
  it('a task due earlier today that has passed is overdue; a finished one is just done', () => {
    expect(dueInfo(task(at(2026, 11, 25, 9, 0), { overdue: true }), NOW).state).toBe('overdue')
    expect(dueInfo(task(at(2026, 11, 1), { status: 'done' }), NOW)).toEqual({ label: 'Done', state: 'done' })
  })
})

describe('groupTasks', () => {
  it('orders groups overdue, today, upcoming, none and drops empty ones', () => {
    const g = groupTasks([task(null), task(at(2026, 11, 30)), task(at(2026, 11, 25)), task(at(2026, 11, 20), { overdue: true })], NOW)
    expect(g.map((x) => x.key)).toEqual(['overdue', 'today', 'upcoming', 'none'])
    expect(groupTasks([task(null)], NOW).map((x) => x.key)).toEqual(['none'])
  })
})