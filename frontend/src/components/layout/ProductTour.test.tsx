import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProductTour, { TOUR_EVENT } from './ProductTour'

const setup = (path = '/leads') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <button data-tour="nav-dashboard">Dashboard</button>
      <ProductTour />
    </MemoryRouter>,
  )
const start = () => act(() => void window.dispatchEvent(new Event(TOUR_EVENT)))

describe('ProductTour', () => {
  beforeEach(() => localStorage.clear())

  it('stays closed until asked', () => {
    setup()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens on request and walks through the steps', async () => {
    setup()
    start()
    expect(await screen.findByRole('dialog', { name: /Welcome/ })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Next/ }))
    expect(screen.getByText(/Step 2 of/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Back/ }))
    expect(screen.getByText(/Step 1 of/)).toBeInTheDocument()
  })

  it('works with the keyboard and closes with Escape, remembering that it was seen', async () => {
    setup()
    start()
    await screen.findByRole('dialog')
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByText(/Step 2 of/)).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(localStorage.getItem('nexora-tour-done')).toBe('1')
  })

  it('finishes on the last step', async () => {
    setup()
    start()
    await screen.findByRole('dialog')
    for (let i = 0; i < 6; i++) await userEvent.click(screen.getByRole('button', { name: /Next/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Finish' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens by itself on the first visit to the dashboard only', async () => {
    vi.useFakeTimers()
    const { unmount } = setup('/dashboard')
    await act(async () => void vi.advanceTimersByTime(1300))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    unmount()
    localStorage.setItem('nexora-tour-done', '1')
    setup('/dashboard')
    await act(async () => void vi.advanceTimersByTime(1300))
    expect(screen.queryByRole('dialog')).toBeNull()
    vi.useRealTimers()
  })
})