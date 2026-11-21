import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ user: null as null | { full_name: string } }))
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: auth.user }) }))

import Landing from './Landing'

const setup = () => render(<MemoryRouter><Landing /></MemoryRouter>)

describe('Landing page', () => {
  it('invites visitors to sign up or sign in', () => {
    auth.user = null
    setup()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/plain English/i)
    expect(screen.getAllByRole('link', { name: /create free account|get started/i }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: 'Sign in' }).length).toBeGreaterThan(0)
  })

  it('sends signed-in users to the dashboard instead', () => {
    auth.user = { full_name: 'Demo' }
    setup()
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
    for (const link of screen.getAllByRole('link', { name: /open dashboard/i })) expect(link).toHaveAttribute('href', '/dashboard')
  })

  it('explains the product sections', () => {
    auth.user = null
    setup()
    for (const id of ['features', 'how', 'security']) expect(document.getElementById(id)).not.toBeNull()
  })
})