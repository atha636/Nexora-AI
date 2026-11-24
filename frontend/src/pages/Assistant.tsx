import { Logo } from '../components/ui/Logo'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, ArrowUp, BarChart3, BookOpen, Loader2, MessagesSquare, RotateCcw, Users, Zap, X, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ActivityBlock, ResultBlocks } from '../components/assistant/Blocks'
import ConversationSidebar from '../components/assistant/ConversationSidebar'
import Markdown from '../components/assistant/Markdown'
import MessageActions, { followUps, usedWriteTool } from '../components/assistant/MessageActions'
import { useTypewriter } from '../hooks/useTypewriter'
import { ConfirmDialog } from '../components/ui/Modal'
import { useToast } from '../components/ui/Toast'
import { agentApi, errorMessage } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { ChatMessage, ConversationDetail, ConversationSummary } from '../lib/types'

const SUGGESTION_GROUPS: { title: string; icon: LucideIcon; prompts: string[] }[] = [
  {
    title: 'Find leads',
    icon: Users,
    prompts: [
      'Find all high-priority leads from Delhi that have not been contacted in the last 7 days',
      'Show my newest leads from Mumbai',
    ],
  },
  {
    title: 'Understand the numbers',
    icon: BarChart3,
    prompts: ['How much revenue did we make over the last 6 months?', 'Which cities bring in the most leads?'],
  },
  {
    title: 'Ask your documents',
    icon: BookOpen,
    prompts: ['What does our refund policy say?', 'Summarise the main points in our uploaded documents'],
  },
  {
    title: 'Get work done',
    icon: Zap,
    prompts: ['Draft follow-up emails for high-priority leads not contacted this week', 'What is waiting for my approval?'],
  },
]

const MAX_LENGTH = 2000

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md border border-line bg-navy-700 px-4 py-2.5 text-sm text-slate-100">
        {text}
      </p>
    </div>
  )
}

function AssistantAvatar() {
  return (
    <span aria-hidden><Logo size={32} /></span>
  )
}

function AssistantMessage({
  message,
  animate,
  isLast,
  idle,
  prompt,
  onSend,
  onToast,
}: {
  message: ChatMessage
  /** True only for the answer that has just arrived. */
  animate: boolean
  isLast: boolean
  idle: boolean
  /** The question this answer responds to, used for Regenerate. */
  prompt: string | null
  onSend: (text: string) => void
  onToast: (msg: string, kind: 'success' | 'error') => void
}) {
  const { shown, done, skip } = useTypewriter(message.content, animate)
  const writes = usedWriteTool(message.blocks)
  const suggestions = isLast && idle && done ? followUps(message.blocks) : []
  return (
    <div className="flex gap-3">
      <AssistantAvatar />
      <div className="min-w-0 flex-1 space-y-3">
        <ActivityBlock blocks={message.blocks} />
        <div onClick={done ? undefined : skip} title={done ? undefined : 'Click to show the full answer'} className={done ? '' : 'cursor-pointer'}>
          <Markdown text={shown} messageId={message.id} />
          {!done && <span className="nx-caret ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 bg-brand" aria-hidden />}
        </div>
        {done && (
          <div className={animate ? 'nx-pop space-y-3' : 'space-y-3'}>
            <ResultBlocks blocks={message.blocks} messageId={message.id} />
            {isLast && (
              <MessageActions
                text={message.content}
                canRegenerate={idle && !writes && !!prompt}
                regenerateNote={writes ? 'This answer changed data, so it is not re-run.' : undefined}
                onRegenerate={() => prompt && onSend(prompt)}
                onToast={onToast}
              />
            )}
            {suggestions.length > 0 && (
              <div className="flex flex-wrap gap-2" aria-label="Suggested follow-ups">
                {suggestions.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => onSend(q)}
                    className="rounded-full border border-line px-3 py-1 text-xs text-slate-300 transition hover:border-brand/60 hover:text-white"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Thinking() {
  return (
    <div className="flex gap-3" role="status" aria-live="polite">
      <AssistantAvatar />
      <p className="flex items-center gap-2 pt-1.5 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Working on it… this can take a few seconds.
      </p>
    </div>
  )
}

export default function Assistant() {
  const { user } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [pendingText, setPendingText] = useState<string | null>(null)
  const [freshId, setFreshId] = useState<string | null>(null) // the answer that just arrived
  const [failure, setFailure] = useState<{ text: string; message: string } | null>(null)
  const [listOpen, setListOpen] = useState(false)
  const [deleting, setDeleting] = useState<ConversationSummary | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const conversations = useQuery({ queryKey: ['conversations'], queryFn: agentApi.conversations })
  const detail = useQuery({
    queryKey: ['conversation', activeId],
    queryFn: () => agentApi.conversation(activeId as string),
    enabled: activeId !== null,
  })

  const send = useMutation({
    mutationFn: ({ text, conversationId }: { text: string; conversationId: string | null }) =>
      agentApi.chat(text, conversationId),
    onSuccess: (res) => {
      queryClient.setQueryData<ConversationDetail>(['conversation', res.conversation.id], (old) => ({
        ...res.conversation,
        messages: [...(old?.messages ?? []), res.user_message, res.assistant_message],
      }))
      setActiveId(res.conversation.id)
      setFreshId(res.assistant_message.id)
      setPendingText(null)
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }) // agent runs and CRM changes show up there
      queryClient.invalidateQueries({ queryKey: ['leads'] })
    },
    onError: (e, vars) => {
      setPendingText(null)
      setFailure({ text: vars.text, message: errorMessage(e, 'The assistant could not answer. Please try again.') })
    },
  })

  const remove = useMutation({
    mutationFn: (id: string) => agentApi.remove(id),
    onSuccess: (_d, id) => {
      toast.success('Conversation deleted')
      if (id === activeId) {
        setActiveId(null)
        setFailure(null)
      }
      queryClient.removeQueries({ queryKey: ['conversation', id] })
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      setDeleting(null)
    },
    onError: (e) => {
      toast.error(errorMessage(e))
      setDeleting(null)
    },
  })

  const busy = send.isPending
  const messages = activeId ? (detail.data?.messages ?? []) : []
  const showEmpty = messages.length === 0 && pendingText === null && failure === null

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, pendingText, failure])

  function submit(text: string) {
    const clean = text.trim()
    if (!clean || busy) return
    setFailure(null)
    setPendingText(clean)
    setDraft('')
    send.mutate({ text: clean, conversationId: activeId })
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    submit(draft)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit(draft)
    }
  }

  function startNew() {
    setActiveId(null)
    setFailure(null)
    setPendingText(null)
    setListOpen(false)
    inputRef.current?.focus()
  }

  const name = user?.full_name.split(' ')[0]

  return (
    <div className="relative mx-auto flex h-[calc(100dvh-6rem)] max-w-6xl gap-4 sm:h-[calc(100dvh-7rem)]">
      {/* Conversation list: a side panel on large screens, an overlay on small ones. */}
      <aside
        className={`${listOpen ? 'flex' : 'hidden'} absolute inset-0 z-20 flex-col rounded-2xl border border-line bg-navy-900 lg:static lg:flex lg:w-64 lg:shrink-0 lg:bg-navy-800/50`}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3 lg:hidden">
          <span className="text-sm font-semibold">Conversations</span>
          <button aria-label="Close conversations" onClick={() => setListOpen(false)} className="rounded p-1 text-slate-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <ConversationSidebar
          conversations={conversations.data ?? []}
          loading={conversations.isLoading}
          error={conversations.isError}
          activeId={activeId}
          disabled={busy}
          onSelect={(id) => {
            setActiveId(id)
            setFailure(null)
            setListOpen(false)
          }}
          onNew={startNew}
          onDelete={setDeleting}
        />
      </aside>

      <section className="flex min-w-0 flex-1 flex-col rounded-2xl border border-line bg-navy-800/40">
        <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold">{activeId && detail.data ? detail.data.title : 'AI Assistant'}</h1>
            <p className="hidden text-xs text-slate-500 sm:block">Searches your leads, sales and documents. Answers come from your data.</p>
          </div>
          <button
            type="button"
            onClick={() => setListOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs text-slate-300 hover:bg-navy-700 lg:hidden"
          >
            <MessagesSquare className="h-4 w-4" aria-hidden /> History
          </button>
        </header>

        <div role="log" aria-label="Conversation" className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5">
          {activeId && detail.isLoading && (
            <p className="text-center text-sm text-slate-500" aria-busy="true">
              Loading conversation…
            </p>
          )}
          {activeId && detail.isError && (
            <p role="alert" className="text-center text-sm text-red-400">
              {errorMessage(detail.error, 'Could not load this conversation.')}{' '}
              <button className="underline" onClick={() => detail.refetch()}>
                Retry
              </button>
            </p>
          )}

          {showEmpty && !(activeId && (detail.isLoading || detail.isError)) && (
            <div className="grid place-items-center gap-5 py-6 text-center">
              <Logo size={56} />
              <div>
                <h2 className="text-xl font-semibold tracking-tight">How can I help, {name}?</h2>
                <p className="mt-1 text-sm text-slate-400">Ask in plain English. I can look things up and make simple CRM changes for you.</p>
              </div>
              <div className="grid w-full max-w-2xl gap-3 text-left sm:grid-cols-2">
                {SUGGESTION_GROUPS.map(({ title, icon: Icon, prompts }) => (
                  <div key={title} className="rounded-xl border border-line bg-navy-900/60 p-3">
                    <p className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                      <Icon className="h-3.5 w-3.5 text-brand" aria-hidden /> {title}
                    </p>
                    <div className="space-y-1.5">
                      {prompts.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => submit(s)}
                          className="block w-full rounded-lg px-2 py-1.5 text-left text-sm text-slate-300 transition hover:bg-brand/10 hover:text-white"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) =>
            m.role === 'user' ? (
              <UserBubble key={m.id} text={m.content} />
            ) : (
              <AssistantMessage
                key={m.id}
                message={m}
                animate={m.id === freshId}
                isLast={i === messages.length - 1}
                idle={!busy && failure === null}
                prompt={messages[i - 1]?.role === 'user' ? messages[i - 1].content : null}
                onSend={submit}
                onToast={(msg, kind) => (kind === 'error' ? toast.error(msg) : toast.success(msg))}
              />
            ),
          )}

          {pendingText !== null && (
            <>
              <UserBubble text={pendingText} />
              <Thinking />
            </>
          )}

          {failure && (
            <>
              <UserBubble text={failure.text} />
              <div className="flex gap-3">
                <AssistantAvatar />
                <div role="alert" className="flex-1 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  <p className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    {failure.message}
                  </p>
                  <button
                    type="button"
                    onClick={() => submit(failure.text)}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-red-400/40 px-3 py-1 text-xs font-medium hover:bg-red-500/10"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Retry
                  </button>
                </div>
              </div>
            </>
          )}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={onSubmit} className="border-t border-line p-3">
          <div className="flex items-end gap-2 rounded-xl border border-line bg-navy-950 p-2 focus-within:border-electric">
            <textarea
              ref={inputRef}
              aria-label="Message the assistant"
              rows={1}
              maxLength={MAX_LENGTH}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask about your business…"
              className="max-h-32 min-h-[2.25rem] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-slate-100 outline-none placeholder:text-slate-500"
            />
            <button
              type="submit"
              aria-label="Send message"
              disabled={!draft.trim() || busy}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand text-black transition hover:bg-electric disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ArrowUp className="h-4 w-4" aria-hidden />}
            </button>
          </div>
          <p className="mt-1.5 hidden px-1 text-xs text-slate-600 sm:block">Enter to send · Shift+Enter for a new line · AI can make mistakes, so check important details.</p>
        </form>
      </section>

      <ConfirmDialog
        open={!!deleting}
        title="Delete conversation?"
        message={`“${deleting?.title}” and its messages will be permanently removed.`}
        busy={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}