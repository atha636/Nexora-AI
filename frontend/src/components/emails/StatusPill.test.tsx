import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import StatusPill from './StatusPill'

describe('StatusPill', () => {
  it('uses friendly labels', () => {
    render(<StatusPill status="pending_approval" />)
    expect(screen.getByText('Awaiting approval')).toBeInTheDocument()
  })
  it('capitalises unknown statuses and does not crash', () => {
    render(<StatusPill status="mystery" />)
    expect(screen.getByText('Mystery')).toBeInTheDocument()
  })
  it('shows executed emails as Sent', () => {
    render(<StatusPill status="executed" />)
    expect(screen.getByText('Sent')).toBeInTheDocument()
  })
})