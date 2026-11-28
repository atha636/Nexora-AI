import { useMutation, useQuery } from '@tanstack/react-query'
import { Sparkles, Sunrise } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useT } from '../../i18n'
import { analyticsApi, errorMessage } from '../../lib/api'
import { Button } from '../ui/Button'
import { Card, Skeleton } from '../ui/Card'

const TONE = { good: 'text-emerald-300', warn: 'text-amber-300', neutral: 'text-slate-100' }

/** Today's briefing: the figures come straight from the database; the AI summary is optional and only rephrases them. */
export default function BriefingCard() {
  const { t, lang } = useT()
  const q = useQuery({ queryKey: ['briefing', lang], queryFn: analyticsApi.briefing, staleTime: 60_000 })
  const summary = useMutation({ mutationFn: analyticsApi.briefingSummary })
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sunrise className="h-4 w-4 text-electric" aria-hidden />
          <h2 className="font-medium">{t('brief.title')}</h2>
        </div>
        {q.data && (
          <Button variant="outline" className="!py-1.5 !text-xs" disabled={summary.isPending} onClick={() => summary.mutate()}>
            <Sparkles className="h-3.5 w-3.5" aria-hidden /> {summary.isPending ? t('brief.writing') : summary.data ? t('brief.again') : t('brief.summarize')}
          </Button>
        )}
      </div>
      {q.isLoading && <Skeleton className="mt-3 h-20 w-full" />}
      {q.isError && <p className="mt-3 text-sm text-slate-500">{t('brief.loadError')}</p>}
      {summary.data && (
        <div className="mt-3 rounded-lg border border-brand/30 bg-brand/10 p-3 text-sm" role="status">
          <p className="break-words">{summary.data.summary}</p>
          <p className="mt-1.5 text-xs text-slate-500">
            {summary.data.ai ? t('brief.byAi') : t('brief.plain')}
          </p>
        </div>
      )}
      {summary.isError && (
        <p role="alert" className="mt-3 text-sm text-red-400">
          {errorMessage(summary.error, t('brief.summaryError'))}
        </p>
      )}
      {q.data && (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          {q.data.items.map((i) => (
            <li key={i.key}>
              <Link to={i.href} className="block h-full rounded-lg border border-line p-3 transition hover:border-electric/60">
                <p className="text-xs text-slate-400">{i.title}</p>
                <p className={`mt-1 text-2xl font-semibold tracking-tight ${TONE[i.tone]}`}>{i.value}</p>
                <p className="mt-1 text-xs text-slate-500">{i.detail}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}