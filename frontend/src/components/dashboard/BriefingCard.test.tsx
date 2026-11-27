import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const st = vi.hoisted(() => ({ ai: true, fail: false, calls: 0 }))
vi.mock('../../lib/api', () => ({
  errorMessage: (_e: unknown, f: string) => f,
  analyticsApi: {
    briefing: async () => ({ items: [{ key: 'my_tasks', title: 'Your overdue tasks', value: '2', detail: 'x', tone: 'warn', href: '/tasks' }] }),
    briefingSummary: async () => {
      st.calls++
      if (st.fail) throw new Error('x')
      return { summary: 'Two tasks are overdue.', ai: st.ai }
    },
  },
}))

import BriefingCard from './BriefingCard'

const setup = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <BriefingCard />
      </MemoryRouter>
    </QueryClientProvider>,
  )

beforeEach(() => {
  st.ai = true
  st.fail = false
  st.calls = 0
})

describe('BriefingCard', () => {
  it('uses no AI until asked', async () => {
    setup()
    await screen.findByText('Your overdue tasks')
    expect(st.calls).toBe(0)
  })

  it('shows the AI summary with an honest label', async () => {
    setup()
    await userEvent.click(await screen.findByRole('button', { name: /summarize with ai/i }))
    expect(await screen.findByText('Two tasks are overdue.')).toBeInTheDocument()
    expect(screen.getByText(/written by ai/i)).toBeInTheDocument()
  })

  it('says so when the plain fallback was used', async () => {
    st.ai = false
    setup()
    await userEvent.click(await screen.findByRole('button', { name: /summarize with ai/i }))
    expect(await screen.findByText(/ai is unavailable/i)).toBeInTheDocument()
  })

  it('shows an error when the request fails', async () => {
    st.fail = true
    setup()
    await userEvent.click(await screen.findByRole('button', { name: /summarize with ai/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not write the summary')
  })
})