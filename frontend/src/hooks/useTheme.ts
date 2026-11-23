import { useCallback, useSyncExternalStore } from 'react'

export type Theme = 'dark' | 'light'
const KEY = 'nexora-theme'
const listeners = new Set<() => void>()

function read(): Theme {
  const attr = document.documentElement.getAttribute('data-theme')
  return attr === 'light' ? 'light' : 'dark'
}

/** Current theme plus a setter. The choice is remembered in this browser (and applied before first paint by
 *  a tiny script in index.html, so there is no flash of the wrong theme). */
export function useTheme() {
  const theme = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    read,
    () => 'dark' as Theme,
  )
  const setTheme = useCallback((t: Theme) => {
    document.documentElement.setAttribute('data-theme', t)
    try {
      localStorage.setItem(KEY, t)
    } catch {
      /* private mode: the theme still applies for this visit */
    }
    listeners.forEach((l) => l())
  }, [])
  return { theme, setTheme, toggle: () => setTheme(theme === 'dark' ? 'light' : 'dark') }
}