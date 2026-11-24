import { useEffect, useState } from 'react'
import { prefersReducedMotion } from './useInView'

/**
 * Reveals an already-complete answer a few words at a time.
 *
 * This is a presentation effect, not network streaming: the server sends the whole answer at once (the agent
 * has to finish its tool calls and checks before there is anything safe to show). It only runs when `enabled`,
 * skips tables and code (half-drawn markdown looks broken), and is instant for people who prefer reduced motion.
 * Total time is capped at about two seconds however long the answer is.
 */
export function useTypewriter(text: string, enabled: boolean) {
  const instant = !enabled || prefersReducedMotion() || /\n\s*\|.*\||```/.test(text)
  const tokens = instant ? [] : (text.match(/\S+\s*/g) ?? [])
  const [count, setCount] = useState(instant ? tokens.length : 0)

  useEffect(() => {
    if (instant) return
    const step = Math.max(1, Math.ceil(tokens.length / 60))
    const id = setInterval(() => {
      setCount((c) => {
        const next = Math.min(tokens.length, c + step)
        if (next >= tokens.length) clearInterval(id)
        return next
      })
    }, 33)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, instant])

  if (instant) return { shown: text, done: true, skip: () => {} }
  const done = count >= tokens.length
  return { shown: done ? text : tokens.slice(0, count).join(''), done, skip: () => setCount(tokens.length) }
}