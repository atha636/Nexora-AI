import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const st = vi.hoisted(() => ({ updates: [] as string[], fail: false, rows: [] as Record<string, unknown>[] }))
const lead = (id: string, name: string, status: string) => ({
  id, name, status, priority: 'high', company: 'Acme', city: 'Delhi', email: null, phone: null, source: null,
  assigned_to: null, last_contacted_at: null, created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z',
})
vi.mock('../../lib/api', () => ({
  errorMessage: (_e: unknown, f: string) => f,
  leadsApi: {
    list: async () => ({ items: st.rows, total: st.rows.length, page: 1, page_size: 100 }),
    update: async (id: string, body: { status: string }) => {
      if (st.fail) throw new Error('nope')
      st.updates.push(`${id}:${body.status}`)
      st.rows = st.rows.map((r) => (r.id === id ? { ...r, status: body.status } : r)) // the "server" remembers
      return {}
    },
  },
}))
vi.mock('../ui/Toast', () => ({ useToast: () => ({ success: () => {}, error: () => {} }) }))

import LeadBoard from './LeadBoard'

const query = { q: '', city: '', priority: '' as const, status: '' as const, sort: 'created_at', order: 'desc' as const, page: 1, page_size: 10 }
const setup = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <LeadBoard query={query} onEdit={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  )

describe('LeadBoard', () => {
  beforeEach(() => {
    st.updates = []
    st.fail = false
    st.rows = [lead('1', 'Priya Sharma', 'new'), lead('2', 'Rohan Kapoor', 'won'), lead('3', 'Diya Singh', 'new')]
  })

  it('groups leads into status columns with counts', async () => {
    setup()
    const newCol = await screen.findByRole('region', { name: 'New: 2 leads' })
    expect(within(newCol).getByText('Priya Sharma')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Won: 1 lead' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Lost: 0 leads' })).toBeInTheDocument()
  })

  it('moves a lead with the menu and updates its column straight away', async () => {
    setup()
    await userEvent.selectOptions(await screen.findByLabelText('Move Priya Sharma to'), 'qualified')
    expect(st.updates).toContain('1:qualified')
    expect(within(screen.getByRole('region', { name: /^Qualified/ })).getByText('Priya Sharma')).toBeInTheDocument()
  })

  it('moves a lead when it is dropped on another column', async () => {
    setup()
    await screen.findByText('Rohan Kapoor')
    const card = screen.getByText('Rohan Kapoor').closest('li')!
    const data: Record<string, string> = {}
    const dataTransfer = { setData: (k: string, v: string) => (data[k] = v), getData: (k: string) => data[k], effectAllowed: '' }
    fireEvent.dragStart(card, { dataTransfer })
    fireEvent.drop(screen.getByRole('region', { name: /^Contacted/ }), { dataTransfer })
    await screen.findByText('Rohan Kapoor')
    expect(st.updates).toContain('2:contacted')
  })

  it('puts the card back when the server refuses', async () => {
    st.fail = true
    setup()
    await userEvent.selectOptions(await screen.findByLabelText('Move Priya Sharma to'), 'lost')
    await vi.waitFor(() => expect(within(screen.getByRole('region', { name: /^New/ })).getByText('Priya Sharma')).toBeInTheDocument())
  })
})