import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatCurrencyCompact, formatNumber, monthLabel } from '../../lib/format'
import type { LabelCount, MonthLeads, MonthRevenue, SalesPerson } from '../../lib/types'

// Series colors validated for the dark card surface (see dataviz palette check):
// blue / orange / aqua pass the contrast, lightness and colour-blind-separation gates.
export const SERIES = { blue: '#3987e5', orange: '#d95926', aqua: '#199e70' }
const GRID = '#232f52'
const MUTED = '#8f9bbd'

interface TipProps {
  active?: boolean
  payload?: ReadonlyArray<{ value?: number | string; payload?: Record<string, unknown> }>
  label?: string | number
}

function Tip({ active, payload, label, render }: TipProps & { render: (row: Record<string, unknown>) => string[] }) {
  const row = payload?.[0]?.payload
  if (!active || !row) return null
  return (
    <div className="rounded-lg border border-line bg-navy-900 px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-medium text-slate-200">{String(label ?? '')}</p>
      {render(row).map((line) => (
        <p key={line} className="text-slate-400">
          {line}
        </p>
      ))}
    </div>
  )
}

const axisProps = { tick: { fill: MUTED, fontSize: 12 }, axisLine: false, tickLine: false } as const

export function ChartEmpty({ message }: { message: string }) {
  return <div className="grid h-full place-items-center px-6 text-center text-sm text-slate-500">{message}</div>
}

/** A recharts-friendly fixed-height wrapper so loading skeletons and charts line up. */
export function ChartBox({ children, height = 260 }: { children: React.ReactElement; height?: number }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  )
}

export function RevenueChart({ data, height }: { data: MonthRevenue[]; height?: number }) {
  const rows = data.map((d) => ({ ...d, name: monthLabel(d.month) }))
  return (
    <ChartBox height={height}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="name" {...axisProps} interval="preserveStartEnd" />
        <YAxis {...axisProps} width={56} tickFormatter={formatCurrencyCompact} />
        <Tooltip
          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          content={(p) => (
            <Tip
              {...(p as TipProps)}
              render={(r) => [`Revenue: ${formatCurrencyCompact(r.revenue as number)}`, `Deals: ${r.deals}`]}
            />
          )}
        />
        <Bar dataKey="revenue" fill={SERIES.blue} radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ChartBox>
  )
}

export function LeadAcquisitionChart({ data, height }: { data: MonthLeads[]; height?: number }) {
  const rows = data.map((d) => ({ ...d, name: monthLabel(d.month) }))
  return (
    <ChartBox height={height}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="name" {...axisProps} interval="preserveStartEnd" />
        <YAxis {...axisProps} width={32} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          content={(p) => (
            <Tip {...(p as TipProps)} render={(r) => [`New leads: ${r.created}`, `Won so far: ${r.won}`]} />
          )}
        />
        <Bar dataKey="created" fill={SERIES.aqua} radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ChartBox>
  )
}

export function ConversionChart({ data, height }: { data: MonthLeads[]; height?: number }) {
  const rows = data.map((d) => ({ ...d, name: monthLabel(d.month) }))
  return (
    <ChartBox height={height}>
      <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="name" {...axisProps} interval="preserveStartEnd" />
        <YAxis {...axisProps} width={40} domain={[0, 'auto']} tickFormatter={(v) => `${v}%`} />
        <Tooltip
          cursor={{ stroke: GRID }}
          content={(p) => (
            <Tip
              {...(p as TipProps)}
              render={(r) => [`Conversion: ${r.conversion_rate}%`, `${r.won} of ${r.created} leads won`]}
            />
          )}
        />
        <Line
          type="monotone"
          dataKey="conversion_rate"
          stroke={SERIES.orange}
          strokeWidth={2}
          dot={{ r: 4, fill: SERIES.orange, stroke: '#0f1730', strokeWidth: 2 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ChartBox>
  )
}

/** Horizontal bars: best for ranked categories with long names (cities, people). */
function HorizontalBars({
  rows,
  color,
  valueFormat,
  tip,
  height,
}: {
  rows: { name: string; value: number; [k: string]: unknown }[]
  color: string
  valueFormat: (n: number) => string
  tip: (r: Record<string, unknown>) => string[]
  height?: number
}) {
  return (
    <ChartBox height={height ?? Math.max(200, rows.length * 38 + 20)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 56, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" {...axisProps} width={112} />
        <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={(p) => <Tip {...(p as TipProps)} render={tip} />} />
        <Bar
          dataKey="value"
          fill={color}
          radius={[0, 4, 4, 0]}
          maxBarSize={20}
          label={{ position: 'right', fill: '#c9d1ea', fontSize: 12, formatter: (v: unknown) => valueFormat(Number(v)) }}
        />
      </BarChart>
    </ChartBox>
  )
}

export function CityChart({ data, height }: { data: LabelCount[]; height?: number }) {
  return (
    <HorizontalBars
      rows={data.map((d) => ({ name: d.label, value: d.count }))}
      color={SERIES.blue}
      valueFormat={formatNumber}
      tip={(r) => [`Leads: ${r.value}`]}
      height={height}
    />
  )
}

export function SalesPerformanceChart({ data, height }: { data: SalesPerson[]; height?: number }) {
  return (
    <HorizontalBars
      rows={data.map((d) => ({ name: d.name, value: d.revenue, deals: d.deals, conv: d.conversion_rate }))}
      color={SERIES.orange}
      valueFormat={formatCurrencyCompact}
      tip={(r) => [`Revenue: ${formatCurrencyCompact(r.value as number)}`, `Deals: ${r.deals}`, `Conversion: ${r.conv}%`]}
      height={height}
    />
  )
}