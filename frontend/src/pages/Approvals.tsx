import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, ShieldCheck, XCircle } from 'lucide-react'
import { useState } from 'react'
import StatusPill from '../components/emails/StatusPill'
import { Button } from '../components/ui/Button'
import { Card, Skeleton } from '../components/ui/Card'
import { inputClass } from '../components/ui/Field'
import { Modal } from '../components/ui/Modal'
import { useToast } from '../components/ui/Toast'
import { approvalsApi, errorMessage } from '../lib/api'
import { formatDateTime, timeAgo } from '../lib/format'
import type { ApprovalItem } from '../lib/types'

function Details({ a }: { a: ApprovalItem }) {
  const p = a.payload
  return (
    <div className="mt-3 space-y-2 rounded-lg border border-line bg-navy-950/60 p-3 text-sm">
      <p>
        <span className="text-slate-500">To:</span> {p.lead_name} {p.to && <span className="text-slate-400">&lt;{p.to}&gt;</span>}
      </p>
      <p>
        <span className="text-slate-500">Subject:</span> {p.subject}
      </p>
      <p className="whitespace-pre-wrap text-slate-300">{p.body}</p>
    </div>
  )
}

export default function Approvals() {
  const [scope, setScope] = useState<'pending' | 'history'>('pending')
  const [rejecting, setRejecting] = useState<ApprovalItem | null>(null)
  const [note, setNote] = useState('')
  const toast = useToast()
  const queryClient = useQueryClient()
  const list = useQuery({ queryKey: ['approvals', scope], queryFn: () => approvalsApi.list(scope) })

  const done = () => {
    queryClient.invalidateQueries({ queryKey: ['approvals'] })
    queryClient.invalidateQueries({ queryKey: ['emails'] })
    queryClient.invalidateQueries({ queryKey: ['leads'] })
  }
  const approve = useMutation({
    mutationFn: (id: string) => approvalsApi.approve(id),
    onSuccess: (a) => {
      a.status === 'executed' ? toast.success(a.result?.simulated ? 'Approved. Email send simulated.' : 'Approved and sent.') : toast.error(a.error_message ?? 'Approved, but sending failed.')
      done()
    },
    onError: (e) => {
      toast.error(errorMessage(e))
      done()
    },
  })
  const reject = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => approvalsApi.reject(id, note.trim() || undefined),
    onSuccess: () => {
      toast.success('Request rejected')
      setRejecting(null)
      setNote('')
      done()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const cancel = useMutation({
    mutationFn: (id: string) => approvalsApi.cancel(id),
    onSuccess: () => {
      toast.success('Request cancelled')
      done()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const busy = approve.isPending || reject.isPending || cancel.isPending

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Approvals</h1>
        <p className="mt-1 text-sm text-slate-400">Sensitive actions wait here for a person to decide. Nothing runs before approval.</p>
      </div>

      <div role="tablist" aria-label="Approval lists" className="flex gap-2">
        {(['pending', 'history'] as const).map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={scope === s}
            onClick={() => setScope(s)}
            className={`rounded-full border px-3 py-1 text-xs transition ${scope === s ? 'border-electric bg-electric/10 text-white' : 'border-line text-slate-400 hover:bg-navy-700'}`}
          >
            {s === 'pending' ? `Pending${list.data ? ` (${list.data.pending})` : ''}` : 'History'}
          </button>
        ))}
      </div>

      {list.isLoading && <Skeleton className="h-32 w-full" />}
      {list.isError && (
        <Card className="p-6 text-sm text-red-300" role="alert">
          {errorMessage(list.error, 'Could not load approvals.')}
        </Card>
      )}
      {list.data && list.data.items.length === 0 && (
        <Card className="grid place-items-center gap-2 p-10 text-center">
          <ShieldCheck className="h-8 w-8 text-slate-500" aria-hidden />
          <p className="text-sm text-slate-300">{scope === 'pending' ? 'Nothing is waiting for approval.' : 'No past decisions yet.'}</p>
        </Card>
      )}

      <ul className="space-y-3">
        {list.data?.items.map((a) => (
          <li key={a.id}>
            <Card className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{a.title}</p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    Requested by {a.requested_by_name ?? 'someone'}
                    {a.requested_via === 'ai_agent' && ' via the AI assistant'} · {timeAgo(a.created_at)}
                  </p>
                </div>
                <StatusPill status={a.status} />
              </div>
              <Details a={a} />
              {a.decided_at && a.status !== 'pending' && (
                <p className="mt-2 text-xs text-slate-400">
                  {a.status === 'cancelled' ? 'Cancelled' : 'Decided'} by {a.decided_by_name ?? 'someone'} on {formatDateTime(a.decided_at)}
                  {a.decision_note && ` — “${a.decision_note}”`}
                  {a.status === 'executed' && a.result?.simulated && ' · simulated send (no real email)'}
                </p>
              )}
              {a.error_message && <p className="mt-2 text-xs text-red-300">{a.error_message}</p>}
              {a.status === 'pending' && (
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  {a.can_cancel && (
                    <Button variant="ghost" onClick={() => cancel.mutate(a.id)} disabled={busy}>
                      Cancel request
                    </Button>
                  )}
                  {a.can_decide ? (
                    <>
                      <Button variant="outline" onClick={() => setRejecting(a)} disabled={busy}>
                        <XCircle className="h-4 w-4" aria-hidden /> Reject
                      </Button>
                      <Button onClick={() => approve.mutate(a.id)} disabled={busy}>
                        <CheckCircle2 className="h-4 w-4" aria-hidden /> Approve &amp; send
                      </Button>
                    </>
                  ) : (
                    <p className="self-center text-xs text-slate-500">Waiting for a manager or admin (you can't approve your own request unless you are an admin).</p>
                  )}
                </div>
              )}
            </Card>
          </li>
        ))}
      </ul>

      <Modal open={!!rejecting} title="Reject this request" onClose={() => setRejecting(null)}>
        <label htmlFor="reject-note" className="mb-1 block text-sm font-medium text-slate-300">
          Reason (optional)
        </label>
        <textarea id="reject-note" rows={3} maxLength={500} className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setRejecting(null)} disabled={reject.isPending}>
            Back
          </Button>
          <Button variant="danger" onClick={() => rejecting && reject.mutate({ id: rejecting.id, note })} disabled={reject.isPending}>
            Reject
          </Button>
        </div>
      </Modal>
    </div>
  )
}