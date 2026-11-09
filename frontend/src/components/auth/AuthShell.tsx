import { Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'

export default function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="grid min-h-full place-items-center bg-gradient-to-b from-navy-950 to-navy-900 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-brand to-electric">
            <Sparkles className="h-5 w-5 text-white" aria-hidden />
          </div>
          <span className="text-xl font-semibold tracking-tight">Nexora AI</span>
        </div>
        <div className="rounded-2xl border border-line bg-navy-800/70 p-6 shadow-xl shadow-black/30">
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  )
}