import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Play } from 'lucide-react'
import { useState } from 'react'
import { errorMessage, leadsApi, workflowsApi } from '../../lib/api'
import type { Execution, Workflow } from '../../lib/types'
import { PriorityBadge } from '../leads/Badges'
import { Button } from '../ui/Button'
import { inputClass } from '../ui/Field'
import { Modal } from '../ui/Modal'

/** Pick a lead and run a workflow on it now. Drafting uses the AI, so this can take several seconds. */
export default function RunModal({ workflow, onClose, onDone }: { workflow: Workflow; onClose: () => void; onDone: (e: Execution) => void }) {
  const queryClient = useQueryClient()
  const [q, setQ] = useState('')
  const [leadId, setLeadId] = useState<string | null>(null)
  const leads = useQuery({
    queryKey: ['leads', 'picker', q],
    queryFn: () => leadsApi.list({ q, sort: 'created_at', order: 'desc', page: 1, page_size: 8 }),
  })
  const run = useMutation({
    mutationFn: () => workflowsApi.execute(workflow.id, leadId as string),
    onSuccess: (e) => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
      queryClient.invalidateQueries({ queryKey: ['approvals'] })
      onDone(e)
    },
  })

  return (
    <Modal open title={`Run “${workflow.name}”`} onClose={run.isPending ? () => undefined : onClose}>
      <label htmlFor="lead-search" className="mb-1 block text-sm font-medium text-slate-300">
        Choose a lead
      </label>
      <input id="lead-search" className={inputClass} placeholder="Search by name, email or company" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto" role="radiogroup" aria-label="Leads">
        {leads.isLoading && <li className="px-2 py-3 text-sm text-slate-500">Loading…</li>}
        {leads.data?.items.length === 0 && <li className="px-2 py-3 text-sm text-slate-500">No leads found.</li>}
        {leads.data?.items.map((l) => (
          <li key={l.id}>
            <label className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm ${leadId === l.id ? 'border-electric bg-electric/10' : 'border-line hover:bg-navy-700'}`}>
              <input type="radio" name="lead" className="sr-only" checked={leadId === l.id} onChange={() => setLeadId(l.id)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{l.name}</span>
                <span className="block truncate text-xs text-slate-400">
                  {l.company ?? '—'} · {l.city ?? '—'} · {l.email ?? 'no email'}
                </span>
              </span>
              <PriorityBadge priority={l.priority} />
            </label>
          </li>
        ))}
      </ul>
      {run.isError && (
        <p role="alert" className="mt-3 text-sm text-red-400">
          {errorMessage(run.error, 'The run could not be started.')}
        </p>
      )}
      <div className="mt-4 flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">{run.isPending ? 'Running… the AI is writing the draft.' : 'Emails are never sent without approval.'}</p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose} disabled={run.isPending}>
            Cancel
          </Button>
          <Button onClick={() => run.mutate()} disabled={!leadId || run.isPending}>
            <Play className="h-4 w-4" aria-hidden /> {run.isPending ? 'Running…' : 'Run'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}