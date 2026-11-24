import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import MessageActions, { followUps, usedWriteTool } from './MessageActions'
import type { Block } from '../../lib/types'

const activity = (name: string, status: 'ok' | 'error' = 'ok'): Block => ({
  type: 'activity',
  tools: [{ name, status, duration_ms: 5, summary: null, error: null }],
})

describe('usedWriteTool', () => {
  it('flags tools that change data', () => {
    expect(usedWriteTool([activity('create_lead')])).toBe(true)
    expect(usedWriteTool([activity('request_approval')])).toBe(true)
  })
  it('ignores read-only tools and failed writes', () => {
    expect(usedWriteTool([activity('search_leads')])).toBe(false)
    expect(usedWriteTool([activity('create_lead', 'error')])).toBe(false)
    expect(usedWriteTool(null)).toBe(false)
  })
})

describe('followUps', () => {
  it('suggests next steps from what was shown', () => {
    const leads = { type: 'leads', tool: 't', data: { total_matching: 0, returned: 0, filters: {}, leads: [] } } as Block
    expect(followUps([leads])[0]).toMatch(/follow-up emails/)
    expect(followUps(null)).toEqual([])
  })
})

describe('MessageActions', () => {
  it('copies the answer', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<MessageActions text="Hello" canRegenerate onRegenerate={() => {}} onToast={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Copy answer' }))
    expect(writeText).toHaveBeenCalledWith('Hello')
    expect(await screen.findByText('Copied')).toBeInTheDocument()
  })

  it('regenerates only when allowed, and explains when not', async () => {
    const onRegenerate = vi.fn()
    const { rerender } = render(<MessageActions text="x" canRegenerate onRegenerate={onRegenerate} onToast={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Regenerate answer' }))
    expect(onRegenerate).toHaveBeenCalledOnce()
    rerender(<MessageActions text="x" canRegenerate={false} regenerateNote="This answer changed data, so it is not re-run." onRegenerate={onRegenerate} onToast={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Regenerate answer' })).toBeNull()
    expect(screen.getByText(/not re-run/)).toBeInTheDocument()
  })

  it('reports a clipboard failure', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('no')) }, configurable: true })
    const onToast = vi.fn()
    render(<MessageActions text="x" canRegenerate={false} onRegenerate={() => {}} onToast={onToast} />)
    await userEvent.click(screen.getByRole('button', { name: 'Copy answer' }))
    expect(onToast).toHaveBeenCalledWith(expect.stringMatching(/Could not copy/), 'error')
  })
})