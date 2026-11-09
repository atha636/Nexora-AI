import { CheckCircle2, XCircle } from 'lucide-react'
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

type ToastKind = 'success' | 'error'
interface ToastItem {
  id: number
  kind: ToastKind
  message: string
}

const ToastContext = createContext<{ success: (m: string) => void; error: (m: string) => void } | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, kind, message }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500)
  }, [])

  const api = useMemo(
    () => ({ success: (m: string) => push('success', m), error: (m: string) => push('error', m) }),
    [push],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex items-start gap-3 rounded-xl border border-line bg-navy-800 p-3 text-sm shadow-xl shadow-black/40"
          >
            {t.kind === 'success' ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
            ) : (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" aria-hidden />
            )}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}