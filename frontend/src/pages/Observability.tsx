import { useQuery } from '@tanstack/react-query'
import { Activity, AlertTriangle, Clock, Coins, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { Card, Skeleton } from '../components/ui/Card'
import { inputClass } from '../components/ui/Field'
import { Modal } from '../components/ui/Modal'
import StatusPill from '../components/emails/StatusPill'
import { errorMessage, observabilityApi } from '../lib/api'
import { formatDateTime, formatNumber, timeAgo } from '../lib/format'

const ms = (n: number | null | undefined) => (n == null ? '—' : n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${n}ms`)

const toolColor: Record<string, string> = { ok: 'bg-emerald-400', error: 'bg-red-400', blocked: 'bg-amber-400' }

function Stat({ icon: Icon, label, value, hint }: { icon: typeof Activity; label: string; value: string; hint?: string }) {
  return (
    <Card>
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Icon className="h-4 w-4" aria-hidden /> {label}
      </div>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </Card>
  )
}

function TraceModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const q = useQuery({ queryKey: ['trace', id], queryFn: () => observabilityApi.trace(id!), enabled: !!id })
  const total = Math.max(q.data?.run.duration_ms ?? 0, 1)
  return (
    <Modal open={!!id} title="Run trace" onClose={onClose}>
      {q.isLoading && <Skeleton className="h-40 w-full" />}
      {q.isError && <p role="alert" className="text-sm text-red-300">{errorMessage(q.error)}</p>}
      {q.data && (
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-400">
            <StatusPill status={q.data.run.status} />
            <span>Trace <code className="text-slate-200">{q.data.run.trace_id}</code></span>
            <span>{ms(q.data.run.duration_ms)}</span>
            <span>
              {formatNumber(q.data.prompt_tokens ?? 0)} in / {formatNumber(q.data.completion_tokens ?? 0)} out tokens
            </span>
          </div>
          {q.data.run.error_message && (
            <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-red-300">{q.data.run.error_message}</p>
          )}
          {q.data.timeline.length === 0 ? (
            <p className="text-slate-500">This run did not call any tools.</p>
          ) : (
            <ol className="space-y-2">
              {q.data.timeline.map((t) => (
                <li key={t.sequence} className="rounded-lg border border-line p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{t.sequence}. {t.tool_name}</span>
                    <span className="text-xs text-slate-400">+{ms(t.offset_ms)} · {ms(t.duration_ms)}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-navy-700" aria-hidden>
                    <div
                      className={`h-full ${toolColor[t.status] ?? 'bg-slate-400'}`}
                      style={{ marginLeft: `${(t.offset_ms / total) * 100}%`, width: `${Math.max((t.duration_ms / total) * 100, 2)}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-slate-400">
                    {t.status === 'ok' ? t.summary : <span className={t.status === 'blocked' ? 'text-amber-300' : 'text-red-300'}>{t.status}: {t.error_message}</span>}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </Modal>
  )
}

export default function Observability() {
  const [filter, setFilter] = useState('')
  const [traceId, setTraceId] = useState<string | null>(null)
  const stats = useQuery({ queryKey: ['obs', 'stats'], queryFn: () => observabilityApi.stats(7) })
  const runs = useQuery({ queryKey: ['obs', 'runs', filter], queryFn: () => observabilityApi.runs(filter || undefined) })
  const activity = useQuery({ queryKey: ['obs', 'activity'], queryFn: () => observabilityApi.activity() })
  const s = stats.data

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Observability</h1>
        <p className="text-sm text-slate-400">What the AI did, how long it took, and what went wrong. Last 7 days.</p>
      </div>

      {stats.isError ? (
        <p role="alert" className="text-sm text-red-300">{errorMessage(stats.error)}</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {!s ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)
          ) : (
            <>
              <Stat icon={Activity} label="Agent runs" value={formatNumber(s.runs)} hint={`${s.tool_calls} tool calls`} />
              <Stat icon={AlertTriangle} label="Failure rate" value={`${(s.failure_rate * 100).toFixed(1)}%`} hint={`${s.failed} failed · ${s.tool_errors} tool errors`} />
              <Stat icon={Clock} label="Latency" value={ms(s.avg_duration_ms)} hint={`p95 ${ms(s.p95_duration_ms)}`} />
              <Stat icon={Coins} label="Tokens" value={formatNumber(s.total_tokens)} hint={`${s.blocked_tool_calls} calls blocked by guards`} />
            </>
          )}
        </div>
      )}

      {s && s.by_tool.length > 0 && (
        <Card>
          <h2 className="mb-3 font-medium">Tools</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-slate-500">
                <tr><th className="pb-2">Tool</th><th>Calls</th><th>Errors</th><th>Blocked</th><th>Avg time</th></tr>
              </thead>
              <tbody>
                {s.by_tool.map((t) => (
                  <tr key={t.tool} className="border-t border-line">
                    <td className="py-2 font-mono text-xs">{t.tool}</td><td>{t.calls}</td><td>{t.errors}</td><td>{t.blocked}</td><td>{ms(t.avg_ms)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-medium">Agent runs</h2>
          <select aria-label="Filter by status" className={`${inputClass} w-auto`} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="running">Running</option>
          </select>
        </div>
        {runs.isLoading && <Skeleton className="h-32 w-full" />}
        {runs.isError && <p role="alert" className="text-sm text-red-300">{errorMessage(runs.error)}</p>}
        {runs.data && runs.data.items.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No runs yet. Ask the AI assistant something.</p>}
        {runs.data && runs.data.items.length > 0 && (
          <ul className="divide-y divide-line">
            {runs.data.items.map((r) => (
              <li key={r.id}>
                <button onClick={() => setTraceId(r.id)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 py-3 text-left text-sm hover:bg-navy-700/40">
                  <StatusPill status={r.status} />
                  <span className="text-slate-300">{r.user_name ?? 'Unknown'}</span>
                  <span className="text-slate-500">{r.tool_call_count} tools · {ms(r.duration_ms)}</span>
                  <span className="ml-auto text-xs text-slate-500">{timeAgo(r.started_at)}</span>
                  {r.error_message && <span className="w-full truncate text-xs text-red-300">{r.error_message}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 flex items-center gap-2 font-medium"><ShieldAlert className="h-4 w-4" aria-hidden /> Audit log</h2>
        {activity.isLoading && <Skeleton className="h-32 w-full" />}
        {activity.isError && <p role="alert" className="text-sm text-red-300">{errorMessage(activity.error)}</p>}
        {activity.data && activity.data.items.length === 0 && <p className="text-sm text-slate-500">Nothing recorded yet.</p>}
        <ul className="divide-y divide-line text-sm">
          {activity.data?.items.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-x-3 py-2">
              <code className="text-xs text-electric">{a.action}</code>
              <span className="text-slate-400">{a.actor_name ?? 'system'}</span>
              <span className="ml-auto text-xs text-slate-500" title={formatDateTime(a.created_at)}>{timeAgo(a.created_at)}</span>
            </li>
          ))}
        </ul>
      </Card>

      <TraceModal id={traceId} onClose={() => setTraceId(null)} />
    </div>
  )
}