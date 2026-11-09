import { X } from 'lucide-react'
import { useEffect, useId, type ReactNode } from 'react'
import { Button } from './Button'

export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="presentation">
      <button aria-label="Close dialog" className="absolute inset-0 cursor-default bg-black/70" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl border border-line bg-navy-900 p-5 shadow-2xl sm:rounded-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <button aria-label="Close" onClick={onClose} className="rounded-md p-1 text-slate-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal open={open} title={title} onClose={onCancel}>
      <p className="text-sm text-slate-300">{message}</p>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button variant="danger" onClick={onConfirm} disabled={busy}>
          {busy ? 'Working…' : confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}