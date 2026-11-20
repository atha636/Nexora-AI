import type { ReactNode } from 'react'

export function Card({
  children,
  className = '',
  role,
}: {
  children: ReactNode
  className?: string
  role?: string
}) {
  return (
    <div
      role={role}
      className={`rounded-xl border border-line bg-navy-900 ${className}`}
    >
      {children}
    </div>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-navy-700 ${className}`} />
}