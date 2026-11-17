import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react'
import { useState } from 'react'
import { emailsApi, errorMessage } from '../../lib/api'
import { titleCase } from '../../lib/format'
import type { EmailDraft } from '../../lib/types'
import { Button } from '../ui/Button'
import { SelectField } from '../ui/Field'
import { Modal } from '../ui/Modal'
import { inputClass } from '../ui/Field'

const nice = (s: string) => titleCase(s.replace(/_/g, ' '))

/** Asks the AI to write an email draft for one lead. Nothing is sent. */
export default function GenerateEmailModal({
  open,
  leadId,
  leadName,
  hasEmail,
  onClose,
  onCreated,
}: {
  open: boolean
  leadId: string
  leadName: string
  hasEmail: boolean
  onClose: () => void
  onCreated: (draft: EmailDraft) => void
}) {
  const queryClient = useQueryClient()
  const meta = useQuery({ queryKey: ['emails', 'meta'], queryFn: emailsApi.meta, enabled: open })
  const [tone, setTone] = useState('friendly')
  const [purpose, setPurpose] = useState('follow_up')
  const [instructions, setInstructions] = useState('')

  const create = useMutation({
    mutationFn: () => emailsApi.create({ lead_id: leadId, tone, purpose, instructions: instructions.trim() || undefined }),
    onSuccess: (draft) => {
      queryClient.invalidateQueries({ queryKey: ['emails'] })
      onCreated(draft)
    },
  })

  return (
    <Modal open={open} title={`Draft an email to ${leadName}`} onClose={onClose}>
      {!hasEmail && (
        <p role="alert" className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          This lead has no email address yet. You can write a draft, but it can't be sent until you add one.
        </p>
      )}
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          create.mutate()
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label="Purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)}>
            {(meta.data?.purposes ?? ['follow_up']).map((p) => (
              <option key={p} value={p}>
                {nice(p)}
              </option>
            ))}
          </SelectField>
          <SelectField label="Tone" value={tone} onChange={(e) => setTone(e.target.value)}>
            {(meta.data?.tones ?? ['friendly']).map((t) => (
              <option key={t} value={t}>
                {nice(t)}
              </option>
            ))}
          </SelectField>
        </div>
        <div>
          <label htmlFor="extra" className="mb-1 block text-sm font-medium text-slate-300">
            Extra instructions (optional)
          </label>
          <textarea
            id="extra"
            rows={2}
            maxLength={300}
            className={inputClass}
            placeholder="e.g. Mention that we can set up a demo next week"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
          />
        </div>
        <p className="text-xs text-slate-500">The AI writes a draft for you to review and edit. Nothing is sent until a manager approves it.</p>
        {create.isError && (
          <p role="alert" className="text-sm text-red-400">
            {errorMessage(create.error, 'Could not write the draft.')}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={create.isPending}>
            <Sparkles className="h-4 w-4" aria-hidden />
            {create.isPending ? 'Writing…' : 'Write draft'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}