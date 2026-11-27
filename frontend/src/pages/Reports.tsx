import { useMutation, useQuery } from '@tanstack/react-query'
import { Download, Printer } from 'lucide-react'
import { useEffect, useState } from 'react'
import ChartCard from '../components/charts/ChartCard'
import { RevenueChart } from '../components/charts/Charts'
import { Button } from '../components/ui/Button'
import { Card, Skeleton } from '../components/ui/Card'
import { inputClass } from '../components/ui/Field'
import { useToast } from '../components/ui/Toast'
import { errorMessage, reportsApi } from '../lib/api'
import { useAuth } from '../lib/auth'
import { saveBlob } from '../lib/download'
import { formatCurrency, formatNumber, monthLabel, titleCase } from '../lib/format'

const RANGES = [
  { months: 1, label: 'This month' },
  { months: 3, label: 'Last 3 months' },
  { months: 6, label: 'Last 6 months' },
  { months: 12, label: 'Last 12 months' },
]

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
        <tr>
          {head.map((h, i) => (
            <th key={h} className={`pb-2 font-medium ${i > 0 ? 'text-right' : ''}`}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rows.map((r) => (
          <tr key={r[0]}>
            {r.map((c, i) => (
              <td key={i} className={`py-2 ${i > 0 ? 'text-right tabular-nums text-slate-300' : 'break-words'}`}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <Card className="nx-avoid-break p-5">
      <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
      {note && <p className="mb-3 text-xs text-slate-500">{note}</p>}
      <div className={note ? '' : 'mt-3'}>{children}</div>
    </Card>
  )
}

const Empty = ({ text }: { text: string }) => <p className="text-sm text-slate-500">{text}</p>

/** While the browser prints, switch to the light theme so the report is dark text on white paper. */
function usePrintLight() {
  useEffect(() => {
    let saved: string | null = null
    const before = () => {
      saved = document.documentElement.getAttribute('data-theme')
      document.documentElement.setAttribute('data-theme', 'light')
    }
    const after = () => {
      if (saved) document.documentElement.setAttribute('data-theme', saved)
      else document.documentElement.removeAttribute('data-theme')
      saved = null
    }
    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', after)
    return () => {
      window.removeEventListener('beforeprint', before)
      window.removeEventListener('afterprint', after)
    }
  }, [])
}

export default function Reports() {
  usePrintLight()
  const { can } = useAuth()
  const toast = useToast()
  const [months, setMonths] = useState(6)
  const q = useQuery({ queryKey: ['report', months], queryFn: () => reportsApi.summary(months) })
  const exportCsv = useMutation({
    mutationFn: (kind: 'leads' | 'sales') => reportsApi.exportCsv(kind, months),
    onSuccess: ({ blob, name }) => {
      saveBlob(blob, name)
      toast.success('Export downloaded')
    },
    onError: (e) => toast.error(errorMessage(e, 'Could not export. Please try again.')),
  })

  const r = q.data
  const period = r ? (r.period_start === r.period_end ? monthLabel(r.period_start) : `${monthLabel(r.period_start)} – ${monthLabel(r.period_end)}`) : ''
  const cards = r
    ? [
        ['New leads', formatNumber(r.period.new_leads), `${r.period.won_of_new} won so far`],
        ['Conversion', `${r.period.conversion_rate}%`, 'of those new leads'],
        ['Revenue', formatCurrency(r.period.revenue), `${formatNumber(r.period.deals)} deals closed`],
        ['Average deal', formatCurrency(r.period.average_deal), 'revenue ÷ deals'],
        ['Tasks completed', formatNumber(r.tasks.completed_in_period), `${r.tasks.open} open, ${r.tasks.overdue} overdue now`],
      ]
    : []

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3" data-print-hide>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
          <p className="mt-1 text-sm text-slate-400">A clean summary you can save as a PDF or share. Exports download as CSV for Excel or Sheets.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Report period" className={`${inputClass} !w-auto`} value={months} onChange={(e) => setMonths(Number(e.target.value))}>
            {RANGES.map((x) => (
              <option key={x.months} value={x.months}>
                {x.label}
              </option>
            ))}
          </select>
          <Button variant="outline" onClick={() => window.print()} disabled={!r}>
            <Printer className="h-4 w-4" aria-hidden /> Download PDF
          </Button>
          {can('manager') && (
            <>
              <Button variant="outline" disabled={exportCsv.isPending} onClick={() => exportCsv.mutate('leads')}>
                <Download className="h-4 w-4" aria-hidden /> Leads CSV
              </Button>
              <Button variant="outline" disabled={exportCsv.isPending} onClick={() => exportCsv.mutate('sales')}>
                <Download className="h-4 w-4" aria-hidden /> Sales CSV
              </Button>
            </>
          )}
        </div>
      </div>
      <p className="text-xs text-slate-500" data-print-hide>
        “Download PDF” opens your browser&apos;s print window. Choose <strong>Save as PDF</strong> as the printer.
        {!can('manager') && ' CSV exports contain contact details, so they are available to managers and above.'}
      </p>

      {q.isLoading && <Skeleton className="h-64 w-full" />}
      {q.isError && (
        <Card className="p-6 text-center" role="alert">
          <p className="text-sm text-red-400">{errorMessage(q.error, 'Could not load the report.')}</p>
          <Button variant="outline" className="mt-3" onClick={() => q.refetch()}>
            Try again
          </Button>
        </Card>
      )}

      {r && (
        <>
          <header className="hidden border-b border-line pb-3 print:block">
            <p className="text-xs uppercase tracking-widest text-slate-500">Business report</p>
            <h2 className="text-2xl font-semibold">{r.organization}</h2>
            <p className="text-sm text-slate-400">
              {period} · generated {new Date(r.generated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </header>
          <p className="text-sm text-slate-400 print:hidden">
            Showing <strong className="text-white">{period}</strong> for {r.organization}.
          </p>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            {cards.map(([label, value, sub]) => (
              <Card key={label} className="nx-avoid-break p-4">
                <p className="text-xs text-slate-400">{label}</p>
                <p className="mt-1 break-words text-xl font-semibold tracking-tight">{value}</p>
                <p className="mt-1 text-xs text-slate-500">{sub}</p>
              </Card>
            ))}
          </div>

          <ChartCard title="Monthly revenue" isLoading={false} isEmpty={r.monthly_revenue.every((m) => m.revenue === 0)} emptyMessage="No sales in this period." className="nx-avoid-break">
            <RevenueChart data={r.monthly_revenue} />
          </ChartCard>

          <div className="grid gap-4 md:grid-cols-2">
            <Section title="Revenue by city">
              {r.revenue_by_city.length === 0 ? <Empty text="No sales in this period." /> : <Table head={['City', 'Revenue']} rows={r.revenue_by_city.map((c) => [c.label, formatCurrency(c.revenue)])} />}
            </Section>
            <Section title="Sales team" note="Revenue in the period; conversion is won leads out of leads assigned.">
              {r.by_salesperson.every((p) => p.revenue === 0 && p.leads_assigned === 0) ? (
                <Empty text="No sales or assigned leads yet." />
              ) : (
                <Table
                  head={['Name', 'Deals', 'Revenue', 'Conversion']}
                  rows={[...r.by_salesperson].sort((a, b) => b.revenue - a.revenue).map((p) => [p.name, String(p.deals), formatCurrency(p.revenue), `${p.conversion_rate}%`])}
                />
              )}
            </Section>
            <Section title="New leads by month">
              <Table head={['Month', 'Created', 'Won']} rows={r.acquisition.map((m) => [monthLabel(m.month), String(m.created), String(m.won)])} />
            </Section>
            <Section title="Pipeline by status" note="All leads, not only this period.">
              {r.leads_by_status.length === 0 ? <Empty text="No leads yet." /> : <Table head={['Status', 'Leads']} rows={r.leads_by_status.map((x) => [titleCase(x.label), formatNumber(x.count)])} />}
            </Section>
            <Section title="Leads by source">
              {r.leads_by_source.length === 0 ? <Empty text="No leads yet." /> : <Table head={['Source', 'Leads']} rows={r.leads_by_source.map((x) => [titleCase(x.label), formatNumber(x.count)])} />}
            </Section>
            <Section title="Leads by city">
              {r.leads_by_city.length === 0 ? <Empty text="No cities recorded yet." /> : <Table head={['City', 'Leads']} rows={r.leads_by_city.map((x) => [x.label, formatNumber(x.count)])} />}
            </Section>
          </div>
        </>
      )}
    </div>
  )
}