import { Logo } from '../ui/Logo'
import type { ReactNode } from 'react'

export default function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="grid min-h-full place-items-center bg-navy-950 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <Logo size={40} />
          <span className="text-xl font-semibold tracking-tight">Nexora AI</span>
        </div>
        <div className="rounded-xl border border-line bg-navy-900 p-6">
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  )
}