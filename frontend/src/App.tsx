import { Suspense, lazy } from 'react'
import { Route, Routes } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'
import ProtectedRoute from './components/ProtectedRoute'
import ComingSoon from './pages/ComingSoon'
import LeadDetail from './pages/LeadDetail'
import Knowledge from './pages/Knowledge'
import Leads from './pages/Leads'
import Login from './pages/Login'
import Signup from './pages/Signup'

// Chart pages pull in Recharts (large), so they load only when visited.
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Analytics = lazy(() => import('./pages/Analytics'))

const placeholders = [
  { path: 'assistant', title: 'AI Assistant' },
  { path: 'workflows', title: 'Workflows' },
  { path: 'approvals', title: 'Approvals' },
  { path: 'settings', title: 'Settings' },
]

export default function App() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-500">Loading…</div>}>
    <Routes>
      <Route path="login" element={<Login />} />
      <Route path="signup" element={<Signup />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="knowledge" element={<Knowledge />} />
          <Route path="leads" element={<Leads />} />
          <Route path="leads/:id" element={<LeadDetail />} />
          {placeholders.map((p) => (
            <Route key={p.path} path={p.path} element={<ComingSoon title={p.title} />} />
          ))}
          <Route path="*" element={<ComingSoon title="Page not found" />} />
        </Route>
      </Route>
    </Routes>
    </Suspense>
  )
}