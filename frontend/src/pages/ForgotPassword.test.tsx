import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// A plain function (not vi.fn) for the call, so a deliberately rejected promise is not flagged as unhandled.
const mock = vi.hoisted(() => {
  const state = { impl: async (): Promise<unknown> => ({ data: {} }), calls: [] as unknown[][] }
  const post = (...args: unknown[]) => {
    state.calls.push(args)
    return state.impl()
  }
  return { state, post }
})
vi.mock('../lib/api', () => ({
  api: { post: mock.post },
  errorMessage: (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback),
}))

import ForgotPassword from './ForgotPassword'

const setup = () =>
  render(
    <MemoryRouter>
      <ForgotPassword />
    </MemoryRouter>,
  )

describe('ForgotPassword form', () => {
  beforeEach(() => {
    mock.state.calls.length = 0
  })

  it('validates the email before calling the API', async () => {
    setup()
    await userEvent.type(screen.getByLabelText('Email'), 'not-an-email')
    await userEvent.click(screen.getByRole('button', { name: /send reset link/i }))
    expect(await screen.findByText('Enter a valid email')).toBeInTheDocument()
    expect(mock.state.calls).toHaveLength(0)
  })

  it('shows the neutral confirmation after submitting', async () => {
    mock.state.impl = async () => ({ data: { detail: 'If an account exists, a link has been sent.', dev_reset_link: null } })
    setup()
    await userEvent.type(screen.getByLabelText('Email'), 'me@acme.com')
    await userEvent.click(screen.getByRole('button', { name: /send reset link/i }))
    expect(await screen.findByRole('status')).toHaveTextContent('If an account exists')
    expect(mock.state.calls[0]).toEqual(['/auth/forgot-password', { email: 'me@acme.com' }])
  })

  it('shows an error when the request fails', async () => {
    mock.state.impl = async () => {
      throw new Error('Network down')
    }
    setup()
    await userEvent.type(screen.getByLabelText('Email'), 'me@acme.com')
    await userEvent.click(screen.getByRole('button', { name: /send reset link/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Network down')
  })
})