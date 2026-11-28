import { createContext, Fragment, useContext, useMemo, useState, type ReactNode } from 'react'
import { getLang, setLang as storeLang, translate, type Lang } from './core'
import type { Key } from './en'

export type { Lang } from './core'
export { LANGS, getLang, translate } from './core'

interface Ctx {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: Key, vars?: Record<string, string | number>) => string
}

// Without a provider (small component tests, for example) everything still works in the saved language.
const LocaleContext = createContext<Ctx>({ lang: 'en', setLang: () => {}, t: (k, v) => translate(k, v) })

/** Switching language remounts the app below this point, so every date, amount and label picks up the new language at once. */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(getLang())
  const value = useMemo<Ctx>(
    () => ({
      lang,
      setLang: (l) => {
        storeLang(l)
        setLangState(l)
      },
      t: (k, v) => translate(k, v),
    }),
    [lang],
  )
  return (
    <LocaleContext.Provider value={value}>
      <Fragment key={lang}>{children}</Fragment>
    </LocaleContext.Provider>
  )
}

export const useT = () => useContext(LocaleContext)