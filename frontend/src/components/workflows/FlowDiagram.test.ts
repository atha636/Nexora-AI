import { describe, expect, it } from 'vitest'
import { actionText, conditionText } from './FlowDiagram'

describe('conditionText', () => {
  it('reads like a sentence', () => {
    expect(conditionText({ field: 'priority', op: 'eq', value: 'high' })).toBe('priority is high')
    expect(conditionText({ field: 'days_since_contact', op: 'gte', value: 7 })).toBe('at least 7 days since last contact')
    expect(conditionText({ field: 'has_email', op: 'eq', value: true })).toBe('has an email address')
    expect(conditionText({ field: 'has_email', op: 'eq', value: false })).toBe('has no email address')
  })
})

describe('actionText', () => {
  it('explains that approval gates sending', () => {
    expect(actionText({ type: 'request_approval' }).detail).toMatch(/without approval/i)
  })
  it('summarises a lead update', () => {
    const t = actionText({ type: 'update_lead', status: 'contacted' })
    expect(t.title).toBe('Update the lead')
    expect(t.detail).toBe('status → contacted')
  })
})