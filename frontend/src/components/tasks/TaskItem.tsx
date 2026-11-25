import { Check, Trash2, User } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { DUE_TONE, dueInfo } from '../../lib/tasks'
import type { Task } from '../../lib/types'

export default function TaskItem({
  task,
  showLead = false,
  showAssignee = false,
  busy = false,
  onToggle,
  onDelete,
}: {
  task: Task
  showLead?: boolean
  showAssignee?: boolean
  busy?: boolean
  onToggle: (t: Task) => void
  onDelete: (t: Task) => void
}) {
  const { user, can } = useAuth()
  const done = task.status === 'done'
  const { label, state } = dueInfo(task)
  // Mirrors the server's rule; the server is what actually enforces it.
  const editable = can('manager') || task.created_by === user?.id || task.assigned_to === user?.id
  return (
    <li className="group flex items-start gap-3 py-3">
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `Reopen “${task.title}”` : `Mark “${task.title}” done`}
        disabled={!editable || busy}
        onClick={() => onToggle(task)}
        className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border transition ${
          done ? 'border-brand bg-brand text-black' : 'border-slate-500 hover:border-brand'
        } disabled:opacity-50`}
      >
        {done && <Check className="h-3.5 w-3.5" aria-hidden />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`break-words text-sm ${done ? 'text-slate-500 line-through' : ''}`}>{task.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className={`rounded-full px-2 py-0.5 ${DUE_TONE[state]}`}>{label}</span>
          {showLead && task.lead_id && (
            <Link to={`/leads/${task.lead_id}`} className="text-electric hover:underline">
              {task.lead_name}
            </Link>
          )}
          {showAssignee && task.assigned_name && (
            <span className="inline-flex items-center gap-1 text-slate-500">
              <User className="h-3 w-3" aria-hidden /> {task.assigned_name}
            </span>
          )}
        </div>
        {task.notes && <p className="mt-1 break-words text-xs text-slate-500">{task.notes}</p>}
      </div>
      {editable && (
        <button
          type="button"
          aria-label={`Delete “${task.title}”`}
          disabled={busy}
          onClick={() => onDelete(task)}
          className="rounded-md p-1.5 text-slate-500 opacity-60 transition hover:bg-navy-700 hover:text-red-400 group-hover:opacity-100 focus:opacity-100"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </li>
  )
}