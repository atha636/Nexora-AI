import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Card, Skeleton } from '../ui/Card'
import { useTaskActions } from '../../hooks/useTaskActions'
import { errorMessage, tasksApi } from '../../lib/api'
import QuickAddTask from './QuickAddTask'
import TaskItem from './TaskItem'

/** The follow-ups for one lead, shown on the lead page. */
export default function LeadTasks({ leadId }: { leadId: string }) {
  const [showDone, setShowDone] = useState(false)
  const { toggle, remove, refresh } = useTaskActions()
  const tasks = useQuery({ queryKey: ['tasks', 'lead', leadId], queryFn: () => tasksApi.list({ lead_id: leadId, state: 'all' }) })
  const all = tasks.data?.items ?? []
  const open = all.filter((t) => t.status === 'open')
  const done = all.filter((t) => t.status === 'done')
  const busy = toggle.isPending || remove.isPending

  return (
    <Card className="p-5">
      <h2 className="mb-3 text-sm font-semibold text-slate-200">Follow-ups</h2>
      <QuickAddTask leadId={leadId} onAdded={refresh} />
      <div className="mt-3">
        {tasks.isLoading ? (
          <Skeleton className="h-12 w-full" />
        ) : tasks.isError ? (
          <p role="alert" className="text-sm text-red-400">
            {errorMessage(tasks.error, 'Could not load tasks.')}
          </p>
        ) : open.length === 0 ? (
          <p className="py-2 text-sm text-slate-500">Nothing planned. Add the next step so this lead doesn’t go cold.</p>
        ) : (
          <ul className="divide-y divide-line">
            {open.map((t) => (
              <TaskItem key={t.id} task={t} showAssignee busy={busy} onToggle={toggle.mutate} onDelete={remove.mutate} />
            ))}
          </ul>
        )}
        {done.length > 0 && (
          <>
            <button type="button" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone} className="mt-2 text-xs text-slate-500 hover:text-slate-300">
              {showDone ? 'Hide' : 'Show'} {done.length} completed
            </button>
            {showDone && (
              <ul className="divide-y divide-line">
                {done.map((t) => (
                  <TaskItem key={t.id} task={t} busy={busy} onToggle={toggle.mutate} onDelete={remove.mutate} />
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Card>
  )
}