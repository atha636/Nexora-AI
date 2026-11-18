import { useQuery } from '@tanstack/react-query'
import { Sunrise } from 'lucide-react'
import { Link } from 'react-router-dom'
import { analyticsApi } from '../../lib/api'
import { Card, Skeleton } from '../ui/Card'

const TONE = { good: 'text-emerald-300', warn: 'text-amber-300', neutral: 'text-slate-100' }

/** Today's briefing: what needs attention, straight from the database (no AI involved). */
export default function BriefingCard() {
  const q = useQuery({ queryKey: ['briefing'], queryFn: analyticsApi.briefing, staleTime: 60_000 })
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <Sunrise className="h-4 w-4 text-electric" aria-hidden />
        <h2 className="font-medium">Today&apos;s briefing</h2>
      </div>
      {q.isLoading && <Skeleton className="mt-3 h-20 w-full" />}
      {q.isError && <p className="mt-3 text-sm text-slate-500">The briefing could not be loaded.</p>}
      {q.data && (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {q.data.items.map((i) => (
            <li key={i.key}>
              <Link to={i.href} className="block rounded-lg border border-line p-3 transition hover:border-electric/60">
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