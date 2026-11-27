import { Suspense, lazy } from 'react'
import { Route, Routes } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'
import ProtectedRoute from './components/ProtectedRoute'
import ComingSoon from './pages/ComingSoon'
import LeadDetail from './pages/LeadDetail'
import Approvals from './pages/Approvals'
import Emails from './pages/Emails'
import Knowledge from './pages/Knowledge'
import Workflows from './pages/Workflows'
import Leads from './pages/Leads'
import ForgotPassword from './pages/ForgotPassword'
import Landing from './pages/Landing'
import Login from './pages/Login'
import ResetPassword from './pages/ResetPassword'
import Settings from './pages/Settings'
import Reports from './pages/Reports'
import Tasks from './pages/Tasks'
import Signup from './pages/Signup'

// Chart pages pull in Recharts (large), so they load only when visited.
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Analytics = lazy(() => import('./pages/Analytics'))
const Observability = lazy(() => import('./pages/Observability'))
const Assistant = lazy(() => import('./pages/Assistant')) // pulls in the markdown renderer and charts

export default function App() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-500">Loading…</div>}>
    <Routes>
      <Route index element={<Landing />} />
      <Route path="login" element={<Login />} />
      <Route path="signup" element={<Signup />} />
      <Route path="forgot-password" element={<ForgotPassword />} />
      <Route path="reset-password" element={<ResetPassword />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="assistant" element={<Assistant />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="knowledge" element={<Knowledge />} />
          <Route path="emails" element={<Emails />} />
          <Route path="workflows" element={<Workflows />} />
          <Route path="observability" element={<Observability />} />
          <Route path="approvals" element={<Approvals />} />
          <Route path="leads" element={<Leads />} />
          <Route path="leads/:id" element={<LeadDetail />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<ComingSoon title="Page not found" />} />
        </Route>
      </Route>
    </Routes>
    </Suspense>
  )
}