import { Languages } from 'lucide-react'
import { LANGS, useT } from '../../i18n'

/** A small English / हिन्दी toggle for the top bar. */
export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { lang, setLang, t } = useT()
  const next = LANGS.find((l) => l.code !== lang)!
  return (
    <button
      onClick={() => setLang(next.code)}
      aria-label={`${t('lang.switch')}: ${next.label}`}
      title={`${t('lang.switch')}: ${next.label}`}
      className={`inline-flex items-center gap-1.5 rounded-md p-2 text-xs font-medium text-slate-400 hover:bg-navy-700 hover:text-white ${className}`}
    >
      <Languages className="h-5 w-5" aria-hidden />
      <span className="hidden md:inline">{next.label}</span>
    </button>
  )
}