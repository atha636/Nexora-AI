import { Logo } from '../ui/Logo'
import CommandPalette from './CommandPalette'
import NotificationBell from './NotificationBell'
import { ThemeToggle } from '../ui/ThemeToggle'
import {
  BarChart3,
  BookOpen,
  CheckSquare,
  GitBranch,
  LayoutDashboard,
  LogOut,
  Mail,
  Activity,
  Menu,
  Settings,
  Users,
  X,
  MessageSquare,
  Search,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { approvalsApi } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { ROLE_RANK } from '../../lib/types'

const nav = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/assistant', label: 'AI Assistant', icon: MessageSquare },
  { to: '/leads', label: 'CRM', icon: Users },
  { to: '/knowledge', label: 'Knowledge', icon: BookOpen },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/workflows', label: 'Workflows', icon: GitBranch },
  { to: '/emails', label: 'Emails', icon: Mail },
  { to: '/approvals', label: 'Approvals', icon: CheckSquare },
  { to: '/observability', label: 'Observability', icon: Activity, minRole: 'manager' as const },
  { to: '/settings', label: 'Settings', icon: Settings },
]

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pending = useQuery({ queryKey: ['approvals', 'pending'], queryFn: () => approvalsApi.list('pending'), refetchInterval: 60_000 })
  const { user } = useAuth()
  const pendingCount = pending.data?.pending ?? 0
  return (
    <nav aria-label="Main" className="flex h-full flex-col gap-1 p-4">
      <div className="mb-6 flex items-center gap-2 px-2">
        <Logo size={36} />
        <span className="text-lg font-semibold tracking-tight">Nexora AI</span>
      </div>
      {nav.filter((n) => !n.minRole || (user && ROLE_RANK[user.role] >= ROLE_RANK[n.minRole])).map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/dashboard'}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-brand/20 text-white'
                : 'text-slate-400 hover:bg-navy-700 hover:text-white'
            }`
          }
        >
          <Icon className="h-4 w-4" aria-hidden />
          {label}
          {to === '/approvals' && pendingCount > 0 && (
            <span aria-label={`${pendingCount} pending`} className="ml-auto rounded-full bg-amber-500/20 px-2 text-xs text-amber-300">
              {pendingCount}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

export default function AppLayout() {
  const [open, setOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const { user, logout } = useAuth()
  const location = useLocation()

  // Ctrl+K (Cmd+K on Mac) toggles the command palette from anywhere in the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex h-full">
      <aside className="hidden w-64 shrink-0 border-r border-line bg-navy-900 lg:block">
        <Sidebar />
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <button
            aria-label="Close menu"
            className="absolute inset-0 bg-black/60"
            onClick={() => setOpen(false)}
          />
          <aside className="relative h-full w-64 border-r border-line bg-navy-900">
            <button
              aria-label="Close menu"
              className="absolute right-3 top-4 rounded-md p-1 text-slate-400 hover:text-white"
              onClick={() => setOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
            <Sidebar onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-line bg-navy-900/60 px-4 backdrop-blur sm:px-6">
          <button
            aria-label="Open menu"
            className="rounded-md p-2 text-slate-300 hover:bg-navy-700 lg:hidden"
            onClick={() => setOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <button
            onClick={() => setPaletteOpen(true)}
            aria-label="Open command palette"
            className="hidden items-center gap-2 rounded-lg border border-line bg-navy-950 px-3 py-1.5 text-sm text-slate-500 transition hover:border-slate-500 hover:text-slate-300 sm:flex sm:w-72"
          >
            <Search className="h-4 w-4" aria-hidden />
            <span>Search or jump to…</span>
            <kbd className="ml-auto rounded border border-line px-1.5 py-0.5 text-[10px]">Ctrl K</kbd>
          </button>
          <div className="flex items-center gap-3">
            <button
              aria-label="Open command palette"
              onClick={() => setPaletteOpen(true)}
              className="rounded-md p-2 text-slate-400 hover:bg-navy-700 hover:text-white sm:hidden"
            >
              <Search className="h-5 w-5" />
            </button>
            <ThemeToggle />
            <NotificationBell />
            <div className="hidden text-right leading-tight sm:block">
              <p className="text-sm font-medium">{user?.full_name}</p>
              <p className="text-xs text-slate-500">
                {user?.organization.name} · {user?.role}
              </p>
            </div>
            <div
              aria-hidden
              className="grid h-8 w-8 place-items-center rounded-full bg-brand text-black text-xs font-semibold"
            >
              {user?.full_name.charAt(0).toUpperCase()}
            </div>
            <button
              aria-label="Sign out"
              title="Sign out"
              onClick={() => logout()}
              className="rounded-md p-2 text-slate-400 hover:bg-navy-700 hover:text-white"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div key={location.pathname} className="nx-page">
            <Outlet />
          </div>
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}