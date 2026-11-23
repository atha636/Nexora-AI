import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ role: 'employee' as string }))
vi.mock('../../lib/api', () => ({
  leadsApi: {
    list: async () => ({ items: [{ id: 'l1', name: 'Priya Sharma', company: 'Acme', city: 'Delhi' }], total: 1, page: 1, page_size: 5 }),
  },
  documentsApi: { list: async () => [{ id: 'd1', filename: 'refund-policy.pdf' }] },
}))
vi.mock('../../lib/auth', () => ({
  useAuth: () => ({
    user: { role: auth.role },
    can: (r: string) => ({ employee: 0, manager: 1, admin: 2, owner: 3 })[auth.role]! >= ({ employee: 0, manager: 1, admin: 2, owner: 3 })[r]!,
    logout: async () => {},
  }),
}))

import CommandPalette from './CommandPalette'

function Where() {
  const l = useLocation()
  return <p data-testid="where">{l.pathname + l.search}</p>
}
const setup = (open = true) => {
  const onClose = vi.fn()
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <Routes>
          <Route path="*" element={<><CommandPalette open={open} onClose={onClose} /><Where /></>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return onClose
}

describe('CommandPalette', () => {
  it('renders nothing when closed', () => {
    setup(false)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('filters pages as you type and opens the selected one with Enter', async () => {
    const onClose = setup()
    await userEvent.type(screen.getByRole('combobox'), 'approv')
    expect(screen.getByRole('option', { name: /Approvals/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Dashboard/ })).toBeNull()
    await userEvent.keyboard('{Enter}')
    expect(screen.getByTestId('where')).toHaveTextContent('/approvals')
    expect(onClose).toHaveBeenCalled()
  })

  it('moves with the arrow keys', async () => {
    setup()
    await userEvent.keyboard('{ArrowDown}{Enter}')
    expect(screen.getByTestId('where')).toHaveTextContent('/assistant') // second item
  })

  it('finds leads and documents', async () => {
    setup()
    await userEvent.type(screen.getByRole('combobox'), 'pri')
    expect(await screen.findByRole('option', { name: /Priya Sharma/ })).toBeInTheDocument()
    await userEvent.clear(screen.getByRole('combobox'))
    await userEvent.type(screen.getByRole('combobox'), 'refund')
    expect(await screen.findByRole('option', { name: /refund-policy\.pdf/ })).toBeInTheDocument()
  })

  it('hides pages the role cannot open', async () => {
    auth.role = 'employee'
    setup()
    await userEvent.type(screen.getByRole('combobox'), 'observ')
    expect(screen.queryByRole('option', { name: /Observability/ })).toBeNull()
    expect(screen.getByText(/Nothing matches/)).toBeInTheDocument()
  })

  it('shows a friendly message when nothing matches', async () => {
    setup()
    await userEvent.type(screen.getByRole('combobox'), 'zzzzq')
    expect(screen.getByText(/Nothing matches/)).toBeInTheDocument()
  })
})