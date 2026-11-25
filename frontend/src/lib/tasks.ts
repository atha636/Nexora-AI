import { parseTime } from './format'
import type { Task } from './types'

const pad = (n: number) => String(n).padStart(2, '0')

/** Today plus `days`, as yyyy-mm-dd in the person's own time zone (what <input type="date"> uses). */
export function localDate(days = 0, from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** A date means "by the end of that day" where the person is, so a task due today is not overdue at 9am. */
export function endOfLocalDay(date: string): string | null {
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d, 23, 59, 0).toISOString()
}

export function dueToInput(iso: string | null): string {
  return iso ? localDate(0, parseTime(iso)) : ''
}

export type DueState = 'overdue' | 'today' | 'soon' | 'later' | 'none' | 'done'

/** Whole calendar days from today to the due date (negative = in the past). */
function dayDiff(due: Date, now: Date): number {
  const a = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime()
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return Math.round((a - b) / 86_400_000)
}

export function dueInfo(task: Pick<Task, 'due_at' | 'status' | 'overdue'>, now = new Date()): { label: string; state: DueState } {
  if (task.status === 'done') return { label: 'Done', state: 'done' }
  if (!task.due_at) return { label: 'No due date', state: 'none' }
  const due = parseTime(task.due_at)
  const diff = dayDiff(due, now)
  if (diff < 0 || (diff === 0 && task.overdue)) {
    return { label: diff === -1 ? 'Overdue · yesterday' : diff === 0 ? 'Overdue' : `Overdue · ${-diff} days`, state: 'overdue' }
  }
  if (diff === 0) return { label: 'Due today', state: 'today' }
  if (diff === 1) return { label: 'Due tomorrow', state: 'soon' }
  return { label: `Due ${due.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}`, state: diff <= 7 ? 'soon' : 'later' }
}

export const DUE_TONE: Record<DueState, string> = {
  overdue: 'bg-red-500/15 text-red-300',
  today: 'bg-amber-500/15 text-amber-300',
  soon: 'bg-sky-500/15 text-sky-300',
  later: 'bg-navy-700 text-slate-300',
  none: 'bg-navy-700 text-slate-500',
  done: 'bg-brand/15 text-brand',
}

/** Groups open tasks for the "My tasks" page. */
export function groupTasks(tasks: Task[], now = new Date()): { key: string; title: string; items: Task[] }[] {
  const groups: Record<string, Task[]> = { overdue: [], today: [], upcoming: [], none: [] }
  for (const t of tasks) {
    const { state } = dueInfo(t, now)
    ;(state === 'overdue' ? groups.overdue : state === 'today' ? groups.today : state === 'none' ? groups.none : groups.upcoming).push(t)
  }
  return [
    { key: 'overdue', title: 'Overdue', items: groups.overdue },
    { key: 'today', title: 'Due today', items: groups.today },
    { key: 'upcoming', title: 'Upcoming', items: groups.upcoming },
    { key: 'none', title: 'No due date', items: groups.none },
  ].filter((g) => g.items.length > 0)
}