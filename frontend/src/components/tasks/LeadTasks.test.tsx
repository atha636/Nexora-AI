import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const st = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], created: [] as Record<string, unknown>[], role: 'employee' }))
const mk = (id: string, title: string, status = 'open', extra = {}) => ({
  id, title, notes: null, status, due_at: null, overdue: false, completed_at: null, lead_id: 'L1', lead_name: 'Priya',
  assigned_to: 'me', assigned_name: 'Me', created_by: 'me', created_at: '2026-11-01T00:00:00Z', ...extra,
})
vi.mock('../../lib/api', () => ({
  errorMessage: (_e: unknown, f?: string) => f ?? 'error',
  authApi: { team: async () => [] },
  tasksApi: {
    list: async () => ({ items: st.rows, total: st.rows.length }),
    create: async (b: Record<string, unknown>) => { st.created.push(b); st.rows = [...st.rows, mk('new', String(b.title))]; return {} },
    update: async (id: string, b: { status: string }) => { st.rows = st.rows.map((r) => (r.id === id ? { ...r, status: b.status } : r)); return mk(id, 't', b.status) },
    remove: async (id: string) => { st.rows = st.rows.filter((r) => r.id !== id) },
  },
}))
vi.mock('../../lib/auth', () => ({
  useAuth: () => ({ user: { id: 'me' }, can: (r: string) => ({ employee: 0, manager: 1 })[r]! <= ({ employee: 0, manager: 1 })[st.role]! }),
}))
vi.mock('../ui/Toast', () => ({ useToast: () => ({ success: () => {}, error: () => {} }) }))

import LeadTasks from './LeadTasks'

const setup = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <LeadTasks leadId="L1" />
      </MemoryRouter>
    </QueryClientProvider>,
  )

describe('LeadTasks', () => {
  beforeEach(() => { st.rows = [mk('a', 'Call Priya')]; st.created = []; st.role = 'employee' })

  it('lists the lead’s open follow-ups', async () => {
    setup()
    expect(await screen.findByText('Call Priya')).toBeInTheDocument()
  })

  it('shows a friendly empty state', async () => {
    st.rows = []
    setup()
    expect(await screen.findByText(/Nothing planned/)).toBeInTheDocument()
  })

  it('adds a task for the lead with a quick date', async () => {
    setup()
    await screen.findByText('Call Priya')
    await userEvent.type(screen.getByLabelText('New task'), 'Send proposal')
    await userEvent.click(screen.getByRole('button', { name: 'Tomorrow' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }))
    expect(st.created[0]).toMatchObject({ title: 'Send proposal', lead_id: 'L1' })
    expect(st.created[0].due_at).toBeTruthy()
    expect(await screen.findByText('Send proposal')).toBeInTheDocument()
  })

  it('does not add an empty task', async () => {
    setup()
    await screen.findByText('Call Priya')
    expect(screen.getByRole('button', { name: 'Add task' })).toBeDisabled()
  })

  it('completes a task and tucks it under "completed"', async () => {
    setup()
    await userEvent.click(await screen.findByRole('checkbox', { name: /Mark “Call Priya” done/ }))
    expect(await screen.findByText(/Show 1 completed/)).toBeInTheDocument()
    expect(screen.queryByText('Call Priya')).toBeNull()
  })

  it('deletes a task', async () => {
    setup()
    await userEvent.click(await screen.findByRole('button', { name: /Delete “Call Priya”/ }))
    expect(await screen.findByText(/Nothing planned/)).toBeInTheDocument()
  })

  it('hides controls on someone else’s task for an employee', async () => {
    st.rows = [mk('b', 'Not mine', 'open', { assigned_to: 'other', created_by: 'other' })]
    setup()
    await screen.findByText('Not mine')
    expect(screen.queryByRole('button', { name: /Delete/ })).toBeNull()
    expect(screen.getByRole('checkbox')).toBeDisabled()
  })
})