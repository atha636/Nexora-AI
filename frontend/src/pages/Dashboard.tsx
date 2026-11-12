import { useQuery } from '@tanstack/react-query'
import {
  CheckSquare,
  DollarSign,
  FileText,
  GitBranch,
  Target,
  Users,
  type LucideIcon,
} from 'lucide-react'
import ChartCard from '../components/charts/ChartCard'
import {
  CityChart,
  ConversionChart,
  LeadAcquisitionChart,
  RevenueChart,
  SalesPerformanceChart,
} from '../components/charts/Charts'
import { Card, Skeleton } from '../components/ui/Card'
import { analyticsApi, errorMessage, fetchHealth } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatCurrency, formatNumber, timeAgo } from '../lib/format'
import type { Kpis } from '../lib/types'

const kpiCards: { label: string; icon: LucideIcon; value: (k: Kpis) => string; hint?: (k: Kpis) => string }[] = [
  { label: 'Total leads', icon: Users, value: (k) => formatNumber(k.total_leads), hint: (k) => `${k.won_leads} won` },
  { label: 'Total revenue', icon: DollarSign, value: (k) => formatCurrency(k.total_revenue) },
  {
    label: 'Conversion rate',
    icon: Target,
    value: (k) => `${k.conversion_rate}%`,
    hint: (k) => `${k.won_leads} of ${k.total_leads} leads`,
  },
  { label: 'Active workflows', icon: GitBranch, value: (k) => formatNumber(k.active_workflows), hint: () => 'Coming in Phase 9' },
  { label: 'Pending approvals', icon: CheckSquare, value: (k) => formatNumber(k.pending_approvals), hint: () => 'Coming in Phase 8' },
  { label: 'Documents indexed', icon: FileText, value: (k) => formatNumber(k.documents_indexed), hint: () => 'Ready for search' },
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
          Can’t reach the backend. Start it with <code>uvicorn app.main:app --reload</code> and check{' '}
          <code>VITE_API_URL</code>.
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
        </dl>
      )}
    </Card>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const overview = useQuery({ queryKey: ['dashboard'], queryFn: analyticsApi.dashboard })
  const d = overview.data
  const state = { isLoading: overview.isLoading, error: overview.error, onRetry: () => overview.refetch() }

  const noRevenue = !d || d.monthly_revenue.every((m) => m.revenue === 0)
  const noLeads = !d || d.lead_acquisition.every((m) => m.created === 0)

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back, {user?.full_name.split(' ')[0]}</h1>
        <p className="mt-1 text-sm text-slate-400">Live overview of {user?.organization.name}.</p>
      </div>

      <section aria-label="Key metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {kpiCards.map(({ label, icon: Icon, value, hint }) => (
          <Card key={label} className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-400">{label}</p>
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand/15 text-brand">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
            </div>
            {d ? (
              <>
                <p className="mt-3 text-3xl font-semibold tracking-tight">{value(d.kpis)}</p>
                {hint && <p className="mt-1 text-xs text-slate-500">{hint(d.kpis)}</p>}
              </>
            ) : overview.isError ? (
              <p className="mt-3 text-3xl font-semibold text-slate-600">—</p>
            ) : (
              <Skeleton className="mt-3 h-9 w-32" />
            )}
          </Card>
        ))}
      </section>

      {overview.isError && (
        <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {errorMessage(overview.error, 'Could not load dashboard data.')}{' '}
          <button className="underline" onClick={() => overview.refetch()}>
            Retry
          </button>
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Monthly revenue" subtitle="Last 12 months" {...state} isEmpty={noRevenue} emptyMessage="No sales recorded yet. Revenue appears here once deals are closed.">
          {d && <RevenueChart data={d.monthly_revenue} />}
        </ChartCard>
        <ChartCard title="Lead acquisition" subtitle="New leads per month" {...state} isEmpty={noLeads} emptyMessage="No leads yet. Add leads in the CRM to see this chart.">
          {d && <LeadAcquisitionChart data={d.lead_acquisition} />}
        </ChartCard>
        <ChartCard
          title="Conversion trend"
          subtitle="Share of each month’s new leads that are won today"
          {...state}
          isEmpty={noLeads}
          emptyMessage="Conversion appears once you have leads."
        >
          {d && <ConversionChart data={d.lead_acquisition} />}
        </ChartCard>
        <ChartCard title="Leads by city" subtitle="Top cities" {...state} isEmpty={!d || d.leads_by_city.length === 0} emptyMessage="Add a city to your leads to see where they come from.">
          {d && <CityChart data={d.leads_by_city} height={260} />}
        </ChartCard>
        <ChartCard
          title="Sales performance"
          subtitle="Revenue per team member, last 12 months"
          {...state}
          className="lg:col-span-2"
          isEmpty={!d || d.sales_performance.every((p) => p.revenue === 0)}
          emptyMessage="No sales yet, so there is nothing to compare."
        >
          {d && <SalesPerformanceChart data={d.sales_performance} />}
        </ChartCard>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <ApiStatus />
        <Card className="p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-200">Recent activity</h2>
          {overview.isLoading ? (
            <div className="mt-4 space-y-3" aria-busy="true">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : !d || d.recent_activity.length === 0 ? (
            <p className="mt-6 text-center text-sm text-slate-500">
              No activity yet. CRM updates, sales and (soon) agent runs will appear here.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {d.recent_activity.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0 truncate">{a.summary}</span>
                  <span className="shrink-0 text-xs text-slate-500">
                    {a.actor_name ?? 'System'} · {timeAgo(a.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}