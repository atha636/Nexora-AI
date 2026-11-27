import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const st = vi.hoisted(() => ({ asked: [] as { q: string; history: unknown[] }[], fail: false }))
vi.mock('../../lib/api', () => ({
  errorMessage: (e: unknown, f: string) => (e instanceof Error && e.message ? e.message : f),
  leadsApi: {
    ask: async (_id: string, q: string, history: unknown[]) => {
      st.asked.push({ q, history })
      if (st.fail) throw new Error('The AI service is unavailable.')
      return { answer: `Answer to: ${q}`, model: 'fake' }
    },
  },
}))

import LeadChat from './LeadChat'

const setup = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <LeadChat leadId="L1" leadName="Priya" />
    </QueryClientProvider>,
  )

beforeEach(() => {
  st.asked = []
  st.fail = false
})

describe('LeadChat', () => {
  it('asks a suggested question and shows the answer', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Summarize this lead' }))
    expect(await screen.findByText('Answer to: Summarize this lead')).toBeInTheDocument()
    expect(st.asked[0]).toEqual({ q: 'Summarize this lead', history: [] })
    expect(screen.queryByRole('group', { name: 'Suggested questions' })).toBeNull()
  })

  it('sends earlier turns with a follow-up question', async () => {
    setup()
    await userEvent.type(screen.getByLabelText('Ask a question about Priya'), 'Any tasks?{enter}')
    await screen.findByText('Answer to: Any tasks?')
    await userEvent.type(screen.getByLabelText('Ask a question about Priya'), 'And then?{enter}')
    await waitFor(() => expect(st.asked).toHaveLength(2))
    expect(st.asked[1].history).toEqual([
      { role: 'user', content: 'Any tasks?' },
      { role: 'assistant', content: 'Answer to: Any tasks?' },
    ])
  })

  it('shows an error and keeps the question usable', async () => {
    st.fail = true
    setup()
    await userEvent.type(screen.getByLabelText('Ask a question about Priya'), 'Hello{enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('unavailable')
  })

  it('does not send an empty question, and Clear resets', async () => {
    setup()
    expect(screen.getByRole('button', { name: 'Send question' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Any open tasks?' }))
    await screen.findByText('Answer to: Any open tasks?')
    await userEvent.click(screen.getByRole('button', { name: /clear/i }))
    expect(screen.getByRole('group', { name: 'Suggested questions' })).toBeInTheDocument()
  })
})