import { beforeEach, describe, expect, it } from 'vitest'
import { en } from './en'
import { hi } from './hi'
import { setLang, translate } from './core'

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe('translations', () => {
  beforeEach(() => setLang('en'))

  it('Hindi has every English key and no extras', () => {
    expect(Object.keys(hi).sort()).toEqual(Object.keys(en).sort())
  })

  it('every Hindi text keeps the same {placeholders} as English, and none is empty', () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(hi[key].trim(), key).not.toBe('')
      expect(placeholders(hi[key]), key).toEqual(placeholders(en[key]))
    }
  })

  it('fills placeholders and follows the chosen language', () => {
    expect(translate('dash.welcome', { name: 'Atharv' })).toBe('Welcome back, Atharv')
    setLang('hi')
    expect(translate('dash.welcome', { name: 'Atharv' })).toBe('वापसी पर स्वागत है, Atharv')
    expect(translate('nav.dashboard')).toBe('डैशबोर्ड')
  })

  it('leaves an unknown placeholder visible instead of printing "undefined"', () => {
    expect(translate('dash.hintWon')).toBe('{n} won')
  })

  it('remembers the choice and sets the page language', () => {
    setLang('hi')
    expect(localStorage.getItem('nexora-lang')).toBe('hi')
    expect(document.documentElement.lang).toBe('hi')
  })
})