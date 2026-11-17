import { useQuery } from '@tanstack/react-query'
import { Mail } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import DraftEditor from '../components/emails/DraftEditor'
import StatusPill from '../components/emails/StatusPill'
import { Card, Skeleton } from '../components/ui/Card'
import { emailsApi, errorMessage } from '../lib/api'
import { timeAgo } from '../lib/format'
import type { EmailDraft } from '../lib/types'

const FILTERS = [
  { key: '', label: 'All' },
  { key: 'draft', label: 'Drafts' },
  { key: 'pending_approval', label: 'Awaiting approval' },
  { key: 'sent', label: 'Sent' },
  { key: 'failed', label: 'Failed' },
]

export default function Emails() {
  const [filter, setFilter] = useState('')
  const [params, setParams] = useSearchParams()
  const [openId, setOpenId] = useState<string | null>(params.get('open'))
  const drafts = useQuery({ queryKey: ['emails', 'list', filter], queryFn: () => emailsApi.list(filter || undefined) })
  const meta = useQuery({ queryKey: ['emails', 'meta'], queryFn: emailsApi.meta })

  useEffect(() => {
    if (params.get('open')) setParams({}, { replace: true })
  }, [params, setParams])

  const open: EmailDraft | undefined = drafts.data?.items.find((d) => d.id === openId)
  const detail = useQuery({
    queryKey: ['emails', 'one', openId],
    queryFn: async () => (await emailsApi.list()).items.find((d) => d.id === openId),
    enabled: !!openId && !open && drafts.isSuccess,
  })
  const current = open ?? detail.data

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Emails</h1>
        <p className="mt-1 text-sm text-slate-400">
          AI-written drafts. Nothing is sent until a manager approves it.
          {meta.data?.simulated && ' Sending is simulated in this environment.'} Create a draft from a lead's page or ask the AI Assistant.
        </p>
      </div>

      <div role="tablist" aria-label="Filter drafts" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
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

      {drafts.isLoading && (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}
      {drafts.isError && (
        <Card className="p-6 text-sm text-red-300" role="alert">
          {errorMessage(drafts.error, 'Could not load drafts.')}
        </Card>
      )}
      {drafts.data && drafts.data.items.length === 0 && (
        <Card className="grid place-items-center gap-2 p-10 text-center">
          <Mail className="h-8 w-8 text-slate-500" aria-hidden />
          <p className="text-sm text-slate-300">No emails here yet.</p>
          <p className="text-xs text-slate-500">
            Open a lead in the <Link to="/leads" className="text-electric underline">CRM</Link> and choose “Draft email”, or ask the assistant to write follow-ups.
          </p>
        </Card>
      )}
      <ul className="space-y-3">
        {drafts.data?.items.map((d) => (
          <li key={d.id}>
            <button
              onClick={() => setOpenId(d.id)}
              className="w-full rounded-xl border border-line bg-navy-800/60 p-4 text-left transition hover:border-electric/60"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{d.subject}</p>
                <StatusPill status={d.status} />
              </div>
              <p className="mt-1 text-xs text-slate-400">
                To {d.lead_name ?? 'unknown lead'} · {timeAgo(d.created_at)}
              </p>
              <p className="mt-2 line-clamp-2 text-sm text-slate-400">{d.body}</p>
            </button>
          </li>
        ))}
      </ul>

      {current && <DraftEditor key={current.id + current.updated_at} draft={current} simulated={meta.data?.simulated ?? true} onClose={() => setOpenId(null)} />}
    </div>
  )
}