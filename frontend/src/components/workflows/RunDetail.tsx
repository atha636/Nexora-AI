import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RotateCcw, XCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import StatusPill from '../emails/StatusPill'
import { errorMessage, workflowsApi } from '../../lib/api'
import { formatDateTime } from '../../lib/format'
import type { Execution } from '../../lib/types'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { useToast } from '../ui/Toast'
import FlowDiagram from './FlowDiagram'

/** One run: its status, the flow with each step's result, and the actions that make sense for it. */
export default function RunDetail({ initial, canAct, onClose }: { initial: Execution; canAct: boolean; onClose: () => void }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const live = useQuery({
    queryKey: ['workflows', 'run', initial.id],
    queryFn: async () => (await workflowsApi.executions()).items.find((e) => e.id === initial.id) ?? initial,
    initialData: initial,
    refetchInterval: (q) => (q.state.data?.status === 'waiting_approval' ? 5000 : false),
  })
  const ex = live.data

  const refresh = (e: Execution) => {
    queryClient.setQueryData(['workflows', 'run', ex.id], e)
    queryClient.invalidateQueries({ queryKey: ['workflows'] })
    queryClient.invalidateQueries({ queryKey: ['approvals'] })
    queryClient.invalidateQueries({ queryKey: ['emails'] })
  }
  const useAct = (fn: (id: string) => Promise<Execution>, ok: string) =>
    useMutation({ mutationFn: () => fn(ex.id), onSuccess: (e) => (toast.success(ok), refresh(e)), onError: (e) => toast.error(errorMessage(e)) })
  const retry = useAct(workflowsApi.retry, 'Run retried')
  const cancel = useAct(workflowsApi.cancel, 'Run cancelled')
  const start = useAct(workflowsApi.run, 'Run started')
  const busy = retry.isPending || cancel.isPending || start.isPending

  return (
    <Modal open title={ex.workflow_name} onClose={onClose}>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-slate-400">
        <StatusPill status={ex.status === 'waiting_approval' ? 'pending_approval' : ex.status} />
        <span>
          Lead: <span className="text-slate-200">{ex.lead_name ?? 'deleted lead'}</span>
        </span>
        <span>· {ex.trigger_source === 'lead_created' ? 'triggered by a new lead' : 'run manually'}</span>
      </div>

      <FlowDiagram
        trigger={ex.trigger_source === 'lead_created' ? 'lead_created' : 'manual'}
        conditions={ex.definition.conditions}
        actions={ex.definition.actions}
        steps={ex.steps}
        cursor={ex.cursor}
        compact
      />

      {ex.error_message && ex.status !== 'completed' && <p className="mt-3 text-sm text-slate-300">{ex.error_message}</p>}
      <p className="mt-3 text-xs text-slate-500">
        Started {ex.started_at ? formatDateTime(ex.started_at) : 'not yet'} · attempts {ex.attempts} · trace {ex.trace_id.slice(0, 8)}
      </p>

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {ex.status === 'waiting_approval' && (
          <Link to="/approvals" className="self-center text-sm text-electric hover:underline">
            Open Approvals
          </Link>
        )}
        {canAct && ex.status === 'queued' && (
          <Button onClick={() => start.mutate()} disabled={busy}>
            {start.isPending ? 'Running…' : 'Run now'}
          </Button>
        )}
        {canAct && ex.status === 'failed' && (
          <Button onClick={() => retry.mutate()} disabled={busy}>
            <RotateCcw className="h-4 w-4" aria-hidden /> {retry.isPending ? 'Retrying…' : 'Retry from failed step'}
          </Button>
        )}
        {canAct && ['queued', 'waiting_approval', 'failed'].includes(ex.status) && (
          <Button variant="outline" onClick={() => cancel.mutate()} disabled={busy}>
            <XCircle className="h-4 w-4" aria-hidden /> Cancel run
          </Button>
        )}
      </div>
    </Modal>
  )
}