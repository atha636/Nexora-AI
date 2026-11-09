import { Route, Routes } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'
import ComingSoon from './pages/ComingSoon'
import Dashboard from './pages/Dashboard'

const placeholders = [
  { path: 'assistant', title: 'AI Assistant' },
  { path: 'leads', title: 'CRM' },
  { path: 'knowledge', title: 'Knowledge' },
  { path: 'analytics', title: 'Analytics' },
  { path: 'workflows', title: 'Workflows' },
  { path: 'approvals', title: 'Approvals' },
  { path: 'settings', title: 'Settings' },
]

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Dashboard />} />
        {placeholders.map((p) => (
          <Route key={p.path} path={p.path} element={<ComingSoon title={p.title} />} />
        ))}
      </Route>
    </Routes>
  )
}
