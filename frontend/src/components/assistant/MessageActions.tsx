import { Check, Copy, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import type { Block } from '../../lib/types'

/** Tools that change data or create records. Re-running the same request could repeat them. */
const WRITE_TOOLS = new Set(['create_lead', 'update_lead', 'draft_email', 'request_approval'])

export function usedWriteTool(blocks: Block[] | null): boolean {
  const activity = blocks?.find((b): b is Extract<Block, { type: 'activity' }> => b.type === 'activity')
  return !!activity?.tools.some((t) => WRITE_TOOLS.has(t.name) && t.status === 'ok')
}

/** Short, deterministic follow-ups based on what the answer showed. */
export function followUps(blocks: Block[] | null): string[] {
  const types = new Set((blocks ?? []).map((b) => b.type))
  if (types.has('leads')) return ['Prepare follow-up emails for these leads', 'Which of these leads are high priority?']
  if (types.has('sales_summary') || types.has('analytics_result')) return ['Which city generated the most revenue?', 'Show our monthly sales trends']
  if (types.has('lead_analytics')) return ['Find high-priority leads not contacted in 7 days']
  if (types.has('email_drafts') || types.has('approval_requests')) return ['What is waiting for my approval?']
  if (types.has('sources')) return ['Summarise the key points in one paragraph']
  return []
}

export default function MessageActions({
  text,
  canRegenerate,
  regenerateNote,
  onRegenerate,
  onToast,
}: {
  text: string
  canRegenerate: boolean
  /** Shown instead of the button when regenerating is not offered. */
  regenerateNote?: string
  onRegenerate: () => void
  onToast: (msg: string, kind: 'success' | 'error') => void
}) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      onToast('Could not copy. Your browser blocked clipboard access.', 'error')
    }
  }
  const btn = 'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-slate-500 transition hover:bg-navy-700 hover:text-slate-200'
  return (
    <div className="flex flex-wrap items-center gap-1">
      <button type="button" onClick={copy} className={btn} aria-label="Copy answer">
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
        {copied ? 'Copied' : 'Copy'}
      </button>
      {canRegenerate ? (
        <button type="button" onClick={onRegenerate} className={btn} aria-label="Regenerate answer">
          <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Regenerate
        </button>
      ) : (
        regenerateNote && <span className="px-2 text-xs text-slate-600">{regenerateNote}</span>
      )}
    </div>
  )
}