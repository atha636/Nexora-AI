import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { Skeleton } from './ui/Card'

export default function ProtectedRoute() {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="grid h-full place-items-center" aria-busy="true">
        <div className="w-64 space-y-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-56" />
          <p className="text-xs text-slate-500">Signing you in…</p>
        </div>
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}