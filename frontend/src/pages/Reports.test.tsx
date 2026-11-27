import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const st = vi.hoisted(() => ({ role: 'employee', exported: [] as string[], saved: [] as string[], fail: false }))
const report = {
  organization: 'Acme Co', months: 6, period_start: '2026-06', period_end: '2026-11', generated_at: '2026-11-27T05:00:00Z',
  period: { new_leads: 40, won_of_new: 10, conversion_rate: 25, revenue: 500000, deals: 5, average_deal: 100000 },
  tasks: { open: 7, overdue: 2, completed_in_period: 12 },
  monthly_revenue: [{ month: '2026-11', revenue: 500000, deals: 5 }],
  acquisition: [{ month: '2026-11', created: 40, won: 10, conversion_rate: 25 }],
  revenue_by_city: [{ label: 'Delhi', revenue: 300000, deals: 3 }],
  by_salesperson: [{ id: 'u1', name: 'Eve Sales', revenue: 500000, deals: 5, leads_assigned: 20, leads_won: 10, conversion_rate: 50 }],
  leads_by_status: [{ label: 'new', count: 20 }], leads_by_source: [{ label: 'referral', count: 9 }], leads_by_city: [{ label: 'Pune', count: 11 }],
}
vi.mock('../lib/api', () => ({
  errorMessage: (_e: unknown, f: string) => f,
  reportsApi: {
    summary: async () => {
      if (st.fail) throw new Error('x')
      return report
    },
    exportCsv: async (kind: string) => {
      st.exported.push(kind)
      return { blob: new Blob(['a']), name: `nexora-${kind}.csv` }
    },
  },
}))
vi.mock('../lib/auth', () => ({ useAuth: () => ({ can: (r: string) => (r === 'manager' ? st.role !== 'employee' : true) }) }))
vi.mock('../lib/download', () => ({ saveBlob: (_b: Blob, n: string) => st.saved.push(n) }))
vi.mock('../components/ui/Toast', () => ({ useToast: () => ({ success: () => {}, error: () => {} }) }))
vi.mock('../components/charts/Charts', () => ({ RevenueChart: () => <div>revenue chart</div> }))

import Reports from './Reports'

const setup = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Reports />
    </QueryClientProvider>,
  )

beforeEach(() => {
  st.role = 'employee'
  st.exported = []
  st.saved = []
  st.fail = false
  window.print = vi.fn()
})

describe('Reports', () => {
  it('shows the period figures and tables', async () => {
    setup()
    expect(await screen.findByText('New leads')).toBeInTheDocument()
    expect(screen.getAllByText('40').length).toBeGreaterThan(0)
    expect(screen.getByText('25%')).toBeInTheDocument()
    expect(screen.getByText('Eve Sales')).toBeInTheDocument()
    expect(screen.getByText('Delhi')).toBeInTheDocument()
    expect(screen.getAllByText(/Acme Co/).length).toBeGreaterThan(0)
  })

  it('opens the print dialog for the PDF', async () => {
    setup()
    await userEvent.click(await screen.findByRole('button', { name: /download pdf/i }))
    expect(window.print).toHaveBeenCalled()
  })

  it('hides CSV exports from employees and explains why', async () => {
    setup()
    await screen.findByText('New leads')
    expect(screen.queryByRole('button', { name: /leads csv/i })).toBeNull()
    expect(screen.getByText(/available to managers and above/i)).toBeInTheDocument()
  })

  it('lets managers export both CSVs', async () => {
    st.role = 'manager'
    setup()
    await userEvent.click(await screen.findByRole('button', { name: /leads csv/i }))
    await waitFor(() => expect(st.saved).toEqual(['nexora-leads.csv']))
    await userEvent.click(screen.getByRole('button', { name: /sales csv/i }))
    await waitFor(() => expect(st.exported).toEqual(['leads', 'sales']))
  })

  it('shows an error with retry when the report cannot load', async () => {
    st.fail = true
    setup()
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the report')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})