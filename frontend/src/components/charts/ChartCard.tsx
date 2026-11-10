import type { ReactNode } from 'react'
import { errorMessage } from '../../lib/api'
import { Card, Skeleton } from '../ui/Card'

/** One card, three states: loading skeleton, error with retry, empty message, or the chart. */
export default function ChartCard({
  title,
  subtitle,
  isLoading,
  error,
  onRetry,
  isEmpty,
  emptyMessage,
  height = 260,
  className = '',
  children,
}: {
  title: string
  subtitle?: string
  isLoading: boolean
  error?: unknown
  onRetry?: () => void
  isEmpty?: boolean
  emptyMessage: string
  height?: number
  className?: string
  children: ReactNode
}) {
  return (
    <Card className={`p-5 ${className}`}>
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </div>
      <div style={{ minHeight: height }}>
        {isLoading ? (
          <div aria-busy="true" style={{ height }}>
            <Skeleton className="h-full w-full" />
          </div>
        ) : error ? (
          <div role="alert" className="grid place-items-center gap-2 text-center text-sm text-red-400" style={{ height }}>
            <p>{errorMessage(error, 'Could not load this chart.')}</p>
            {onRetry && (
              <button className="text-electric underline" onClick={onRetry}>
                Retry
              </button>
            )}
          </div>
        ) : isEmpty ? (
          <div style={{ height }} className="grid place-items-center px-6 text-center text-sm text-slate-500">
            {emptyMessage}
          </div>
        ) : (
          children
        )}
      </div>
    </Card>
  )
}