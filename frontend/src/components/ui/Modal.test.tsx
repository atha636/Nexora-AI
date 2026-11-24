import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Modal } from './Modal'

describe('Modal', () => {
  it('renders nothing when closed', () => {
    render(<Modal open={false} title="Hi" onClose={() => {}}>body</Modal>)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('is an accessible dialog with a title', () => {
    render(<Modal open title="Edit lead" onClose={() => {}}>body</Modal>)
    expect(screen.getByRole('dialog', { name: 'Edit lead' })).toBeInTheDocument()
  })
  it('closes on Escape', async () => {
    const onClose = vi.fn()
    render(<Modal open title="T" onClose={onClose}>body</Modal>)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
  })
  it('is attached to the page body, so no parent can trap or clip it', () => {
    const { container } = render(
      <div style={{ transform: 'translateY(0)', overflow: 'hidden' }}>
        <Modal open title="T" onClose={() => {}}>body</Modal>
      </div>,
    )
    expect(container.querySelector('[role="dialog"]')).toBeNull() // not inside the transformed parent
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull()
  })
})