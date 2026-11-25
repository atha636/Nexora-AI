import { useMutation, useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '../ui/Button'
import { inputClass } from '../ui/Field'
import { useToast } from '../ui/Toast'
import { authApi, errorMessage, tasksApi } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { endOfLocalDay, localDate } from '../../lib/tasks'

const QUICK = [
  { label: 'Today', days: 0 },
  { label: 'Tomorrow', days: 1 },
  { label: 'In 3 days', days: 3 },
  { label: 'Next week', days: 7 },
]

/** One-line "add a follow-up" form with quick date chips. Managers can also pick who it is for. */
export default function QuickAddTask({ leadId, onAdded }: { leadId?: string; onAdded: () => void }) {
  const { user, can } = useAuth()
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [assignee, setAssignee] = useState('')
  const team = useQuery({ queryKey: ['team'], queryFn: authApi.team, enabled: can('manager') })

  const add = useMutation({
    mutationFn: () =>
      tasksApi.create({ title: title.trim(), lead_id: leadId ?? null, due_at: date ? endOfLocalDay(date) : null, assigned_to: assignee || null }),
    onSuccess: () => {
      setTitle('')
      setDate('')
      toast.success('Task added')
      onAdded()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  return (
    <form
      className="space-y-2"
      onSubmit={(e: FormEvent) => {
        e.preventDefault()
        if (title.trim()) add.mutate()
      }}
    >
      <div className="flex gap-2">
        <input
          aria-label="New task"
          className={inputClass}
          placeholder="e.g. Call back about pricing"
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Button type="submit" disabled={add.isPending || !title.trim()} aria-label="Add task">
          <Plus className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Add</span>
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {QUICK.map((q) => {
          const v = localDate(q.days)
          return (
            <button
              key={q.label}
              type="button"
              aria-pressed={date === v}
              onClick={() => setDate(date === v ? '' : v)}
              className={`rounded-full border px-2.5 py-1 text-xs transition ${
                date === v ? 'border-brand bg-brand/15 text-white' : 'border-line text-slate-400 hover:text-white'
              }`}
            >
              {q.label}
            </button>
          )
        })}
        <input
          type="date"
          aria-label="Due date"
          value={date}
          min={localDate(0)}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-line bg-navy-950 px-2 py-1 text-xs text-slate-300 focus:border-electric focus:outline-none"
        />
        {can('manager') && (
          <select
            aria-label="Assign to"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            className="min-w-0 rounded-lg border border-line bg-navy-950 px-2 py-1 text-xs text-slate-300"
          >
            <option value="">For me</option>
            {(team.data ?? []).filter((m) => m.id !== user?.id).map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name}
              </option>
            ))}
          </select>
        )}
      </div>
    </form>
  )
}