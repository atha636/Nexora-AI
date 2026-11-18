import { ArrowDown, Bolt, CheckCircle2, Clock, Filter, Mail, PenLine, ShieldCheck, XCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { titleCase } from '../../lib/format'
import type { ExecutionStep, WorkflowAction, WorkflowCondition } from '../../lib/types'

const OPS: Record<string, string> = { eq: 'is', neq: 'is not', gte: 'at least', lte: 'at most' }

export function conditionText(c: WorkflowCondition): string {
  const field = c.field.replace(/_/g, ' ')
  if (c.field === 'has_email') return c.value ? 'has an email address' : 'has no email address'
  if (c.field === 'days_since_contact') return `${OPS[c.op]} ${c.value} days since last contact`
  return `${field} ${OPS[c.op]} ${c.value}`
}

export function actionText(a: WorkflowAction): { title: string; detail?: string } {
  if (a.type === 'draft_email') return { title: 'Write an email draft', detail: `${titleCase(a.purpose.replace(/_/g, ' '))} · ${a.tone} tone` }
  if (a.type === 'request_approval') return { title: 'Ask a manager to approve sending', detail: 'Nothing is sent without approval' }
  return {
    title: 'Update the lead',
    detail: [a.status && `status → ${a.status}`, a.priority && `priority → ${a.priority}`].filter(Boolean).join(', '),
  }
}

const ICONS = { draft_email: Mail, request_approval: ShieldCheck, update_lead: PenLine }

function Node({ icon: Icon, tone = 'plain', children }: { icon: typeof Mail; tone?: 'plain' | 'ok' | 'error' | 'waiting' | 'idle'; children: ReactNode }) {
  const ring =
    tone === 'ok' ? 'border-emerald-500/50' : tone === 'error' ? 'border-red-500/50' : tone === 'waiting' ? 'border-amber-500/50' : tone === 'idle' ? 'border-line opacity-60' : 'border-line'
  return (
    <div className={`flex items-start gap-3 rounded-xl border ${ring} bg-navy-900/70 px-3 py-2.5`}>
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand/15 text-brand">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 text-sm">{children}</div>
    </div>
  )
}

const Connector = () => (
  <div className="flex justify-center py-1 text-slate-600" aria-hidden>
    <ArrowDown className="h-4 w-4" />
  </div>
)

/** A top-to-bottom picture of a workflow. With `steps`, it also shows how far a run got. */
export default function FlowDiagram({
  trigger,
  conditions,
  actions,
  steps,
  cursor,
  compact,
}: {
  trigger: 'manual' | 'lead_created'
  conditions: WorkflowCondition[]
  actions: WorkflowAction[]
  steps?: ExecutionStep[]
  cursor?: number
  compact?: boolean
}) {
  const latest = (i: number) => steps?.filter((s) => s.index === i).at(-1)
  return (
    <ol className="space-y-0" aria-label="Workflow steps">
      <li>
        <Node icon={Bolt}>
          <p className="font-medium">{trigger === 'lead_created' ? 'When a new lead is created' : 'Run manually on a lead'}</p>
        </Node>
      </li>
      {conditions.length > 0 && (
        <li>
          <Connector />
          <Node icon={Filter}>
            <p className="font-medium">Only if</p>
            <ul className={`mt-1 space-y-0.5 text-slate-400 ${compact ? 'text-xs' : ''}`}>
              {conditions.map((c, i) => (
                <li key={i}>• {conditionText(c)}</li>
              ))}
            </ul>
          </Node>
        </li>
      )}
      {actions.map((a, i) => {
        const s = latest(i)
        const t = actionText(a)
        const tone = !steps ? 'plain' : s ? (s.status === 'ok' ? 'ok' : s.status === 'error' ? 'error' : 'waiting') : (cursor ?? 0) > i ? 'ok' : 'idle'
        return (
          <li key={i}>
            <Connector />
            <Node icon={ICONS[a.type]} tone={tone}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{t.title}</p>
                  {t.detail && <p className="text-xs text-slate-400">{t.detail}</p>}
                </div>
                {steps && s?.status === 'ok' && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-label="Done" />}
                {steps && s?.status === 'error' && <XCircle className="h-4 w-4 shrink-0 text-red-400" aria-label="Failed" />}
                {steps && s?.status === 'waiting' && <Clock className="h-4 w-4 shrink-0 text-amber-400" aria-label="Waiting" />}
              </div>
              {s && <p className={`mt-1 text-xs ${s.status === 'error' ? 'text-red-300' : 'text-slate-400'}`}>{s.error ?? s.summary}</p>}
            </Node>
          </li>
        )
      })}
    </ol>
  )
}