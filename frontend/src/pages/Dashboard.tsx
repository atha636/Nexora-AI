import { useQuery } from '@tanstack/react-query'
import { CheckSquare, DollarSign, FileText, GitBranch, Target, Users } from 'lucide-react'
import { Card, Skeleton } from '../components/ui/Card'
import { fetchHealth } from '../lib/api'

// Real numbers arrive in Phase 3 from /dashboard/overview. Until then we show "—"
// rather than fake values, so nothing on screen pretends to be live data.
const kpis = [
  { label: 'Total leads', icon: Users },
  { label: 'Total revenue', icon: DollarSign },
  { label: 'Conversion rate', icon: Target },
  { label: 'Active workflows', icon: GitBranch },
  { label: 'Pending approvals', icon: CheckSquare },
  { label: 'Documents indexed', icon: FileText },
]

function ApiStatus() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    retry: 1,
  })

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-200">System status</h2>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="rounded-md px-2 py-1 text-xs text-electric hover:bg-navy-700 disabled:opacity-50"
        >
          {isFetching ? 'Checking…' : 'Recheck'}
        </button>
      </div>

      {isLoading ? (
        <div className="mt-4 space-y-2" aria-busy="true">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-56" />
          <p className="pt-1 text-xs text-slate-500">
            Connecting to the API (the free-tier server may take up to a minute to wake up)…
          </p>
        </div>
      ) : isError || !data ? (
        <p role="alert" className="mt-4 text-sm text-red-400">
          Can’t reach the backend. Start it with <code>uvicorn app.main:app --reload</code> and
          check <code>VITE_API_URL</code>.
        </p>
      ) : (
        <dl className="mt-4 grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-slate-400">API</dt>
          <dd className={data.status === 'ok' ? 'text-emerald-400' : 'text-amber-400'}>
            {data.status === 'ok' ? 'Healthy' : 'Degraded'}
          </dd>
          <dt className="text-slate-400">Database</dt>
          <dd className={data.database === 'ok' ? 'text-emerald-400' : 'text-red-400'}>
            {data.database === 'ok' ? 'Connected' : 'Unavailable'}
          </dd>
          <dt className="text-slate-400">Version</dt>
          <dd>{data.version}</dd>
          <dt className="text-slate-400">Environment</dt>
          <dd className="capitalize">{data.environment}</dd>
        </dl>
      )}
    </Card>
  )
}

export default function Dashboard() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-400">
          Overview of your business operations. Live metrics arrive in Phase 3.
        </p>
      </div>

      <section aria-label="Key metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {kpis.map(({ label, icon: Icon }) => (
          <Card key={label} className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-400">{label}</p>
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand/15 text-brand">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
            </div>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-500">—</p>
          </Card>
        ))}
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <ApiStatus />
        <Card className="p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-200">Recent activity</h2>
          <p className="mt-6 text-center text-sm text-slate-500">
            No activity yet. Agent runs, CRM updates and approvals will appear here.
          </p>
        </Card>
      </div>
    </div>
  )
}
