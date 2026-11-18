import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { errorMessage, workflowsApi } from '../../lib/api'
import { titleCase } from '../../lib/format'
import type { Workflow, WorkflowAction, WorkflowCondition, WorkflowDefinition } from '../../lib/types'
import { Button } from '../ui/Button'
import { SelectField, TextField } from '../ui/Field'
import { Modal } from '../ui/Modal'
import { useToast } from '../ui/Toast'
import FlowDiagram from './FlowDiagram'

const TONES = ['friendly', 'professional', 'formal', 'casual', 'urgent']
const PURPOSES = ['follow_up', 'introduction', 'meeting_request', 'proposal_follow_up', 'thank_you', 're_engage']
const FIELDS: { key: WorkflowCondition['field']; label: string }[] = [
  { key: 'priority', label: 'Priority' },
  { key: 'status', label: 'Status' },
  { key: 'city', label: 'City' },
  { key: 'source', label: 'Source' },
  { key: 'days_since_contact', label: 'Days since contact' },
  { key: 'has_email', label: 'Has email' },
]
const nice = (s: string) => titleCase(s.replace(/_/g, ' '))

function defaultCondition(field: WorkflowCondition['field']): WorkflowCondition {
  switch (field) {
    case 'priority':
      return { field, op: 'eq', value: 'high' }
    case 'status':
      return { field, op: 'eq', value: 'new' }
    case 'days_since_contact':
      return { field, op: 'gte', value: 7 }
    case 'has_email':
      return { field, op: 'eq', value: true }
    default:
      return { field, op: 'eq', value: '' }
  }
}

function ConditionRow({ c, onChange, onRemove }: { c: WorkflowCondition; onChange: (c: WorkflowCondition) => void; onRemove: () => void }) {
  const small = 'rounded-lg border border-line bg-navy-950 px-2 py-2 text-sm text-slate-100 focus:border-electric focus:outline-none'
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="Condition field" className={small} value={c.field} onChange={(e) => onChange(defaultCondition(e.target.value as WorkflowCondition['field']))}>
        {FIELDS.map((f) => (
          <option key={f.key} value={f.key}>
            {f.label}
          </option>
        ))}
      </select>
      {c.field === 'days_since_contact' ? (
        <>
          <select aria-label="Operator" className={small} value={c.op} onChange={(e) => onChange({ ...c, op: e.target.value as 'gte' | 'lte' })}>
            <option value="gte">at least</option>
            <option value="lte">at most</option>
          </select>
          <input aria-label="Days" type="number" min={0} max={3650} className={`${small} w-24`} value={Number(c.value)} onChange={(e) => onChange({ ...c, value: Number(e.target.value) })} />
        </>
      ) : c.field === 'has_email' ? (
        <select aria-label="Value" className={small} value={String(c.value)} onChange={(e) => onChange({ ...c, value: e.target.value === 'true' })}>
          <option value="true">yes</option>
          <option value="false">no</option>
        </select>
      ) : (
        <>
          <select aria-label="Operator" className={small} value={c.op} onChange={(e) => onChange({ ...c, op: e.target.value as 'eq' | 'neq' })}>
            <option value="eq">is</option>
            <option value="neq">is not</option>
          </select>
          {c.field === 'priority' || c.field === 'status' ? (
            <select aria-label="Value" className={small} value={String(c.value)} onChange={(e) => onChange({ ...c, value: e.target.value })}>
              {(c.field === 'priority' ? ['low', 'medium', 'high'] : ['new', 'contacted', 'qualified', 'won', 'lost']).map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          ) : (
            <input aria-label="Value" maxLength={80} className={`${small} w-40`} value={String(c.value)} onChange={(e) => onChange({ ...c, value: e.target.value })} placeholder={c.field === 'city' ? 'e.g. Delhi' : 'e.g. Website'} />
          )}
        </>
      )}
      <button type="button" aria-label="Remove condition" onClick={onRemove} className="rounded-md p-1.5 text-slate-400 hover:text-red-300">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}

function ActionCard({ a, i, count, onChange, onMove, onRemove }: { a: WorkflowAction; i: number; count: number; onChange: (a: WorkflowAction) => void; onMove: (d: -1 | 1) => void; onRemove: () => void }) {
  return (
    <div className="rounded-xl border border-line p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">
          {i + 1}. {a.type === 'draft_email' ? 'Write an email draft' : a.type === 'request_approval' ? 'Ask for approval to send' : 'Update the lead'}
        </p>
        <div className="flex">
          <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => onMove(-1)} className="rounded-md p-1.5 text-slate-400 hover:text-white disabled:opacity-30">
            <ArrowUp className="h-4 w-4" />
          </button>
          <button type="button" aria-label="Move down" disabled={i === count - 1} onClick={() => onMove(1)} className="rounded-md p-1.5 text-slate-400 hover:text-white disabled:opacity-30">
            <ArrowDown className="h-4 w-4" />
          </button>
          <button type="button" aria-label="Remove step" onClick={onRemove} className="rounded-md p-1.5 text-slate-400 hover:text-red-300">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      {a.type === 'draft_email' && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <SelectField label="Purpose" value={a.purpose} onChange={(e) => onChange({ ...a, purpose: e.target.value })}>
            {PURPOSES.map((p) => (
              <option key={p} value={p}>
                {nice(p)}
              </option>
            ))}
          </SelectField>
          <SelectField label="Tone" value={a.tone} onChange={(e) => onChange({ ...a, tone: e.target.value })}>
            {TONES.map((t) => (
              <option key={t} value={t}>
                {nice(t)}
              </option>
            ))}
          </SelectField>
        </div>
      )}
      {a.type === 'request_approval' && <p className="mt-1 text-xs text-slate-400">Sends the draft above to a manager. The run then waits for their decision. This must be the last step.</p>}
      {a.type === 'update_lead' && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <SelectField label="Set status" value={a.status ?? ''} onChange={(e) => onChange({ ...a, status: (e.target.value || undefined) as never })}>
            <option value="">(no change)</option>
            {['new', 'contacted', 'qualified', 'won', 'lost'].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </SelectField>
          <SelectField label="Set priority" value={a.priority ?? ''} onChange={(e) => onChange({ ...a, priority: (e.target.value || undefined) as never })}>
            <option value="">(no change)</option>
            {['low', 'medium', 'high'].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </SelectField>
        </div>
      )}
    </div>
  )
}

export default function WorkflowBuilder({ existing, onClose }: { existing?: Workflow; onClose: () => void }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [def, setDef] = useState<WorkflowDefinition>(
    existing ?? {
      name: '',
      description: null,
      trigger_type: 'manual',
      conditions: [{ field: 'priority', op: 'eq', value: 'high' }],
      actions: [{ type: 'draft_email', tone: 'friendly', purpose: 'follow_up' }, { type: 'request_approval' }],
      is_active: true,
    },
  )
  const set = (patch: Partial<WorkflowDefinition>) => setDef((d) => ({ ...d, ...patch }))

  const save = useMutation({
    mutationFn: () => {
      const body = { ...def, description: def.description?.trim() || null, name: def.name.trim() }
      return existing ? workflowsApi.update(existing.id, body) : workflowsApi.create(body)
    },
    onSuccess: () => {
      toast.success(existing ? 'Workflow saved' : 'Workflow created')
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
      onClose()
    },
  })

  const moveAction = (i: number, d: -1 | 1) =>
    setDef((cur) => {
      const a = [...cur.actions]
      ;[a[i], a[i + d]] = [a[i + d], a[i]]
      return { ...cur, actions: a }
    })

  return (
    <Modal open title={existing ? 'Edit workflow' : 'New workflow'} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <TextField label="Name" required maxLength={120} value={def.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. High-priority follow-up" />
        <TextField label="Description (optional)" maxLength={500} value={def.description ?? ''} onChange={(e) => set({ description: e.target.value })} />
        <SelectField label="Trigger" value={def.trigger_type} onChange={(e) => set({ trigger_type: e.target.value as 'manual' | 'lead_created' })}>
          <option value="manual">Run manually on a lead</option>
          <option value="lead_created">When a new lead is created</option>
        </SelectField>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-300">Only if (all must be true)</legend>
          {def.conditions.length === 0 && <p className="text-xs text-slate-500">No conditions: runs for every lead.</p>}
          {def.conditions.map((c, i) => (
            <ConditionRow key={i} c={c} onChange={(n) => set({ conditions: def.conditions.map((x, j) => (j === i ? n : x)) })} onRemove={() => set({ conditions: def.conditions.filter((_, j) => j !== i) })} />
          ))}
          {def.conditions.length < 6 && (
            <Button type="button" variant="ghost" onClick={() => set({ conditions: [...def.conditions, defaultCondition('city')] })}>
              <Plus className="h-4 w-4" aria-hidden /> Add condition
            </Button>
          )}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-300">Then do (in order)</legend>
          {def.actions.map((a, i) => (
            <ActionCard key={i} a={a} i={i} count={def.actions.length} onChange={(n) => set({ actions: def.actions.map((x, j) => (j === i ? n : x)) })} onMove={(d) => moveAction(i, d)} onRemove={() => set({ actions: def.actions.filter((_, j) => j !== i) })} />
          ))}
          {def.actions.length < 6 && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => set({ actions: [...def.actions, { type: 'draft_email', tone: 'friendly', purpose: 'follow_up' }] })}>
                <Plus className="h-4 w-4" aria-hidden /> Email draft
              </Button>
              <Button type="button" variant="outline" onClick={() => set({ actions: [...def.actions, { type: 'request_approval' }] })}>
                <Plus className="h-4 w-4" aria-hidden /> Ask for approval
              </Button>
              <Button type="button" variant="outline" onClick={() => set({ actions: [...def.actions, { type: 'update_lead', status: 'contacted' }] })}>
                <Plus className="h-4 w-4" aria-hidden /> Update lead
              </Button>
            </div>
          )}
        </fieldset>

        <div>
          <p className="mb-2 text-sm font-medium text-slate-300">Preview</p>
          <FlowDiagram trigger={def.trigger_type} conditions={def.conditions} actions={def.actions} compact />
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={def.is_active} onChange={(e) => set({ is_active: e.target.checked })} /> Active
        </label>
        <p className="text-xs text-slate-500">Workflows can write drafts and ask for approval, but never send an email on their own.</p>
        {save.isError && (
          <p role="alert" className="text-sm text-red-400">
            {errorMessage(save.error, 'Could not save the workflow.')}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending || !def.name.trim() || def.actions.length === 0}>
            {save.isPending ? 'Saving…' : 'Save workflow'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}