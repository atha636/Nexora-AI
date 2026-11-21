import { Check, Clock, Loader2, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { prefersReducedMotion } from '../../hooks/useInView'

const PROMPT = 'Find high-priority leads in Delhi that were not contacted in 7 days and draft follow-ups.'
const STEPS = [
  { tool: 'search_leads', done: '12 leads match your filters' },
  { tool: 'draft_email', done: '12 personalised drafts prepared' },
  { tool: 'request_approval', done: 'Waiting for a manager to approve' },
]

/** A looping, scripted walk-through of the product. It is an illustration (sample data), not a live call. */
export default function AgentDemo() {
  const still = prefersReducedMotion()
  const [typed, setTyped] = useState(still ? PROMPT.length : 0)
  const [steps, setSteps] = useState(still ? 3 : 0)
  const [approved, setApproved] = useState(still)

  useEffect(() => {
    if (still) return
    let dead = false
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
    void (async () => {
      while (!dead) {
        setTyped(0)
        setSteps(0)
        setApproved(false)
        for (let i = 1; i <= PROMPT.length && !dead; i++) {
          setTyped(i)
          await sleep(26)
        }
        await sleep(500)
        for (let s = 1; s <= 3 && !dead; s++) {
          setSteps(s)
          await sleep(900)
        }
        await sleep(1100)
        setApproved(true)
        await sleep(3800)
      }
    })()
    return () => {
      dead = true
    }
  }, [still])

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-navy-900/90 backdrop-blur" aria-label="Animated example of the Nexora AI assistant">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-navy-600" />
        <span className="h-2.5 w-2.5 rounded-full bg-navy-600" />
        <span className="h-2.5 w-2.5 rounded-full bg-navy-600" />
        <span className="ml-2 text-xs text-slate-500">AI Assistant</span>
        <span className="ml-auto rounded-full border border-line px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-500">Example</span>
      </div>

      <div className="min-h-[21rem] space-y-3 p-4 text-sm">
        <div className="ml-auto max-w-[88%] rounded-xl border border-line bg-navy-700 px-3.5 py-2.5 text-slate-100">
          {PROMPT.slice(0, typed)}
          {typed < PROMPT.length && <span className="nx-caret ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 bg-brand" />}
        </div>

        {steps > 0 && (
          <ul className="space-y-1.5 rounded-xl border border-line p-3" aria-live="polite">
            {STEPS.slice(0, steps).map((s, i) => {
              const running = i === steps - 1 && steps < 3
              const waiting = i === 2 && !approved
              return (
                <li key={s.tool} className="nx-pop flex items-center gap-2.5">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand/15 text-brand">
                    {running ? <Loader2 className="h-3 w-3 animate-spin" /> : waiting ? <Clock className="h-3 w-3" /> : <Check className="h-3 w-3" />}
                  </span>
                  <code className="font-mono text-xs text-brand">{s.tool}</code>
                  <span className="truncate text-xs text-slate-400">{i === 2 && approved ? '12 emails approved' : s.done}</span>
                </li>
              )
            })}
          </ul>
        )}

        {steps === 3 && (
          <div className="nx-pop rounded-xl border border-line bg-navy-950 p-3">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <ShieldCheck className="h-4 w-4 text-brand" />
              {approved ? 'Approved by a manager · recorded in the audit log' : 'Nothing is sent until someone approves'}
            </div>
            <div className="mt-2.5 flex items-center gap-2">
              <span
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors duration-500 ${
                  approved ? 'bg-brand/15 text-brand' : 'bg-brand text-black'
                }`}
              >
                {approved ? '✓ Approved' : 'Approve 12 emails'}
              </span>
              {!approved && <span className="rounded-md border border-line px-3 py-1.5 text-xs text-slate-400">Review drafts</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}