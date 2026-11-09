import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'

export const inputClass =
  'w-full rounded-lg border border-line bg-navy-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-electric focus:outline-none disabled:opacity-60'

function Wrapper({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-300">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}

export const TextField = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }
>(function TextField({ label, error, ...props }, ref) {
  const id = useId()
  return (
    <Wrapper id={id} label={label} error={error}>
      <input
        ref={ref}
        id={id}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className={inputClass}
        {...props}
      />
    </Wrapper>
  )
})

export const SelectField = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string }
>(function SelectField({ label, error, children, ...props }, ref) {
  const id = useId()
  return (
    <Wrapper id={id} label={label} error={error}>
      <select ref={ref} id={id} aria-invalid={!!error} className={inputClass} {...props}>
        {children}
      </select>
    </Wrapper>
  )
})