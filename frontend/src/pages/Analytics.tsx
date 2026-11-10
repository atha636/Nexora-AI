import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import ChartCard from '../components/charts/ChartCard'
import {
  CityChart,
  ConversionChart,
  LeadAcquisitionChart,
  RevenueChart,
  SalesPerformanceChart,
} from '../components/charts/Charts'
import { Card } from '../components/ui/Card'
import { inputClass } from '../components/ui/Field'
import { analyticsApi } from '../lib/api'
import { formatCurrency, formatNumber, titleCase } from '../lib/format'
import type { LabelCount, LabelRevenue } from '../lib/types'

const RANGES = [
  { months: 3, label: 'Last 3 months' },
  { months: 6, label: 'Last 6 months' },
  { months: 12, label: 'Last 12 months' },
  { months: 24, label: 'Last 24 months' },
]

function RankedTable({ rows, valueLabel }: { rows: { label: string; value: string }[]; valueLabel: string }) {
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
        <tr>
          <th className="pb-2 font-medium">Name</th>
          <th className="pb-2 text-right font-medium">{valueLabel}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rows.map((r) => (
          <tr key={r.label}>
            <td className="py-2">{r.label}</td>
            <td className="py-2 text-right tabular-nums text-slate-300">{r.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const countRows = (xs: LabelCount[]) => xs.map((x) => ({ label: titleCase(x.label), value: formatNumber(x.count) }))
const revenueRows = (xs: LabelRevenue[]) => xs.map((x) => ({ label: x.label, value: formatCurrency(x.revenue) }))

export default function Analytics() {
  const [months, setMonths] = useState(12)
  const revenue = useQuery({ queryKey: ['analytics', 'revenue', months], queryFn: () => analyticsApi.revenue(months) })
  const leads = useQuery({ queryKey: ['analytics', 'leads', months], queryFn: () => analyticsApi.leads(months) })

  const r = revenue.data
  const l = leads.data
  const rState = { isLoading: revenue.isLoading, error: revenue.error, onRetry: () => revenue.refetch() }
  const lState = { isLoading: leads.isLoading, error: leads.error, onRetry: () => leads.refetch() }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="mt-1 text-sm text-slate-400">Revenue and lead performance. Natural-language questions arrive in Phase 7.</p>
        </div>
        <select aria-label="Time range" className={`${inputClass} !w-auto`} value={months} onChange={(e) => setMonths(Number(e.target.value))}>
          {RANGES.map((x) => (
            <option key={x.months} value={x.months}>
              {x.label}
            </option>
          ))}
        </select>
      </div>

      <Card className="p-5">
        <p className="text-sm text-slate-400">Revenue in this period</p>
        <p className="mt-2 text-3xl font-semibold tracking-tight">{r ? formatCurrency(r.total) : '—'}</p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Monthly revenue" {...rState} isEmpty={!r || r.monthly.every((m) => m.revenue === 0)} emptyMessage="No sales in this period.">
          {r && <RevenueChart data={r.monthly} />}
        </ChartCard>
        <ChartCard title="Revenue by city" subtitle="Based on the city of the lead that was won" {...rState} isEmpty={!r || r.by_city.length === 0} emptyMessage="No sales in this period.">
          {r && <RankedTable rows={revenueRows(r.by_city)} valueLabel="Revenue" />}
        </ChartCard>
        <ChartCard title="Sales performance" {...rState} isEmpty={!r || r.by_salesperson.every((p) => p.revenue === 0)} emptyMessage="No sales in this period.">
          {r && <SalesPerformanceChart data={r.by_salesperson} />}
        </ChartCard>
        <ChartCard title="Conversion by salesperson" subtitle="Won leads as a share of leads assigned" {...rState} isEmpty={!r || r.by_salesperson.every((p) => p.leads_assigned === 0)} emptyMessage="Assign leads to team members to see this.">
          {r && (
            <RankedTable
              rows={[...r.by_salesperson]
                .filter((p) => p.leads_assigned > 0)
                .sort((a, b) => b.conversion_rate - a.conversion_rate)
                .map((p) => ({ label: p.name, value: `${p.conversion_rate}% (${p.leads_won}/${p.leads_assigned})` }))}
              valueLabel="Conversion"
            />
          )}
        </ChartCard>
        <ChartCard title="Lead acquisition" {...lState} isEmpty={!l || l.acquisition.every((m) => m.created === 0)} emptyMessage="No leads in this period.">
          {l && <LeadAcquisitionChart data={l.acquisition} />}
        </ChartCard>
        <ChartCard title="Conversion trend" {...lState} isEmpty={!l || l.acquisition.every((m) => m.created === 0)} emptyMessage="No leads in this period.">
          {l && <ConversionChart data={l.acquisition} />}
        </ChartCard>
        <ChartCard title="Leads by city" {...lState} isEmpty={!l || l.by_city.length === 0} emptyMessage="No cities recorded yet.">
          {l && <CityChart data={l.by_city} />}
        </ChartCard>
        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-1">
          <ChartCard title="By status" {...lState} height={160} isEmpty={!l || l.by_status.length === 0} emptyMessage="No leads yet.">
            {l && <RankedTable rows={countRows(l.by_status)} valueLabel="Leads" />}
          </ChartCard>
          <ChartCard title="By source" {...lState} height={160} isEmpty={!l || l.by_source.length === 0} emptyMessage="No leads yet.">
            {l && <RankedTable rows={countRows(l.by_source)} valueLabel="Leads" />}
          </ChartCard>
        </div>
      </div>
    </div>
  )
}