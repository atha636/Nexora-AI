import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  data: { items: [] as unknown[], unread: 0 },
  readCalls: [] as string[],
  readAllCalls: 0,
}))
vi.mock('../../lib/api', () => ({
  notificationsApi: {
    list: async () => state.data,
    read: async (id: string) => {
      state.readCalls.push(id)
      return {}
    },
    readAll: async () => {
      state.readAllCalls += 1
      return { marked: 1 }
    },
  },
}))
vi.mock('../ui/Toast', () => ({ useToast: () => ({ success: () => {}, error: () => {} }) }))

import NotificationBell from './NotificationBell'

const note = (over: Record<string, unknown> = {}) => ({
  id: 'n1', kind: 'approval.requested', title: 'Approval needed', body: 'Send email to Priya',
  link: '/approvals', read_at: null, created_at: new Date().toISOString(), ...over,
})

const setup = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    </QueryClientProvider>,
  )

describe('NotificationBell', () => {
  beforeEach(() => {
    state.data = { items: [], unread: 0 }
    state.readCalls = []
    state.readAllCalls = 0
  })

  it('shows an unread badge and announces the count', async () => {
    state.data = { items: [note()], unread: 3 }
    setup()
    expect(await screen.findByRole('button', { name: 'Notifications, 3 unread' })).toBeInTheDocument()
  })

  it('shows an empty state', async () => {
    setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Notifications' }))
    expect(await screen.findByText("You're all caught up.")).toBeInTheDocument()
  })

  it('marks a notification read when it is opened', async () => {
    state.data = { items: [note()], unread: 1 }
    setup()
    await userEvent.click(await screen.findByRole('button', { name: /unread/ }))
    await userEvent.click(await screen.findByText('Approval needed'))
    expect(state.readCalls).toEqual(['n1'])
  })

  it('marks everything read and closes on Escape', async () => {
    state.data = { items: [note()], unread: 1 }
    setup()
    await userEvent.click(await screen.findByRole('button', { name: /unread/ }))
    await userEvent.click(await screen.findByRole('button', { name: /mark all read/i }))
    expect(state.readAllCalls).toBe(1)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})