import { en, type Key } from './en'
import { hi } from './hi'

export type Lang = 'en' | 'hi'
export const LANGS: { code: Lang; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
]

const STORAGE_KEY = 'nexora-lang'
const dictionaries: Record<Lang, Record<Key, string>> = { en, hi }

function read(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'en' || v === 'hi') return v
  } catch {
    /* storage can be blocked; English is the safe default */
  }
  return 'en'
}

let current: Lang = read()
if (typeof document !== 'undefined') document.documentElement.lang = current

export const getLang = (): Lang => current

export function setLang(lang: Lang) {
  current = lang
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    /* not saved, still works for this visit */
  }
  if (typeof document !== 'undefined') document.documentElement.lang = lang
}

/** Looks the text up in the current language, falls back to English, then to the key itself. {name} placeholders are filled from vars. */
export function translate(key: Key, vars?: Record<string, string | number>): string {
  const text = dictionaries[current][key] ?? en[key] ?? key
  return vars ? text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m)) : text
}