import { useMutation } from '@tanstack/react-query'
import { FileText, Info, Sparkles } from 'lucide-react'
import { Fragment, useState, type FormEvent } from 'react'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { inputClass } from '../ui/Field'
import { documentsApi, errorMessage } from '../../lib/api'
import type { AskResponse, Citation } from '../../lib/types'

const examples = ['What is our refund policy?', 'How long does shipping take?', 'What does the warranty cover?']

const notFoundHint: Record<NonNullable<AskResponse['reason']>, string> = {
  no_sources: 'Nothing in your indexed documents was similar enough to this question.',
  insufficient: 'The passages we found do not contain the answer.',
  ungrounded: 'The AI produced an answer it could not back with a source, so it was discarded.',
}

function where(c: Citation) {
  return c.page_number !== null ? `Page ${c.page_number}` : `Section ${c.chunk_index + 1}`
}

/** Renders the answer as plain text and turns [1] markers into links to the matching source.
 *  The answer comes from an AI reading untrusted documents, so it is never rendered as HTML. */
function AnswerText({ text }: { text: string }) {
  const parts = text.split(/(\[\d+\])/g)
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-100">
      {parts.map((part, i) => {
        const m = /^\[(\d+)\]$/.exec(part)
        return m ? (
          <a
            key={i}
            href={`#source-${m[1]}`}
            aria-label={`Source ${m[1]}`}
            className="mx-0.5 rounded bg-brand/25 px-1 align-baseline text-xs font-semibold text-violet-200 hover:bg-brand/40"
          >
            {m[1]}
          </a>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        )
      })}
    </p>
  )
}

export default function AskPanel({ disabled }: { disabled: boolean }) {
  const [question, setQuestion] = useState('')
  const ask = useMutation({ mutationFn: (q: string) => documentsApi.ask(q) })
  const data = ask.data

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (question.trim().length >= 3) ask.mutate(question.trim())
  }

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-brand" aria-hidden />
        <h2 className="text-sm font-semibold text-slate-200">Ask your documents</h2>
      </div>
      <p className="mt-0.5 text-xs text-slate-500">
        Answers use only your uploaded documents and always show their sources. If the answer isn’t there, it says so.
      </p>

      <form onSubmit={submit} className="mt-4 flex gap-2">
        <input
          aria-label="Ask a question"
          placeholder="e.g. How long do customers have to return a product?"
          maxLength={500}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          className={`${inputClass} flex-1`}
        />
        <Button type="submit" disabled={question.trim().length < 3 || ask.isPending || disabled}>
          {ask.isPending ? 'Thinking…' : 'Ask'}
        </Button>
      </form>

      {!data && !ask.isPending && !ask.isError && (
        <div className="mt-3 flex flex-wrap gap-2">
          {examples.map((ex) => (
            <button
              key={ex}
              type="button"
              disabled={disabled}
              onClick={() => setQuestion(ex)}
              className="rounded-full border border-line px-3 py-1 text-xs text-slate-400 hover:border-brand/60 hover:text-slate-200 disabled:opacity-40"
            >
              {ex}
            </button>
          ))}
        </div>
      )}
      {disabled && <p className="mt-2 text-xs text-slate-500">Asking becomes available once a document is ready.</p>}

      {ask.isPending && (
        <p className="mt-4 text-sm text-slate-400" role="status">
          Searching your documents and writing an answer…
        </p>
      )}
      {ask.isError && (
        <p role="alert" className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {errorMessage(ask.error, 'Could not get an answer.')}
        </p>
      )}

      {data && (
        <div className="mt-4 space-y-4" aria-live="polite">
          {data.found ? (
            <div className="rounded-xl border border-brand/30 bg-brand/5 p-4">
              <AnswerText text={data.answer} />
            </div>
          ) : (
            <div className="flex gap-3 rounded-xl border border-line bg-navy-900/60 p-4">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden />
              <div>
                <p className="text-sm font-medium text-slate-100">{data.answer}</p>
                {data.reason && <p className="mt-1 text-xs text-slate-500">{notFoundHint[data.reason]}</p>}
                <p className="mt-1 text-xs text-slate-500">Try rephrasing, or upload the document that covers this.</p>
              </div>
            </div>
          )}

          {data.citations.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Sources</h3>
              <ol className="mt-2 space-y-2">
                {data.citations.map((c) => (
                  <li key={c.chunk_id} id={`source-${c.number}`} className="scroll-mt-24 rounded-xl border border-line bg-navy-900/60 p-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="grid h-5 w-5 place-items-center rounded bg-brand/25 font-semibold text-violet-200">{c.number}</span>
                      <FileText className="h-3.5 w-3.5 text-slate-500" aria-hidden />
                      <span className="font-medium text-slate-200">{c.filename}</span>
                      <span className="text-slate-400">· {where(c)}</span>
                      <span className="ml-auto text-slate-500">{Math.round(c.score * 100)}% match</span>
                    </div>
                    <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-xs text-slate-400">{c.snippet}</p>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {data.model && (
            <p className="text-xs text-slate-600">
              {data.model} · {(data.latency_ms / 1000).toFixed(1)}s
              {data.prompt_tokens !== null && ` · ${data.prompt_tokens + (data.completion_tokens ?? 0)} tokens`}
            </p>
          )}
        </div>
      )}
    </Card>
  )
}