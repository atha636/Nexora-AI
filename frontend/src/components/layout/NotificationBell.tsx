import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCheck, CheckSquare, FileText, GitBranch, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { notificationsApi } from '../../lib/api'
import { timeAgo } from '../../lib/format'
import type { AppNotification } from '../../lib/types'
import { useToast } from '../ui/Toast'

const POLL_MS = 30_000

function iconFor(kind: string) {
  if (kind.endsWith('.failed') || kind === 'approval.rejected') return { Icon: TriangleAlert, tone: 'text-amber-300 bg-amber-500/10' }
  if (kind.startsWith('workflow')) return { Icon: GitBranch, tone: 'text-brand bg-brand/10' }
  if (kind.startsWith('document')) return { Icon: FileText, tone: 'text-brand bg-brand/10' }
  return { Icon: CheckSquare, tone: 'text-brand bg-brand/10' }
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const lastUnread = useRef<number | null>(null)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()

  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: notificationsApi.list,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
  })
  const unread = data?.unread ?? 0

  // A toast when something new arrives while you are working (not for the ones already waiting at sign-in).
  useEffect(() => {
    if (!data) return
    if (lastUnread.current !== null && data.unread > lastUnread.current) {
      const newest = data.items.find((n) => !n.read_at)
      if (newest) toast.success(newest.title)
    }
    lastUnread.current = data.unread
  }, [data, toast])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['notifications'] })
  const readOne = useMutation({ mutationFn: notificationsApi.read, onSuccess: refresh })
  const readAll = useMutation({ mutationFn: notificationsApi.readAll, onSuccess: refresh })

  const openItem = (n: AppNotification) => {
    if (!n.read_at) readOne.mutate(n.id)
    setOpen(false)
    if (n.link) navigate(n.link)
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-md p-2 text-slate-400 hover:bg-navy-700 hover:text-white"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 grid min-w-[1.1rem] place-items-center rounded-full bg-brand px-1 text-[10px] font-bold leading-[1.1rem] text-black">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-line bg-navy-900 shadow-2xl shadow-black/50"
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-sm font-medium">Notifications</h2>
            <button
              onClick={() => readAll.mutate()}
              disabled={unread === 0 || readAll.isPending}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-white disabled:opacity-40"
            >
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </button>
          </div>

          {!data || data.items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-500">
              {data ? "You're all caught up." : 'Loading…'}
            </p>
          ) : (
            <ul className="max-h-[26rem] divide-y divide-line overflow-y-auto">
              {data.items.map((n) => {
                const { Icon, tone } = iconFor(n.kind)
                return (
                  <li key={n.id}>
                    <button onClick={() => openItem(n)} className="flex w-full gap-3 px-4 py-3 text-left hover:bg-navy-800">
                      <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${tone}`}>
                        <Icon className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-sm ${n.read_at ? 'text-slate-400' : 'font-medium text-slate-100'}`}>{n.title}</span>
                        {n.body && <span className="mt-0.5 block truncate text-xs text-slate-500">{n.body}</span>}
                        <span className="mt-1 block text-[11px] text-slate-600">{timeAgo(n.created_at)}</span>
                      </span>
                      {!n.read_at && <span aria-label="Unread" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand" />}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}