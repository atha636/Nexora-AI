import { describe, expect, it } from 'vitest'
import type { LeadQuery } from './types'
import { filtersFromQuery, hasAnyFilter, queryPatchFromView, sameFilters, SMART_FILTERS } from './views'

const base: LeadQuery = { q: '', city: '', priority: '', status: '', sort: 'created_at', order: 'desc', page: 1, page_size: 10 }

describe('saved view helpers', () => {
  it('keeps only the filters that are on', () => {
    expect(filtersFromQuery({ ...base, q: '  acme ', city: 'Delhi', priority: 'high', stale_days: 7 })).toEqual({
      q: 'acme', city: 'Delhi', priority: 'high', stale_days: 7,
    })
    expect(hasAnyFilter(base)).toBe(false)
  })

  it('applying a view clears what the old filters left behind', () => {
    const patch = queryPatchFromView({ city: 'Pune' })
    expect({ ...base, assigned: 'me' as const, status: 'won' as const, ...patch }).toMatchObject({
      city: 'Pune', status: '', assigned: undefined, page: 1,
    })
  })

  it('compares views by filters, not by sort', () => {
    expect(sameFilters({ city: 'Delhi' }, { city: 'Delhi', sort: 'name' })).toBe(true)
    expect(sameFilters({ city: 'Delhi' }, { city: 'Pune' })).toBe(false)
  })

  it('"mine" and "unassigned" are never on together', () => {
    const q = { ...base, ...SMART_FILTERS.find((f) => f.id === 'unassigned')!.patch }
    expect(SMART_FILTERS.filter((f) => f.isOn(q)).map((f) => f.id)).toEqual(['unassigned'])
  })
})