import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  FileText,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { LeadAcquisitionChart, RevenueChart } from '../charts/Charts'
import AnalyticsResultView from '../analytics/AnalyticsResultView'
import { PriorityBadge, StatusBadge } from '../leads/Badges'
import { formatCurrency, formatCurrencyCompact, formatDate, formatNumber, titleCase } from '../../lib/format'
import type { Block, ChatLead, SourceItem, ToolStep } from '../../lib/types'

const toolLabels: Record<string, string> = {
  search_leads: 'Searched leads',
  create_lead: 'Created a lead',
  update_lead: 'Updated a lead',
  search_documents: 'Searched documents',
  get_sales_summary: 'Checked sales',
  get_lead_analytics: 'Checked lead analytics',
  query_analytics: 'Calculated a business metric',
  draft_email: 'Wrote email drafts',
  request_approval: 'Requested approval',
  get_workflow_status: 'Checked workflows',
}

const stepStyle: Record<ToolStep['status'], { icon: LucideIcon; color: string; label: string }> = {
  ok: { icon: CheckCircle2, color: 'text-emerald-400', label: 'Succeeded' },
  error: { icon: AlertCircle, color: 'text-red-400', label: 'Failed' },
  blocked: { icon: ShieldAlert, color: 'text-amber-300', label: 'Blocked' },
}

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-line bg-navy-900/60 ${className}`}>{children}</div>
}

// ---------------------------------------------------------------- tool activity
export function ActivityTimeline({ tools }: { tools: ToolStep[] }) {
  const problem = tools.some((t) => t.status !== 'ok')
  const [open, setOpen] = useState(problem)
  const totalMs = tools.reduce((sum, t) => sum + t.duration_ms, 0)
  return (
    <div className="text-xs">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-slate-400 hover:text-slate-200"
      >
        <ChevronDown className={`h-3.5 w-3.5 transition ${open ? '' : '-rotate-90'}`} aria-hidden />
        Used {tools.length} tool{tools.length === 1 ? '' : 's'} · {(totalMs / 1000).toFixed(1)}s
      </button>
      {open && (
        <ol className="mt-1.5 space-y-1.5 border-l border-line pl-3" aria-label="Tool activity">
          {tools.map((t, i) => {
            const { icon: Icon, color, label } = stepStyle[t.status]
            return (
              <li key={i} className="flex items-start gap-2">
                <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${color}`} aria-label={label} />
                <div className="min-w-0">
                  <span className="font-medium text-slate-200">{toolLabels[t.name] ?? t.name}</span>
                  <span className="text-slate-500"> · {t.duration_ms} ms</span>
                  {(t.summary || t.error) && (
                    <p className={t.status === 'ok' ? 'text-slate-400' : t.status === 'blocked' ? 'text-amber-200/90' : 'text-red-300/90'}>
                      {t.status === 'ok' ? t.summary : t.error}
                    </p>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- leads
function filterChips(filters: Record<string, string | number>): string[] {
  return Object.entries(filters).map(([k, v]) =>
    k === 'not_contacted_in_days' ? `Not contacted in ${v}+ days` : `${titleCase(k)}: ${v}`,
  )
}

function LeadsBlock({ data }: { data: Extract<Block, { type: 'leads' }>['data'] }) {
  const chips = filterChips(data.filters)
  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <p className="text-sm font-medium">
          {data.total_matching === 0
            ? 'No matching leads'
            : `${data.returned} of ${formatNumber(data.total_matching)} matching lead${data.total_matching === 1 ? '' : 's'}`}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <span key={c} className="rounded-full bg-navy-700 px-2 py-0.5 text-xs text-slate-300">
              {c}
            </span>
          ))}
        </div>
      </div>
      {data.leads.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-2 py-2 font-medium">Company</th>
                <th className="px-2 py-2 font-medium">City</th>
                <th className="px-2 py-2 font-medium">Status</th>
                <th className="px-2 py-2 font-medium">Priority</th>
                <th className="px-4 py-2 font-medium">Last contacted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {data.leads.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-2 font-medium">
                    <Link to={`/leads/${l.id}`} className="text-slate-100 hover:text-electric hover:underline">
                      {l.name}
                    </Link>
                  </td>
                  <td className="px-2 py-2 text-slate-300">{l.company ?? '—'}</td>
                  <td className="px-2 py-2 text-slate-300">{l.city ?? '—'}</td>
                  <td className="px-2 py-2">
                    <StatusBadge status={l.status} />
                  </td>
                  <td className="px-2 py-2">
                    <PriorityBadge priority={l.priority} />
                  </td>
                  <td className="px-4 py-2 text-slate-400">{l.last_contacted_at ? formatDate(l.last_contacted_at) : 'Never'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data.total_matching > data.returned && (
        <div className="border-t border-line px-4 py-2 text-xs text-slate-400">
          {formatNumber(data.total_matching - data.returned)} more not shown.{' '}
          <Link to="/leads" className="text-electric hover:underline">
            Open the CRM
          </Link>
        </div>
      )}
    </Panel>
  )
}

function LeadSavedBlock({ data }: { data: Extract<Block, { type: 'lead_saved' }>['data'] }) {
  const lead: ChatLead = data.lead
  const changes = Object.entries(data.changed ?? {})
  return (
    <Panel className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden />
          {data.created ? 'Lead created' : data.updated ? 'Lead updated' : 'No changes were needed'}
        </p>
        <Link to={`/leads/${lead.id}`} className="text-xs text-electric hover:underline">
          Open {lead.name}
        </Link>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-300">
        <span className="font-medium text-slate-100">{lead.name}</span>
        {lead.company && <span>· {lead.company}</span>}
        {lead.city && <span>· {lead.city}</span>}
        <StatusBadge status={lead.status} />
        <PriorityBadge priority={lead.priority} />
      </div>
      {changes.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-slate-400">
          {changes.map(([field, [before, after]]) => (
            <li key={field}>
              {titleCase(field.replace(/_/g, ' '))}: <span className="line-through">{String(before ?? '—')}</span> →{' '}
              <span className="text-slate-200">{String(after ?? '—')}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

// ---------------------------------------------------------------- analytics
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-navy-800/80 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  )
}

function SalesBlock({ data }: { data: Extract<Block, { type: 'sales_summary' }>['data'] }) {
  return (
    <Panel className="p-4">
      <p className="mb-3 text-sm font-medium">Sales · last {data.months} month{data.months === 1 ? '' : 's'}</p>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Revenue" value={formatCurrencyCompact(data.total_revenue)} />
        <Stat label="Deals" value={formatNumber(data.total_deals)} />
        <Stat label="Avg deal" value={formatCurrencyCompact(data.average_deal)} />
      </div>
      {data.total_revenue > 0 ? (
        <div className="mt-3">
          <RevenueChart data={data.monthly} height={170} />
        </div>
      ) : (
        <p className="mt-3 text-xs text-slate-500">No sales were recorded in this period.</p>
      )}
      {data.top_cities.length > 0 && (
        <p className="mt-2 text-xs text-slate-400">
          Top cities:{' '}
          {data.top_cities
            .slice(0, 3)
            .map((c) => `${c.label} (${formatCurrency(c.revenue)})`)
            .join(', ')}
        </p>
      )}
    </Panel>
  )
}

function LeadAnalyticsBlock({ data }: { data: Extract<Block, { type: 'lead_analytics' }>['data'] }) {
  return (
    <Panel className="p-4">
      <p className="mb-3 text-sm font-medium">Leads · last {data.months} month{data.months === 1 ? '' : 's'}</p>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="New leads" value={formatNumber(data.leads_created_in_period)} />
        <Stat label="Won" value={formatNumber(data.of_which_won_today)} />
        <Stat label="Conversion" value={`${data.conversion_rate_percent}%`} />
      </div>
      {data.leads_created_in_period > 0 && (
        <div className="mt-3">
          <LeadAcquisitionChart data={data.monthly} height={170} />
        </div>
      )}
      {data.all_leads_by_status.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {data.all_leads_by_status.map((s) => (
            <span key={s.label} className="rounded-full bg-navy-700 px-2 py-0.5 text-xs text-slate-300">
              {titleCase(s.label)}: {s.count}
            </span>
          ))}
        </div>
      )}
    </Panel>
  )
}

// ---------------------------------------------------------------- document sources
function SourcesBlock({ sources, messageId }: { sources: SourceItem[]; messageId: string }) {
  const sorted = [...sources].sort((a, b) => Number(b.cited) - Number(a.cited) || a.number - b.number)
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Sources</h3>
      <ol className="mt-2 space-y-2">
        {sorted.map((s) => (
          <li key={s.chunk_id} id={`src-${messageId}-${s.number}`} className={`scroll-mt-24 rounded-xl border bg-navy-900/60 p-3 ${s.cited ? 'border-brand/40' : 'border-line opacity-80'}`}>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="grid h-5 w-5 place-items-center rounded bg-brand/25 font-semibold text-brand">{s.number}</span>
              <FileText className="h-3.5 w-3.5 text-slate-500" aria-hidden />
              <span className="font-medium text-slate-200">{s.filename}</span>
              <span className="text-slate-400">· {s.page_number !== null ? `Page ${s.page_number}` : `Section ${s.chunk_index + 1}`}</span>
              {!s.cited && <span className="text-slate-500">· retrieved, not cited</span>}
              <span className="ml-auto text-slate-500">{Math.round(s.score * 100)}% match</span>
            </div>
            {/* Document text is untrusted: plain text only. */}
            <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-xs text-slate-400">{s.snippet}</p>
          </li>
        ))}
      </ol>
    </div>
  )
}

// ---------------------------------------------------------------- emails and approvals
function EmailDraftsBlock({ data }: { data: Extract<Block, { type: 'email_drafts' }>['data'] }) {
  return (
    <Panel className="p-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        {data.drafts.length} email draft{data.drafts.length === 1 ? '' : 's'} · saved, not sent
      </p>
      <ul className="space-y-2">
        {data.drafts.map((d) => (
          <li key={d.id} className="rounded-lg border border-line p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">{d.subject}</p>
              <Link to={`/emails?open=${d.id}`} className="text-xs text-electric hover:underline">
                Review &amp; edit
              </Link>
            </div>
            <p className="text-xs text-slate-400">To {d.lead_name}</p>
            <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-slate-300">{d.body}</p>
          </li>
        ))}
      </ul>
      {data.skipped.length > 0 && <p className="mt-2 text-xs text-amber-300">Skipped {data.skipped.length}: {data.skipped.map((s) => s.reason).join('; ')}</p>}
    </Panel>
  )
}

function ApprovalsBlock({ data }: { data: Extract<Block, { type: 'approval_requests' }>['data'] }) {
  return (
    <Panel className="p-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        {data.approvals.length} request{data.approvals.length === 1 ? '' : 's'} waiting for approval
      </p>
      <ul className="space-y-1 text-sm">
        {data.approvals.map((a) => (
          <li key={a.id}>
            {a.subject} <span className="text-slate-500">→ {a.to}</span>
          </li>
        ))}
      </ul>
      <Link to="/approvals" className="mt-2 inline-block text-xs text-electric hover:underline">
        Open Approvals
      </Link>
    </Panel>
  )
}

function WorkflowStatusBlock({ data }: { data: Extract<Block, { type: 'workflow_status' }>['data'] }) {
  return (
    <Panel className="p-3">
      <ul className="space-y-2 text-sm">
        {data.workflows.map((w) => (
          <li key={w.id}>
            <p className="font-medium">
              {w.name} <span className="text-xs font-normal text-slate-500">{w.active ? 'active' : 'paused'} · {w.trigger.replace('_', ' ')}</span>
            </p>
            <p className="text-xs text-slate-400">
              {w.recent_runs.length === 0 ? 'No runs yet' : w.recent_runs.map((r) => `${r.lead ?? 'lead'}: ${r.status.replace('_', ' ')}`).join(' · ')}
            </p>
          </li>
        ))}
      </ul>
      <Link to="/workflows" className="mt-2 inline-block text-xs text-electric hover:underline">
        Open Workflows
      </Link>
    </Panel>
  )
}

// ---------------------------------------------------------------- public pieces
export function ActivityBlock({ blocks }: { blocks: Block[] | null }) {
  const activity = blocks?.find((b): b is Extract<Block, { type: 'activity' }> => b.type === 'activity')
  return activity ? <ActivityTimeline tools={activity.tools} /> : null
}

export function ResultBlocks({ blocks, messageId }: { blocks: Block[] | null; messageId: string }) {
  if (!blocks) return null
  return (
    <div className="space-y-3">
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'leads':
            return <LeadsBlock key={i} data={b.data} />
          case 'lead_saved':
            return <LeadSavedBlock key={i} data={b.data} />
          case 'sales_summary':
            return <SalesBlock key={i} data={b.data} />
          case 'lead_analytics':
            return <LeadAnalyticsBlock key={i} data={b.data} />
          case 'analytics_result':
            return <AnalyticsResultView key={i} result={b.data} />
          case 'email_drafts':
            return <EmailDraftsBlock key={i} data={b.data} />
          case 'approval_requests':
            return <ApprovalsBlock key={i} data={b.data} />
          case 'workflow_status':
            return <WorkflowStatusBlock key={i} data={b.data} />
          case 'sources':
            return <SourcesBlock key={i} sources={b.sources} messageId={messageId} />
          default:
            return null
        }
      })}
    </div>
  )
}