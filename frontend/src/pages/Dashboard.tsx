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
import BriefingCard from '../components/dashboard/BriefingCard'
import { AnimatedNumber } from '../components/ui/AnimatedNumber'
import { Card, Skeleton } from '../components/ui/Card'
import { Sparkline } from '../components/ui/Sparkline'
import { analyticsApi, errorMessage, fetchHealth } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useT } from '../i18n'
import type { Key } from '../i18n/en'
import { formatCurrency, formatNumber, timeAgo } from '../lib/format'
import type { DashboardOverview, Kpis } from '../lib/types'

interface KpiCard {
  label: Key
  icon: LucideIcon
  num: (k: Kpis) => number
  fmt: (n: number) => string
  hint?: (k: Kpis, t: ReturnType<typeof useT>['t']) => string
  trend?: (d: DashboardOverview) => number[]
}

const kpiCards: KpiCard[] = [
  {
    label: 'dash.totalLeads', icon: Users, num: (k) => k.total_leads, fmt: (n) => formatNumber(Math.round(n)), hint: (k, t) => t('dash.hintWon', { n: k.won_leads }),
    trend: (d) => d.lead_acquisition.reduce<number[]>((acc, m) => [...acc, (acc.at(-1) ?? 0) + m.created], []),
  },
  { label: 'dash.totalRevenue', icon: DollarSign, num: (k) => k.total_revenue, fmt: (n) => formatCurrency(Math.round(n)), trend: (d) => d.monthly_revenue.map((m) => m.revenue) },
  {
    label: 'dash.conversionRate', icon: Target, num: (k) => k.conversion_rate, fmt: (n) => `${n.toFixed(1)}%`, hint: (k, t) => t('dash.hintOfLeads', { won: k.won_leads, total: k.total_leads }),
    trend: (d) => d.lead_acquisition.map((m) => m.conversion_rate),
  },
  { label: 'dash.activeWorkflows', icon: GitBranch, num: (k) => k.active_workflows, fmt: (n) => formatNumber(Math.round(n)), hint: (_k, t) => t('dash.hintEnabled') },
  { label: 'dash.pendingApprovals', icon: CheckSquare, num: (k) => k.pending_approvals, fmt: (n) => formatNumber(Math.round(n)), hint: (_k, t) => t('dash.hintWaiting') },
  { label: 'dash.documentsIndexed', icon: FileText, num: (k) => k.documents_indexed, fmt: (n) => formatNumber(Math.round(n)), hint: (_k, t) => t('dash.hintReady') },
]

function ApiStatus() {
  const { t } = useT()
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    retry: 1,
  })

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-200">{t('dash.statusTitle')}</h2>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="rounded-md px-2 py-1 text-xs text-electric hover:bg-navy-700 disabled:opacity-50"
        >
          {isFetching ? t('dash.checking') : t('dash.recheck')}
        </button>
      </div>
      {isLoading ? (
        <div className="mt-4 space-y-2" aria-busy="true">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-56" />
          <p className="pt-1 text-xs text-slate-500">
            {t('dash.connecting')}
          </p>
        </div>
      ) : isError || !data ? (
        <p role="alert" className="mt-4 text-sm text-red-400">
          Can’t reach the backend. Start it with <code>uvicorn app.main:app --reload</code> and check{' '}
          <code>VITE_API_URL</code>.
        </p>
      ) : (
        <dl className="mt-4 grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-slate-400">{t('dash.api')}</dt>
          <dd className={data.status === 'ok' ? 'text-emerald-400' : 'text-amber-400'}>
            {data.status === 'ok' ? t('dash.healthy') : t('dash.degraded')}
          </dd>
          <dt className="text-slate-400">{t('dash.database')}</dt>
          <dd className={data.database === 'ok' ? 'text-emerald-400' : 'text-red-400'}>
            {data.database === 'ok' ? t('dash.connected') : t('dash.unavailable')}
          </dd>
          <dt className="text-slate-400">{t('dash.version')}</dt>
          <dd>{data.version}</dd>
        </dl>
      )}
    </Card>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const { t } = useT()
  const overview = useQuery({ queryKey: ['dashboard'], queryFn: analyticsApi.dashboard })
  const d = overview.data
  const state = { isLoading: overview.isLoading, error: overview.error, onRetry: () => overview.refetch() }

  const noRevenue = !d || d.monthly_revenue.every((m) => m.revenue === 0)
  const noLeads = !d || d.lead_acquisition.every((m) => m.created === 0)

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('dash.welcome', { name: user?.full_name.split(' ')[0] ?? '' })}</h1>
        <p className="mt-1 text-sm text-slate-400">{t('dash.overview', { org: user?.organization.name ?? '' })}</p>
      </div>

      <BriefingCard />

      <section aria-label={t('dash.metrics')} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {kpiCards.map(({ label, icon: Icon, num, fmt, hint, trend }) => (
          <Card key={label} lift className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-400">{t(label)}</p>
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand/15 text-brand">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
            </div>
            {d ? (
              <>
                <p className="mt-3 text-3xl font-semibold tracking-tight">
                  <AnimatedNumber value={num(d.kpis)} format={fmt} />
                </p>
                {hint && <p className="mt-1 text-xs text-slate-500">{hint(d.kpis, t)}</p>}
                {trend && <Sparkline data={trend(d)} className="mt-3" />}
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
          {errorMessage(overview.error, t('dash.loadError'))}{' '}
          <button className="underline" onClick={() => overview.refetch()}>
            {t('dash.retry')}
          </button>
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title={t('dash.revenueTitle')} subtitle={t('dash.revenueSub')} {...state} isEmpty={noRevenue} emptyMessage={t('dash.revenueEmpty')}>
          {d && <RevenueChart data={d.monthly_revenue} />}
        </ChartCard>
        <ChartCard title={t('dash.acqTitle')} subtitle={t('dash.acqSub')} {...state} isEmpty={noLeads} emptyMessage={t('dash.acqEmpty')}>
          {d && <LeadAcquisitionChart data={d.lead_acquisition} />}
        </ChartCard>
        <ChartCard
          title={t('dash.convTitle')}
          subtitle={t('dash.convSub')}
          {...state}
          isEmpty={noLeads}
          emptyMessage={t('dash.convEmpty')}
        >
          {d && <ConversionChart data={d.lead_acquisition} />}
        </ChartCard>
        <ChartCard title={t('dash.cityTitle')} subtitle={t('dash.citySub')} {...state} isEmpty={!d || d.leads_by_city.length === 0} emptyMessage={t('dash.cityEmpty')}>
          {d && <CityChart data={d.leads_by_city} height={260} />}
        </ChartCard>
        <ChartCard
          title={t('dash.perfTitle')}
          subtitle={t('dash.perfSub')}
          {...state}
          className="lg:col-span-2"
          isEmpty={!d || d.sales_performance.every((p) => p.revenue === 0)}
          emptyMessage={t('dash.perfEmpty')}
        >
          {d && <SalesPerformanceChart data={d.sales_performance} />}
        </ChartCard>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <ApiStatus />
        <Card className="p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-200">{t('dash.recentTitle')}</h2>
          {overview.isLoading ? (
            <div className="mt-4 space-y-3" aria-busy="true">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : !d || d.recent_activity.length === 0 ? (
            <p className="mt-6 text-center text-sm text-slate-500">
              {t('dash.recentEmpty')}
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {d.recent_activity.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0 truncate">{a.summary}</span>
                  <span className="shrink-0 text-xs text-slate-500">
                    {a.actor_name ?? t('dash.system')} · {timeAgo(a.created_at)}
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