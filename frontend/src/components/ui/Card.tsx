import type { ReactNode } from 'react'

export function Card({
  children,
  className = '',
  role,
  lift = false,
}: {
  children: ReactNode
  className?: string
  role?: string
  /** Rises slightly on hover. Use for cards that summarise something you can open. */
  lift?: boolean
}) {
  return (
    <div role={role} className={`rounded-xl border border-line bg-navy-900 ${lift ? 'nx-lift' : ''} ${className}`}>
      {children}
    </div>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`nx-skeleton rounded-md ${className}`} aria-hidden />
}