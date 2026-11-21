import { useEffect, useState, type ReactNode } from 'react'
import { prefersReducedMotion, useInView } from '../../hooks/useInView'

/** Fades and slides its children in when scrolled into view. */
export function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const [ref, seen] = useInView<HTMLDivElement>(0.15)
  return (
    <div ref={ref} style={{ ['--d' as string]: `${delay}ms` }} className={`nx-reveal ${seen ? 'is-in' : ''} ${className}`}>
      {children}
    </div>
  )
}

/** Counts up to `to` the first time it is visible. */
export function CountUp({ to, duration = 1400 }: { to: number; duration?: number }) {
  const [ref, seen] = useInView<HTMLSpanElement>(0.5)
  const [value, setValue] = useState(prefersReducedMotion() ? to : 0)
  useEffect(() => {
    if (!seen || prefersReducedMotion()) {
      if (seen) setValue(to)
      return
    }
    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1)
      setValue(Math.round(to * (1 - Math.pow(1 - t, 3))))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [seen, to, duration])
  return <span ref={ref}>{value}</span>
}

/** A card with a soft emerald glow that follows the cursor. */
export function GlowCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`nx-card rounded-xl ${className}`}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`)
        e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`)
      }}
    >
      <div className="relative">{children}</div>
    </div>
  )
}