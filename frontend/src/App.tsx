import { Route, Routes } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'
import ProtectedRoute from './components/ProtectedRoute'
import ComingSoon from './pages/ComingSoon'
import Dashboard from './pages/Dashboard'
import LeadDetail from './pages/LeadDetail'
import Leads from './pages/Leads'
import Login from './pages/Login'
import Signup from './pages/Signup'

const placeholders = [
  { path: 'assistant', title: 'AI Assistant' },
  { path: 'knowledge', title: 'Knowledge' },
  { path: 'analytics', title: 'Analytics' },
  { path: 'workflows', title: 'Workflows' },
  { path: 'approvals', title: 'Approvals' },
  { path: 'settings', title: 'Settings' },
]

export default function App() {
  return (
    <Routes>
      <Route path="login" element={<Login />} />
      <Route path="signup" element={<Signup />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="leads" element={<Leads />} />
          <Route path="leads/:id" element={<LeadDetail />} />
          {placeholders.map((p) => (
            <Route key={p.path} path={p.path} element={<ComingSoon title={p.title} />} />
          ))}
          <Route path="*" element={<ComingSoon title="Page not found" />} />
        </Route>
      </Route>
    </Routes>
  )
}