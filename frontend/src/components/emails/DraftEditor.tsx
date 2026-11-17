import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Send, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { emailsApi, errorMessage } from '../../lib/api'
import type { EmailDraft } from '../../lib/types'
import { Button } from '../ui/Button'
import { TextField, inputClass } from '../ui/Field'
import { Modal } from '../ui/Modal'
import { useToast } from '../ui/Toast'
import StatusPill from './StatusPill'

/** Review, edit and submit one draft. Drafts waiting for approval, or already sent, are read-only. */
export default function DraftEditor({ draft, simulated, onClose }: { draft: EmailDraft; simulated: boolean; onClose: () => void }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [subject, setSubject] = useState(draft.subject)
  const [body, setBody] = useState(draft.body)
  const editable = draft.status === 'draft' || draft.status === 'failed'
  const dirty = subject !== draft.subject || body !== draft.body

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['emails'] })
    queryClient.invalidateQueries({ queryKey: ['approvals'] })
  }
  const save = useMutation({
    mutationFn: () => emailsApi.update(draft.id, { subject, body }),
    onSuccess: () => {
      toast.success('Draft saved')
      refresh()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const submit = useMutation({
    mutationFn: async () => {
      if (dirty) await emailsApi.update(draft.id, { subject, body }) // approve what you can see
      return emailsApi.requestApproval(draft.id)
    },
    onSuccess: () => {
      toast.success('Sent for approval')
      refresh()
      onClose()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const discard = useMutation({
    mutationFn: () => emailsApi.remove(draft.id),
    onSuccess: () => {
      toast.success('Draft discarded')
      refresh()
      onClose()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const busy = save.isPending || submit.isPending || discard.isPending

  return (
    <Modal open title="Email draft" onClose={onClose}>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-slate-400">
        <StatusPill status={draft.status} />
        <span>
          To: <span className="text-slate-200">{draft.lead_name ?? 'Unknown lead'}</span>
          {draft.to_email ? ` <${draft.to_email}>` : ' (no email address)'}
        </span>
      </div>
      <div className="space-y-3">
        <TextField label="Subject" value={subject} maxLength={200} disabled={!editable} onChange={(e) => setSubject(e.target.value)} />
        <div>
          <label htmlFor="draft-body" className="mb-1 block text-sm font-medium text-slate-300">
            Message
          </label>
          <textarea
            id="draft-body"
            rows={10}
            maxLength={5000}
            disabled={!editable}
            className={`${inputClass} leading-relaxed`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>
      </div>
      {draft.status === 'pending_approval' && <p className="mt-3 text-xs text-amber-300">Waiting for a manager's decision. It can't be edited meanwhile, so what is approved is exactly what is sent.</p>}
      {editable && (
        <p className="mt-3 text-xs text-slate-500">
          {simulated ? 'Email sending is simulated in this environment: approving records the send but no real email leaves the system.' : 'Approving sends a real email.'}
        </p>
      )}
      {editable && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" onClick={() => discard.mutate()} disabled={busy} className="text-red-300">
            <Trash2 className="h-4 w-4" aria-hidden /> Discard
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => save.mutate()} disabled={busy || !dirty}>
              Save
            </Button>
            <Button onClick={() => submit.mutate()} disabled={busy || !subject.trim() || !body.trim() || !draft.to_email}>
              <Send className="h-4 w-4" aria-hidden /> {submit.isPending ? 'Submitting…' : 'Request approval'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}