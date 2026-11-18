import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { GitBranch, Pause, Pencil, Play, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import StatusPill from '../components/emails/StatusPill'
import FlowDiagram from '../components/workflows/FlowDiagram'
import RunDetail from '../components/workflows/RunDetail'
import RunModal from '../components/workflows/RunModal'
import WorkflowBuilder from '../components/workflows/WorkflowBuilder'
import { Button } from '../components/ui/Button'
import { Card, Skeleton } from '../components/ui/Card'
import { ConfirmDialog } from '../components/ui/Modal'
import { useToast } from '../components/ui/Toast'
import { errorMessage, workflowsApi } from '../lib/api'
import { useAuth } from '../lib/auth'
import { timeAgo } from '../lib/format'
import type { Execution, Workflow } from '../lib/types'

const RUN_FILTERS = [
  { key: '', label: 'All' },
  { key: 'waiting_approval', label: 'Waiting' },
  { key: 'completed', label: 'Completed' },
  { key: 'failed', label: 'Failed' },
  { key: 'queued', label: 'Queued' },
]
const statusKey = (s: string) => (s === 'waiting_approval' ? 'pending_approval' : s)

export default function Workflows() {
  const { can } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'flows' | 'runs'>('flows')
  const [filter, setFilter] = useState('')
  const [building, setBuilding] = useState<Workflow | 'new' | null>(null)
  const [running, setRunning] = useState<Workflow | null>(null)
  const [deleting, setDeleting] = useState<Workflow | null>(null)
  const [viewing, setViewing] = useState<Execution | null>(null)

  const flows = useQuery({ queryKey: ['workflows', 'list'], queryFn: workflowsApi.list })
  const runs = useQuery({ queryKey: ['workflows', 'runs', filter], queryFn: () => workflowsApi.executions(filter || undefined), enabled: tab === 'runs' })

  const toggle = useMutation({
    mutationFn: (w: Workflow) => workflowsApi.update(w.id, { is_active: !w.is_active }),
    onSuccess: (w) => {
      toast.success(w.is_active ? 'Workflow resumed' : 'Workflow paused')
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const remove = useMutation({
    mutationFn: (w: Workflow) => workflowsApi.remove(w.id),
    onSuccess: () => {
      toast.success('Workflow deleted')
      setDeleting(null)
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
    },
    onError: (e) => {
      toast.error(errorMessage(e))
      setDeleting(null)
    },
  })

  const isAdmin = can('admin')
  const canRun = can('manager')

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Workflows</h1>
          <p className="mt-1 text-sm text-slate-400">Automate follow-ups. Workflows write drafts and ask for approval; they never send anything on their own.</p>
        </div>
        {isAdmin && (
          <Button onClick={() => setBuilding('new')}>
            <Plus className="h-4 w-4" aria-hidden /> New workflow
          </Button>
        )}
      </div>

      <div role="tablist" aria-label="Workflow views" className="flex gap-2">
        {(['flows', 'runs'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-full border px-3 py-1 text-xs transition ${tab === t ? 'border-electric bg-electric/10 text-white' : 'border-line text-slate-400 hover:bg-navy-700'}`}
          >
            {t === 'flows' ? 'Automations' : 'Run history'}
          </button>
        ))}
      </div>

      {tab === 'flows' && (
        <>
          {flows.isLoading && <Skeleton className="h-48 w-full" />}
          {flows.isError && (
            <Card className="p-6 text-sm text-red-300" role="alert">
              {errorMessage(flows.error, 'Could not load workflows.')}
            </Card>
          )}
          {flows.data?.length === 0 && (
            <Card className="grid place-items-center gap-2 p-10 text-center">
              <GitBranch className="h-8 w-8 text-slate-500" aria-hidden />
              <p className="text-sm text-slate-300">No workflows yet.</p>
              <p className="text-xs text-slate-500">{isAdmin ? 'Create one, for example: when a high-priority lead is created, draft a follow-up and ask a manager to approve it.' : 'An admin can create workflows.'}</p>
            </Card>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            {flows.data?.map((w) => (
              <Card key={w.id} className="flex flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="truncate font-medium">{w.name}</h2>
                    {w.description && <p className="mt-0.5 text-xs text-slate-400">{w.description}</p>}
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${w.is_active ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-500/15 text-slate-400'}`}>{w.is_active ? 'Active' : 'Paused'}</span>
                </div>
                <div className="mt-3 flex-1">
                  <FlowDiagram trigger={w.trigger_type} conditions={w.conditions} actions={w.actions} compact />
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                  <p className="text-xs text-slate-500">
                    {w.run_count} run{w.run_count === 1 ? '' : 's'}
                    {w.last_run && ` · last ${timeAgo(w.last_run.created_at)}`}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {canRun && (
                      <Button variant="outline" onClick={() => setRunning(w)} disabled={!w.is_active}>
                        <Play className="h-4 w-4" aria-hidden /> Run
                      </Button>
                    )}
                    {isAdmin && (
                      <>
                        <Button variant="ghost" aria-label={`Edit ${w.name}`} onClick={() => setBuilding(w)}>
                          <Pencil className="h-4 w-4" aria-hidden />
                        </Button>
                        <Button variant="ghost" aria-label={`${w.is_active ? 'Pause' : 'Resume'} ${w.name}`} onClick={() => toggle.mutate(w)} disabled={toggle.isPending}>
                          {w.is_active ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
                        </Button>
                        <Button variant="ghost" aria-label={`Delete ${w.name}`} onClick={() => setDeleting(w)} className="text-red-300">
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {tab === 'runs' && (
        <>
          <div role="tablist" aria-label="Filter runs" className="flex flex-wrap gap-2">
            {RUN_FILTERS.map((f) => (
              <button
                key={f.key}
                role="tab"
                aria-selected={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-full border px-3 py-1 text-xs transition ${filter === f.key ? 'border-electric bg-electric/10 text-white' : 'border-line text-slate-400 hover:bg-navy-700'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {runs.isLoading && <Skeleton className="h-32 w-full" />}
          {runs.isError && (
            <Card className="p-6 text-sm text-red-300" role="alert">
              {errorMessage(runs.error, 'Could not load run history.')}
            </Card>
          )}
          {runs.data?.items.length === 0 && <Card className="p-8 text-center text-sm text-slate-400">No runs yet.</Card>}
          <ul className="space-y-2">
            {runs.data?.items.map((r) => (
              <li key={r.id}>
                <button onClick={() => setViewing(r)} className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-navy-800/60 px-4 py-3 text-left transition hover:border-electric/60">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.workflow_name}</span>
                    <span className="block text-xs text-slate-400">
                      {r.lead_name ?? 'deleted lead'} · {r.trigger_source === 'lead_created' ? 'automatic' : 'manual'} · {timeAgo(r.created_at)}
                    </span>
                  </span>
                  <StatusPill status={statusKey(r.status)} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {building && <WorkflowBuilder existing={building === 'new' ? undefined : building} onClose={() => setBuilding(null)} />}
      {running && (
        <RunModal
          workflow={running}
          onClose={() => setRunning(null)}
          onDone={(e) => {
            setRunning(null)
            setViewing(e)
          }}
        />
      )}
      {viewing && <RunDetail initial={viewing} canAct={canRun} onClose={() => setViewing(null)} />}
      <ConfirmDialog
        open={!!deleting}
        title="Delete this workflow?"
        message={`“${deleting?.name}” will be removed. Its run history is kept.`}
        busy={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}