import { useMutation } from '@tanstack/react-query'
import { MessageSquareText, Send, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { errorMessage, leadsApi } from '../../lib/api'
import type { ChatTurn } from '../../lib/types'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { inputClass } from '../ui/Field'

const SUGGESTIONS = ['Summarize this lead', 'What should I do next?', 'When did we last talk?', 'Any open tasks?']

/** Ask about one lead. Read-only: the AI sees this lead's own facts (no email or phone) and cannot change anything. */
export default function LeadChat({ leadId, leadName }: { leadId: string; leadName: string }) {
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const end = useRef<HTMLDivElement>(null)

  const ask = useMutation({
    mutationFn: ({ q, history }: { q: string; history: ChatTurn[] }) => leadsApi.ask(leadId, q, history),
    onSuccess: (r) => setTurns((t) => [...t, { role: 'assistant', content: r.answer }]),
    onError: (e) => setError(errorMessage(e, 'Could not get an answer. Please try again.')),
  })

  useEffect(() => {
    end.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
  }, [turns.length, ask.isPending])

  const send = (q: string) => {
    const question = q.trim()
    if (!question || ask.isPending) return
    setError(null)
    const history = turns.slice(-6)
    setTurns((t) => [...t, { role: 'user', content: question }])
    setText('')
    ask.mutate({ q: question, history })
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    send(text)
  }

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <MessageSquareText className="h-4 w-4 text-electric" aria-hidden /> Ask about {leadName}
        </h2>
        {turns.length > 0 && (
          <button className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white" onClick={() => { setTurns([]); setError(null) }}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden /> Clear
          </button>
        )}
      </div>

      {turns.length === 0 ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Suggested questions">
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => send(s)} className="rounded-full border border-line px-3 py-1 text-xs text-slate-300 transition hover:border-brand hover:text-white">
              {s}
            </button>
          ))}
        </div>
      ) : (
        <ul className="max-h-80 space-y-3 overflow-y-auto pr-1" aria-live="polite">
          {turns.map((t, i) => (
            <li key={i} className={t.role === 'user' ? 'flex justify-end' : ''}>
              <p className={`max-w-[92%] whitespace-pre-wrap break-words rounded-xl px-3 py-2 text-sm ${t.role === 'user' ? 'bg-brand/20' : 'border border-line bg-navy-950'}`}>{t.content}</p>
            </li>
          ))}
          {ask.isPending && <li className="text-sm text-slate-500" aria-busy="true">Thinking…</li>}
          <div ref={end} />
        </ul>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-400">
          {error}
        </p>
      )}

      <form onSubmit={submit} className="mt-3 flex gap-2">
        <input aria-label={`Ask a question about ${leadName}`} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask anything about this lead…" className={inputClass} />
        <Button type="submit" aria-label="Send question" disabled={!text.trim() || ask.isPending} className="shrink-0">
          <Send className="h-4 w-4" aria-hidden />
        </Button>
      </form>
      <p className="mt-2 text-xs text-slate-500">Answers use this lead&apos;s notes, tasks and activity only. Email and phone are never sent to the AI.</p>
    </Card>
  )
}