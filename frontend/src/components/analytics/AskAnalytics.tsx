import { useMutation } from '@tanstack/react-query'
import { Loader2, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { analyticsApi, errorMessage } from '../../lib/api'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { inputClass } from '../ui/Field'
import Markdown from '../assistant/Markdown'
import AnalyticsResultView from './AnalyticsResultView'

const EXAMPLES = [
  'What was our revenue last month?',
  'Which city generated the highest revenue?',
  'Which salesperson has the highest conversion rate?',
  'Why did our sales decrease?',
  'Show our monthly sales trends.',
]

export default function AskAnalytics() {
  const [question, setQuestion] = useState('')
  const ask = useMutation({ mutationFn: (q: string) => analyticsApi.ask(q) })
  const submit = (q: string) => {
    const text = q.trim()
    if (text.length >= 3 && !ask.isPending) ask.mutate(text)
  }
  const data = ask.data

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-electric" aria-hidden />
        <h2 className="font-medium">Ask about your business</h2>
      </div>
      <form
        className="mt-3 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault()
          submit(question)
        }}
      >
        <input
          aria-label="Analytics question"
          className={inputClass}
          maxLength={500}
          placeholder="e.g. Which city generated the highest revenue?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <Button type="submit" disabled={ask.isPending || question.trim().length < 3}>
          {ask.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Ask
        </Button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {EXAMPLES.map((e) => (
          <button
            key={e}
            type="button"
            disabled={ask.isPending}
            onClick={() => {
              setQuestion(e)
              submit(e)
            }}
            className="rounded-full border border-line px-3 py-1 text-xs text-slate-300 transition hover:bg-navy-700 disabled:opacity-50"
          >
            {e}
          </button>
        ))}
      </div>

      <div aria-live="polite" className="mt-4 space-y-3">
        {ask.isPending && <p className="text-sm text-slate-400">Calculating…</p>}
        {ask.isError && (
          <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {errorMessage(ask.error, 'Could not answer that question.')}
          </p>
        )}
        {data && (
          <>
            {data.answer && <Markdown text={data.answer} messageId={data.run_id} />}
            {data.results.map((r, i) => (
              <AnalyticsResultView key={i} result={r} />
            ))}
            {data.results.length === 0 && data.tools.some((t) => t.status !== 'ok') && (
              <p className="text-xs text-slate-500">The question could not be calculated as asked.</p>
            )}
            <p className="text-xs text-slate-500">
              Numbers come from your data through read-only, approved queries · trace {data.trace_id.slice(0, 8)}
            </p>
          </>
        )}
      </div>
    </Card>
  )
}