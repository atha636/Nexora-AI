import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from '../../hooks/useInView'

/** Counts from the previous value to `value` (so refreshed data glides instead of jumping). */
export function AnimatedNumber({ value, format, duration = 900 }: { value: number; format: (n: number) => string; duration?: number }) {
  const [shown, setShown] = useState(prefersReducedMotion() ? value : 0)
  const from = useRef(shown)
  useEffect(() => {
    if (prefersReducedMotion()) {
      setShown(value)
      return
    }
    const start = performance.now()
    const origin = from.current
    let frame = 0
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1)
      const v = origin + (value - origin) * (1 - Math.pow(1 - t, 3))
      from.current = v
      setShown(v)
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, duration])
  return <>{format(shown)}</>
}