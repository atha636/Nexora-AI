import {
  BarChart3,
  Bell,
  BookOpen,
  CheckSquare,
  GitBranch,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Sparkles,
  Users,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../lib/auth'

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/assistant', label: 'AI Assistant', icon: Sparkles },
  { to: '/leads', label: 'CRM', icon: Users },
  { to: '/knowledge', label: 'Knowledge', icon: BookOpen },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/workflows', label: 'Workflows', icon: GitBranch },
  { to: '/approvals', label: 'Approvals', icon: CheckSquare },
  { to: '/settings', label: 'Settings', icon: Settings },
]

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="flex h-full flex-col gap-1 p-4">
      <div className="mb-6 flex items-center gap-2 px-2">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand to-electric">
          <Sparkles className="h-5 w-5 text-white" aria-hidden />
        </div>
        <span className="text-lg font-semibold tracking-tight">Nexora AI</span>
      </div>
      {nav.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
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
        </NavLink>
      ))}
    </nav>
  )
}

export default function AppLayout() {
  const [open, setOpen] = useState(false)
  const { user, logout } = useAuth()

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
          <p className="hidden text-sm text-slate-400 sm:block">
            Your Intelligent AI Agent for Business Operations
          </p>
          <div className="flex items-center gap-3">
            <button aria-label="Notifications" className="rounded-md p-2 text-slate-400 hover:bg-navy-700 hover:text-white">
              <Bell className="h-5 w-5" />
            </button>
            <div className="hidden text-right leading-tight sm:block">
              <p className="text-sm font-medium">{user?.full_name}</p>
              <p className="text-xs text-slate-500">
                {user?.organization.name} · {user?.role}
              </p>
            </div>
            <div
              aria-hidden
              className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-brand to-electric text-xs font-semibold"
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
          <Outlet />
        </main>
      </div>
    </div>
  )
}