import { MessageSquare, Plus, Trash2 } from 'lucide-react'
import { Skeleton } from '../ui/Card'
import { timeAgo } from '../../lib/format'
import type { ConversationSummary } from '../../lib/types'

export default function ConversationSidebar({
  conversations,
  loading,
  error,
  activeId,
  disabled,
  onSelect,
  onNew,
  onDelete,
}: {
  conversations: ConversationSummary[]
  loading: boolean
  error: boolean
  activeId: string | null
  disabled: boolean
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (c: ConversationSummary) => void
}) {
  return (
    <nav aria-label="Conversations" className="flex h-full flex-col">
      <button
        type="button"
        onClick={onNew}
        disabled={disabled}
        className="m-3 flex items-center justify-center gap-2 rounded-lg border border-line px-3 py-2 text-sm font-medium text-slate-200 hover:bg-navy-700 disabled:opacity-50"
      >
        <Plus className="h-4 w-4" aria-hidden /> New conversation
      </button>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {loading ? (
          <div className="space-y-2 p-1" aria-busy="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : error ? (
          <p role="alert" className="px-2 py-4 text-xs text-red-400">
            Could not load conversations.
          </p>
        ) : conversations.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-slate-500">Your conversations will appear here.</p>
        ) : (
          <ul className="space-y-0.5">
            {conversations.map((c) => (
              <li key={c.id} className="group relative">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelect(c.id)}
                  aria-current={c.id === activeId ? 'true' : undefined}
                  className={`flex w-full items-start gap-2 rounded-lg px-3 py-2 pr-9 text-left text-sm transition disabled:opacity-60 ${
                    c.id === activeId ? 'bg-brand/20 text-white' : 'text-slate-300 hover:bg-navy-700'
                  }`}
                >
                  <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate">{c.title}</span>
                    <span className="block text-xs text-slate-500">{timeAgo(c.updated_at)}</span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Delete conversation ${c.title}`}
                  disabled={disabled}
                  onClick={() => onDelete(c)}
                  className="absolute right-1.5 top-2 rounded p-1.5 text-slate-500 opacity-100 hover:bg-navy-600 hover:text-red-400 focus:opacity-100 disabled:opacity-40 lg:opacity-0 lg:group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </nav>
  )
}