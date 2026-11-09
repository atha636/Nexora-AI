import type { ButtonHTMLAttributes } from 'react'

const variants = {
  primary: 'bg-gradient-to-r from-brand to-electric text-white hover:brightness-110',
  ghost: 'text-slate-300 hover:bg-navy-700',
  danger: 'bg-red-600 text-white hover:bg-red-500',
  outline: 'border border-line text-slate-200 hover:bg-navy-700',
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
    />
  )
}