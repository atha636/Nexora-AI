import { useQuery } from '@tanstack/react-query'
import {
  Activity, BarChart3, BookOpen, CheckSquare, FileText, GitBranch, LayoutDashboard, LogOut, Mail,
  ListChecks, MessageSquare, Moon, Plus, Sparkles, Search, Settings, Sun, User, Users, type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../../hooks/useTheme'
import { TOUR_EVENT } from './ProductTour'
import { documentsApi, leadsApi } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { ROLE_RANK, type Role } from '../../lib/types'

interface Item {
  id: string
  group: 'Go to' | 'Actions' | 'Leads' | 'Documents'
  label: string
  hint?: string
  icon: LucideIcon
  run: () => void
  keywords?: string
}

const PAGES: { to: string; label: string; icon: LucideIcon; minRole?: Role; keywords?: string }[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, keywords: 'home overview kpi' },
  { to: '/assistant', label: 'AI Assistant', icon: MessageSquare, keywords: 'chat agent ask' },
  { to: '/leads', label: 'CRM leads', icon: Users, keywords: 'customers pipeline' },
  { to: '/tasks', label: 'Tasks', icon: ListChecks, keywords: 'follow up reminders todo overdue' },
  { to: '/knowledge', label: 'Knowledge', icon: BookOpen, keywords: 'documents rag upload' },
  { to: '/analytics', label: 'Analytics', icon: BarChart3, keywords: 'revenue charts sales' },
  { to: '/workflows', label: 'Workflows', icon: GitBranch, keywords: 'automation' },
  { to: '/emails', label: 'Emails', icon: Mail, keywords: 'drafts' },
  { to: '/approvals', label: 'Approvals', icon: CheckSquare, keywords: 'pending review' },
  { to: '/observability', label: 'Observability', icon: Activity, minRole: 'manager', keywords: 'logs traces runs' },
  { to: '/settings', label: 'Settings', icon: Settings, keywords: 'profile team password organization' },
]

/** Ctrl/Cmd+K: jump to a page, run a quick action, or search leads and documents. */
export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const { user, can, logout } = useAuth()
  const { theme, toggle } = useTheme()
  const [text, setText] = useState('')
  const [debounced, setDebounced] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (open) {
      setText('')
      setDebounced('')
      setActive(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])
  useEffect(() => {
    const t = setTimeout(() => setDebounced(text.trim()), 250)
    return () => clearTimeout(t)
  }, [text])

  const searching = open && debounced.length >= 2
  const leads = useQuery({
    queryKey: ['palette-leads', debounced],
    queryFn: () => leadsApi.list({ q: debounced, sort: 'name', order: 'asc', page: 1, page_size: 5 }),
    enabled: searching,
  })
  // The documents list is small and probably cached already, so filter it here instead of hitting the server.
  const docs = useQuery({ queryKey: ['documents'], queryFn: documentsApi.list, enabled: open, staleTime: 60_000 })

  const go = (to: string) => () => {
    onClose()
    navigate(to)
  }

  const items = useMemo<Item[]>(() => {
    const q = text.trim().toLowerCase()
    const match = (s: string) => !q || s.toLowerCase().includes(q)
    const out: Item[] = []
    for (const p of PAGES) {
      if (p.minRole && !(user && ROLE_RANK[user.role] >= ROLE_RANK[p.minRole])) continue
      if (match(`${p.label} ${p.keywords ?? ''}`)) out.push({ id: p.to, group: 'Go to', label: p.label, icon: p.icon, run: go(p.to) })
    }
    const actions: Item[] = [
      ...(can('employee') ? [{ id: 'new-lead', group: 'Actions' as const, label: 'Add a new lead', icon: Plus, keywords: 'create', run: go('/leads?new=1') }] : []),
      { id: 'ask', group: 'Actions', label: 'Ask the AI assistant', icon: MessageSquare, keywords: 'chat', run: go('/assistant') },
      { id: 'theme', group: 'Actions', label: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme', icon: theme === 'dark' ? Sun : Moon, keywords: 'appearance', run: () => { toggle(); onClose() } },
      { id: 'tour', group: 'Actions', label: 'Take the product tour', icon: Sparkles, keywords: 'help guide walkthrough demo', run: () => { onClose(); setTimeout(() => window.dispatchEvent(new Event(TOUR_EVENT)), 150) } },
      { id: 'profile', group: 'Actions', label: 'Edit my profile', icon: User, keywords: 'account name', run: go('/settings') },
      { id: 'logout', group: 'Actions', label: 'Sign out', icon: LogOut, run: () => { onClose(); void logout() } },
    ]
    out.push(...actions.filter((a) => match(`${a.label} ${a.keywords ?? ''}`)))
    if (searching) {
      for (const l of leads.data?.items ?? [])
        out.push({ id: `lead-${l.id}`, group: 'Leads', label: l.name, hint: [l.company, l.city].filter(Boolean).join(' · '), icon: Users, run: go(`/leads/${l.id}`) })
      for (const d of (docs.data ?? []).filter((d) => match(d.filename)).slice(0, 4))
        out.push({ id: `doc-${d.id}`, group: 'Documents', label: d.filename, icon: FileText, run: go('/knowledge') })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, user, theme, searching, leads.data, docs.data])

  useEffect(() => setActive(0), [text, leads.data])
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' })
  }, [active])

  if (!open) return null

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => (items.length ? (a + 1) % items.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => (items.length ? (a - 1 + items.length) % items.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      items[active]?.run()
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  let lastGroup = ''
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]" role="presentation">
      <button aria-label="Close command palette" className="absolute inset-0 cursor-default bg-black/70" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Command palette" onKeyDown={onKey} className="nx-page relative w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-navy-900 shadow-2xl">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="h-4 w-4 text-slate-500" aria-hidden />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={items[active] ? `pal-${items[active].id}` : undefined}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search pages, leads, documents, actions…"
            style={{ outline: "none", boxShadow: "none" }}
            className="h-12 min-w-0 flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-500"
          />
          <kbd className="rounded border border-line px-1.5 py-0.5 text-[10px] text-slate-500">Esc</kbd>
        </div>
        <ul id="palette-list" role="listbox" ref={listRef} className="max-h-[50vh] overflow-y-auto p-2">
          {items.map((it, i) => {
            const header = it.group !== lastGroup
            lastGroup = it.group
            const Icon = it.icon
            return (
              <li key={it.id} role="presentation">
                {header && <p className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">{it.group}</p>}
                <div
                  id={`pal-${it.id}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseMove={() => setActive(i)}
                  onClick={it.run}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm ${i === active ? 'bg-brand/15 text-white' : 'text-slate-300'}`}
                >
                  <Icon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                  <span className="truncate">{it.label}</span>
                  {it.hint && <span className="ml-auto truncate text-xs text-slate-500">{it.hint}</span>}
                </div>
              </li>
            )
          })}
          {items.length === 0 && (
            <li className="px-3 py-8 text-center text-sm text-slate-500">{leads.isFetching ? 'Searching…' : `Nothing matches “${text}”.`}</li>
          )}
        </ul>
        <div className="flex items-center gap-4 border-t border-line px-4 py-2 text-[11px] text-slate-500">
          <span><kbd className="rounded border border-line px-1">↑</kbd> <kbd className="rounded border border-line px-1">↓</kbd> to move</span>
          <span><kbd className="rounded border border-line px-1">Enter</kbd> to open</span>
          {searching && leads.isFetching && <span className="ml-auto">Searching leads…</span>}
        </div>
      </div>
    </div>
  )
}