import { Bar, BarChart, CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartBox, SERIES } from '../charts/Charts'
import { formatCurrency, formatCurrencyCompact, formatNumber, monthLabel } from '../../lib/format'
import type { AnalyticsResult } from '../../lib/types'

const GRID = '#232723'
const MUTED = '#858b85'

export function formatValue(unit: AnalyticsResult['unit'], v: number): string {
  if (unit === 'currency') return formatCurrency(v)
  if (unit === 'percent') return `${v}%`
  return formatNumber(v)
}

const compact = (unit: AnalyticsResult['unit'], v: number) =>
  unit === 'currency' ? formatCurrencyCompact(v) : unit === 'percent' ? `${v}%` : formatNumber(v)

function Chart({ result }: { result: AnalyticsResult }) {
  const isMonth = result.group_by === 'month'
  const data = result.rows.map((r) => ({ ...r, name: isMonth ? monthLabel(r.label) : r.label }))
  const axis = { tick: { fill: MUTED, fontSize: 12 }, axisLine: false, tickLine: false } as const
  const tip = (
    <Tooltip
      cursor={{ fill: 'rgba(255,255,255,0.04)' }}
      formatter={(v) => formatValue(result.unit, Number(v))}
      contentStyle={{ background: '#0f110f', border: '1px solid #232723', borderRadius: 8, fontSize: 12 }}
    />
  )
  return (
    <ChartBox height={220}>
      {isMonth ? (
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="name" {...axis} interval="preserveStartEnd" />
          <YAxis {...axis} width={56} tickFormatter={(v) => compact(result.unit, Number(v))} />
          {tip}
          <Line dataKey="value" name={result.metric_label} stroke={SERIES.blue} strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      ) : (
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="name" {...axis} interval={0} />
          <YAxis {...axis} width={56} tickFormatter={(v) => compact(result.unit, Number(v))} />
          {tip}
          <Bar dataKey="value" name={result.metric_label} fill={SERIES.blue} radius={[4, 4, 0, 0]} />
        </BarChart>
      )}
    </ChartBox>
  )
}

/** One analytics answer: headline number, chart, table and caveats. Used on the Analytics page and in chat. */
export default function AnalyticsResultView({ result }: { result: AnalyticsResult }) {
  const compare = result.previous_total !== null && result.previous_period !== null
  const delta = compare ? result.total - (result.previous_total ?? 0) : 0
  const showTable = result.rows.length > 0
  const filters = Object.entries(result.filters)
  const isMonth = result.group_by === 'month'

  return (
    <div className="rounded-xl border border-line bg-navy-900/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">
            {result.metric_label}
            {result.group_label ? ` by ${result.group_label.toLowerCase()}` : ''}
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{formatValue(result.unit, result.total)}</p>
          {compare && (
            <p className="mt-0.5 text-xs text-slate-400">
              {delta === 0 ? 'No change' : `${delta > 0 ? '▲' : '▼'} ${formatValue(result.unit, Math.abs(Math.round(delta * 10) / 10))}`} vs{' '}
              {result.previous_period?.label} ({formatValue(result.unit, result.previous_total ?? 0)})
            </p>
          )}
        </div>
        <div className="text-right text-xs text-slate-400">
          <p>{result.period.label}</p>
          {filters.length > 0 && <p>{filters.map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>}
        </div>
      </div>

      {result.chart && result.rows.length > 0 && (
        <div className="mt-3">
          <Chart result={result} />
        </div>
      )}

      {showTable && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="pb-2 font-medium">{result.group_label}</th>
                <th className="pb-2 text-right font-medium">{result.metric_label}</th>
                {compare && <th className="pb-2 text-right font-medium">Before</th>}
                {compare && <th className="pb-2 text-right font-medium">Change</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {result.rows.map((r) => (
                <tr key={r.label}>
                  <td className="py-1.5">{isMonth ? monthLabel(r.label) : r.label}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatValue(result.unit, r.value)}</td>
                  {compare && <td className="py-1.5 text-right tabular-nums text-slate-400">{formatValue(result.unit, r.previous ?? 0)}</td>}
                  {compare && (
                    <td className={`py-1.5 text-right tabular-nums ${(r.change ?? 0) < 0 ? 'text-red-400' : (r.change ?? 0) > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                      {(r.change ?? 0) > 0 ? '+' : ''}
                      {formatValue(result.unit, r.change ?? 0)}
                      {r.change_pct != null && ` (${r.change_pct > 0 ? '+' : ''}${r.change_pct}%)`}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!showTable && result.group_by && <p className="mt-3 text-sm text-slate-500">No data for this period.</p>}

      {result.notes.length > 0 && (
        <ul className="mt-3 space-y-0.5 text-xs text-slate-500">
          {result.notes.map((n) => (
            <li key={n}>• {n}</li>
          ))}
        </ul>
      )}
    </div>
  )
}