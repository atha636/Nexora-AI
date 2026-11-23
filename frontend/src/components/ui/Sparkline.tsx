/** A tiny trend line for a KPI card. Decorative (the number next to it carries the meaning). */
export function Sparkline({ data, className = '' }: { data: number[]; className?: string }) {
  if (data.length < 2 || data.every((v) => v === data[0])) return null
  const w = 120
  const h = 36
  const min = Math.min(...data)
  const max = Math.max(...data)
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - 4 - ((v - min) / (max - min)) * (h - 8)] as const)
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `0,${h} ${line} ${w},${h}`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden className={`h-9 w-full ${className}`}>
      <defs>
        <linearGradient id="nx-spark" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--color-brand)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--color-brand)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#nx-spark)" />
      <polyline points={line} pathLength={1} fill="none" stroke="var(--color-brand)" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" className="nx-draw" />
    </svg>
  )
}