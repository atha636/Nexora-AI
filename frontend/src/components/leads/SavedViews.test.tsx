import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { LeadQuery } from '../../lib/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const st = vi.hoisted(() => ({ views: [] as Record<string, unknown>[], created: [] as unknown[], role: 'employee' }))
vi.mock('../../lib/api', () => ({
  errorMessage: (_e: unknown, f: string) => f,
  viewsApi: {
    list: async () => st.views,
    create: async (b: unknown) => {
      st.created.push(b)
      return {}
    },
    remove: async () => ({}),
  },
}))
vi.mock('../../lib/auth', () => ({ useAuth: () => ({ can: (r: string) => (r === 'manager' ? st.role !== 'employee' : true) }) }))
vi.mock('../ui/Toast', () => ({ useToast: () => ({ success: () => {}, error: () => {} }) }))

import SavedViews from './SavedViews'

const base: LeadQuery = { q: '', city: '', priority: '', status: '', sort: 'created_at', order: 'desc', page: 1, page_size: 10 }
const setup = (query = base) => {
  const onChange = vi.fn()
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SavedViews query={query} onChange={onChange} />
    </QueryClientProvider>,
  )
  return onChange
}

beforeEach(() => {
  st.views = []
  st.created = []
  st.role = 'employee'
})

describe('SavedViews', () => {
  it('turns a quick filter on and off', async () => {
    const onChange = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Not contacted in 7 days' }))
    expect(onChange).toHaveBeenCalledWith({ stale_days: 7 })
  })

  it('shows which chip is on and clears it', async () => {
    const onChange = setup({ ...base, assigned: 'me' })
    const chip = screen.getByRole('button', { name: 'Assigned to me' })
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(chip)
    expect(onChange).toHaveBeenCalledWith({ assigned: undefined })
  })

  it('offers to save only when a filter is on, then saves the current filters', async () => {
    setup({ ...base, city: 'Delhi', priority: 'high' })
    await userEvent.click(screen.getByRole('button', { name: /save this view/i }))
    expect(screen.queryByLabelText(/share with the whole team/i)).toBeNull() // employees cannot share
    await userEvent.type(screen.getByLabelText('Name'), 'Hot Delhi')
    await userEvent.click(screen.getByRole('button', { name: 'Save view' }))
    await waitFor(() => expect(st.created).toEqual([{ name: 'Hot Delhi', filters: { city: 'Delhi', priority: 'high' }, shared: false }]))
  })

  it('does not offer to save with no filters', () => {
    setup()
    expect(screen.queryByRole('button', { name: /save this view/i })).toBeNull()
  })

  it('applies a saved view, and managers can share one', async () => {
    st.role = 'manager'
    st.views = [{ id: 'v1', name: 'Pune hot', filters: { city: 'Pune' }, shared: true, mine: false }]
    const onChange = setup()
    await userEvent.click(await screen.findByText('Pune hot'))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ city: 'Pune', status: '', page: 1 }))
    expect(screen.getByRole('button', { name: 'Delete view Pune hot' })).toBeInTheDocument() // a manager may remove a shared one
  })

  it('hides delete on a teammate\'s shared view for an employee', async () => {
    st.views = [{ id: 'v1', name: 'Team view', filters: { city: 'Pune' }, shared: true, mine: false }]
    setup()
    await screen.findByText('Team view')
    expect(screen.queryByRole('button', { name: /Delete view/ })).toBeNull()
  })
})