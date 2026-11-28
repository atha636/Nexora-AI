import { useMutation, useQuery } from '@tanstack/react-query'
import { Download, Printer } from 'lucide-react'
import { useEffect, useState } from 'react'
import ChartCard from '../components/charts/ChartCard'
import { RevenueChart } from '../components/charts/Charts'
import { Button } from '../components/ui/Button'
import { Card, Skeleton } from '../components/ui/Card'
import { inputClass } from '../components/ui/Field'
import { useToast } from '../components/ui/Toast'
import { useT } from '../i18n'
import type { Key } from '../i18n/en'
import { errorMessage, reportsApi } from '../lib/api'
import { useAuth } from '../lib/auth'
import { saveBlob } from '../lib/download'
import { formatCurrency, formatNumber, monthLabel, titleCase } from '../lib/format'

const RANGES: { months: number; label: Key }[] = [
  { months: 1, label: 'rep.range1' },
  { months: 3, label: 'rep.range3' },
  { months: 6, label: 'rep.range6' },
  { months: 12, label: 'rep.range12' },
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
  const { t, lang } = useT()
  const toast = useToast()
  const [months, setMonths] = useState(6)
  const q = useQuery({ queryKey: ['report', months], queryFn: () => reportsApi.summary(months) })
  const exportCsv = useMutation({
    mutationFn: (kind: 'leads' | 'sales') => reportsApi.exportCsv(kind, months),
    onSuccess: ({ blob, name }) => {
      saveBlob(blob, name)
      toast.success(t('rep.exported'))
    },
    onError: (e) => toast.error(errorMessage(e, t('rep.exportError'))),
  })

  const r = q.data
  const period = r ? (r.period_start === r.period_end ? monthLabel(r.period_start) : `${monthLabel(r.period_start)} – ${monthLabel(r.period_end)}`) : ''
  const cards = r
    ? [
        [t('rep.newLeads'), formatNumber(r.period.new_leads), t('rep.wonSoFar', { n: r.period.won_of_new })],
        [t('rep.conversion'), `${r.period.conversion_rate}%`, t('rep.ofNew')],
        [t('rep.revenue'), formatCurrency(r.period.revenue), t('rep.dealsClosed', { n: formatNumber(r.period.deals) })],
        [t('rep.avgDeal'), formatCurrency(r.period.average_deal), t('rep.revDivDeals')],
        [t('rep.tasksDone'), formatNumber(r.tasks.completed_in_period), t('rep.tasksNow', { open: r.tasks.open, overdue: r.tasks.overdue })],
      ]
    : []

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3" data-print-hide>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('rep.title')}</h1>
          <p className="mt-1 text-sm text-slate-400">{t('rep.sub')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label={t('rep.period')} className={`${inputClass} !w-auto`} value={months} onChange={(e) => setMonths(Number(e.target.value))}>
            {RANGES.map((x) => (
              <option key={x.months} value={x.months}>
                {t(x.label)}
              </option>
            ))}
          </select>
          <Button variant="outline" onClick={() => window.print()} disabled={!r}>
            <Printer className="h-4 w-4" aria-hidden /> {t('rep.pdf')}
          </Button>
          {can('manager') && (
            <>
              <Button variant="outline" disabled={exportCsv.isPending} onClick={() => exportCsv.mutate('leads')}>
                <Download className="h-4 w-4" aria-hidden /> {t('rep.leadsCsv')}
              </Button>
              <Button variant="outline" disabled={exportCsv.isPending} onClick={() => exportCsv.mutate('sales')}>
                <Download className="h-4 w-4" aria-hidden /> {t('rep.salesCsv')}
              </Button>
            </>
          )}
        </div>
      </div>
      <p className="text-xs text-slate-500" data-print-hide>
        {t('rep.pdfHelp')}
        {!can('manager') && ` ${t('rep.csvManagers')}`}
      </p>

      {q.isLoading && <Skeleton className="h-64 w-full" />}
      {q.isError && (
        <Card className="p-6 text-center" role="alert">
          <p className="text-sm text-red-400">{errorMessage(q.error, t('rep.loadError'))}</p>
          <Button variant="outline" className="mt-3" onClick={() => q.refetch()}>
            {t('rep.tryAgain')}
          </Button>
        </Card>
      )}

      {r && (
        <>
          <header className="hidden border-b border-line pb-3 print:block">
            <p className="text-xs uppercase tracking-widest text-slate-500">{t('rep.printKicker')}</p>
            <h2 className="text-2xl font-semibold">{r.organization}</h2>
            <p className="text-sm text-slate-400">
              {period} · {t('rep.generated', { date: new Date(r.generated_at).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) })}
            </p>
          </header>
          <p className="text-sm text-slate-400 print:hidden">
            {t('rep.showing', { period, org: r.organization })}
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

          <ChartCard title={t('rep.monthlyRevenue')} isLoading={false} isEmpty={r.monthly_revenue.every((m) => m.revenue === 0)} emptyMessage={t('rep.noSales')} className="nx-avoid-break">
            <RevenueChart data={r.monthly_revenue} />
          </ChartCard>

          <div className="grid gap-4 md:grid-cols-2">
            <Section title={t('rep.revByCity')}>
              {r.revenue_by_city.length === 0 ? <Empty text={t('rep.noSales')} /> : <Table head={[t('rep.city'), t('rep.colRevenue')]} rows={r.revenue_by_city.map((c) => [c.label, formatCurrency(c.revenue)])} />}
            </Section>
            <Section title={t('rep.salesTeam')} note={t('rep.salesTeamNote')}>
              {r.by_salesperson.every((p) => p.revenue === 0 && p.leads_assigned === 0) ? (
                <Empty text={t('rep.noTeamData')} />
              ) : (
                <Table
                  head={[t('rep.name'), t('rep.deals'), t('rep.colRevenue'), t('rep.colConversion')]}
                  rows={[...r.by_salesperson].sort((a, b) => b.revenue - a.revenue).map((p) => [p.name, String(p.deals), formatCurrency(p.revenue), `${p.conversion_rate}%`])}
                />
              )}
            </Section>
            <Section title={t('rep.newByMonth')}>
              <Table head={[t('rep.month'), t('rep.created'), t('rep.won')]} rows={r.acquisition.map((m) => [monthLabel(m.month), String(m.created), String(m.won)])} />
            </Section>
            <Section title={t('rep.pipeline')} note={t('rep.pipelineNote')}>
              {r.leads_by_status.length === 0 ? <Empty text={t('rep.noLeads')} /> : <Table head={[t('rep.status'), t('rep.leads')]} rows={r.leads_by_status.map((x) => [titleCase(x.label), formatNumber(x.count)])} />}
            </Section>
            <Section title={t('rep.bySource')}>
              {r.leads_by_source.length === 0 ? <Empty text={t('rep.noLeads')} /> : <Table head={[t('rep.source'), t('rep.leads')]} rows={r.leads_by_source.map((x) => [titleCase(x.label), formatNumber(x.count)])} />}
            </Section>
            <Section title={t('rep.byCity')}>
              {r.leads_by_city.length === 0 ? <Empty text={t('rep.noCities')} /> : <Table head={[t('rep.city'), t('rep.leads')]} rows={r.leads_by_city.map((x) => [x.label, formatNumber(x.count)])} />}
            </Section>
          </div>
        </>
      )}
    </div>
  )
}