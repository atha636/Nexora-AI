import { ArrowLeft, ArrowRight, Sparkles, X } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

export const TOUR_EVENT = 'nexora:start-tour'
const DONE_KEY = 'nexora-tour-done'

interface Step {
  /** Value of the data-tour attribute to spotlight. Without one the card is shown in the middle of the screen. */
  target?: string
  title: string
  body: string
}

const STEPS: Step[] = [
  {
    title: 'Welcome to Nexora AI',
    body: 'A 40-second tour of where things live. You can leave at any time with Esc, and bring the tour back from Settings or the Ctrl+K menu.',
  },
  { target: 'nav-dashboard', title: 'Your dashboard', body: 'Revenue, leads, approvals and recent activity, all calculated from your own data.' },
  { target: 'nav-assistant', title: 'Ask in plain English', body: 'Try “Find high-priority leads in Delhi not contacted this week”. The assistant looks things up and shows its sources and the steps it took.' },
  { target: 'nav-leads', title: 'Your CRM', body: 'Search, filter and edit leads. Switch to the Board view to drag leads through your pipeline.' },
  { target: 'nav-knowledge', title: 'Your documents', body: 'Upload PDFs, Word files or text. Answers cite the document and page, and say so when the answer is not in your files.' },
  { target: 'nav-approvals', title: 'You stay in control', body: 'Anything that sends an email or changes data waits here until a person approves it. The server enforces this, not only the screen.' },
  { target: 'search', title: 'Jump anywhere', body: 'Press Ctrl+K (Cmd+K on Mac) to find a page, a lead or a document, or to run a quick action.' },
]

const MARGIN = 12
const CARD_W = 340

interface Box {
  top: number
  left: number
  width: number
  height: number
}

/** The element for a step, only if it is actually on screen (the sidebar is hidden on phones and tablets). */
function findTarget(target?: string): Box | null {
  if (!target) return null
  const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  const visible = r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth && r.bottom > 0 && r.top < window.innerHeight
  return visible ? { top: r.top, left: r.left, width: r.width, height: r.height } : null
}

function doneAlready(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) === '1'
  } catch {
    return true // if storage is blocked we can't remember, so don't nag on every visit
  }
}
function markDone() {
  try {
    localStorage.setItem(DONE_KEY, '1')
  } catch {
    /* nothing to do */
  }
}

/** Opens itself once on a person's first visit to the dashboard, and whenever TOUR_EVENT is fired. */
export default function ProductTour() {
  const [index, setIndex] = useState<number | null>(null)
  const [box, setBox] = useState<Box | null>(null)
  const { pathname } = useLocation()
  const nextRef = useRef<HTMLButtonElement>(null)

  const close = useCallback(() => {
    markDone()
    setIndex(null)
  }, [])

  useEffect(() => {
    const start = () => setIndex(0)
    window.addEventListener(TOUR_EVENT, start)
    return () => window.removeEventListener(TOUR_EVENT, start)
  }, [])

  useEffect(() => {
    if (pathname !== '/dashboard' || doneAlready()) return
    const t = setTimeout(() => setIndex((i) => (i === null ? 0 : i)), 1200)
    return () => clearTimeout(t)
  }, [pathname])

  const step = index === null ? null : STEPS[index]

  const measure = useCallback(() => setBox(findTarget(step?.target)), [step])
  useLayoutEffect(() => {
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure])
  useEffect(() => {
    if (index !== null) nextRef.current?.focus()
  }, [index])

  useEffect(() => {
    if (index === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowRight') setIndex((i) => (i !== null && i < STEPS.length - 1 ? i + 1 : i))
      else if (e.key === 'ArrowLeft') setIndex((i) => (i !== null && i > 0 ? i - 1 : i))
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [index, close])

  if (index === null || !step) return null
  const last = index === STEPS.length - 1

  // Put the card beside the highlighted item when there is room, otherwise below it, otherwise centred.
  const vw = window.innerWidth
  const vh = window.innerHeight
  const cardW = Math.min(CARD_W, vw - 2 * MARGIN)
  let style: React.CSSProperties = { width: cardW, left: Math.max(MARGIN, (vw - cardW) / 2), top: Math.max(MARGIN, vh / 2 - 130) }
  if (box) {
    const rightRoom = vw - (box.left + box.width) - MARGIN
    if (rightRoom >= cardW + 16) style = { width: cardW, left: box.left + box.width + 16, top: Math.min(Math.max(MARGIN, box.top - 8), vh - 240) }
    else style = { width: cardW, left: Math.min(Math.max(MARGIN, box.left), vw - cardW - MARGIN), top: Math.min(box.top + box.height + 14, vh - 240) }
  }

  return (
    <div className="fixed inset-0 z-[70]" role="presentation">
      {/* Clicking outside the card does nothing, so a stray click can't throw the tour away. */}
      {box ? (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-xl ring-2 ring-brand transition-all duration-300"
          style={{
            top: box.top - 6,
            left: box.left - 6,
            width: box.width + 12,
            height: box.height + 12,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.72)',
          }}
        />
      ) : (
        <div aria-hidden className="absolute inset-0 bg-black/72" style={{ background: 'rgba(0,0,0,0.72)' }} />
      )}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        className="nx-pop absolute rounded-2xl border border-line bg-navy-900 p-5 shadow-2xl"
        style={style}
      >
        <button aria-label="Skip tour" onClick={close} className="absolute right-3 top-3 rounded-md p-1 text-slate-500 hover:bg-navy-700 hover:text-white">
          <X className="h-4 w-4" />
        </button>
        <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-brand">
          <Sparkles className="h-3.5 w-3.5" aria-hidden /> Step {index + 1} of {STEPS.length}
        </p>
        <h2 id="tour-title" className="mt-2 pr-6 text-base font-semibold">
          {step.title}
        </h2>
        <p id="tour-body" className="mt-1.5 text-sm leading-relaxed text-slate-400">
          {step.body}
        </p>
        <div className="mt-4 flex items-center gap-1.5" aria-hidden>
          {STEPS.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-brand' : 'w-1.5 bg-navy-600'}`} />
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between">
          <button onClick={close} className="text-xs text-slate-500 hover:text-slate-300">
            Skip tour
          </button>
          <div className="flex gap-2">
            {index > 0 && (
              <button
                onClick={() => setIndex(index - 1)}
                className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-sm text-slate-300 hover:bg-navy-700"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back
              </button>
            )}
            <button
              ref={nextRef}
              onClick={() => (last ? close() : setIndex(index + 1))}
              className="inline-flex items-center gap-1 rounded-lg bg-brand px-3.5 py-1.5 text-sm font-medium text-black hover:opacity-90"
            >
              {last ? 'Finish' : 'Next'} {!last && <ArrowRight className="h-3.5 w-3.5" aria-hidden />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}