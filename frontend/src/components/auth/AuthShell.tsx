import { BookOpen, GitBranch, MessageSquare, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import AgentDemo from '../landing/AgentDemo'
import NetworkBackground from '../landing/NetworkBackground'
import { Logo } from '../ui/Logo'

const POINTS = [
  { icon: MessageSquare, title: 'Ask in plain English', text: 'Leads, sales and documents, one conversation.' },
  { icon: BookOpen, title: 'Answers with sources', text: 'Every document answer cites the file and page.' },
  { icon: GitBranch, title: 'Workflows that pause for you', text: 'Automation stops at approval steps.' },
  { icon: ShieldCheck, title: 'Your data stays yours', text: 'Each company is isolated at the API and the database.' },
]

export default function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="grid min-h-full bg-navy-950 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col px-4 py-8 sm:px-10">
        <Link to="/" className="flex w-fit items-center gap-2" aria-label="Nexora AI home">
          <Logo size={34} />
          <span className="text-lg font-semibold tracking-tight">Nexora AI</span>
        </Link>

        <div className="mx-auto my-auto w-full max-w-md py-10">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1.5 text-sm text-slate-400">{subtitle}</p>
          <div className="mt-7">{children}</div>

          {/* on phones and tablets the panel on the right is hidden, so the pitch moves here */}
          <ul className="mt-10 space-y-3 border-t border-line pt-6 lg:hidden">
            {POINTS.slice(0, 3).map((p) => (
              <li key={p.title} className="flex items-start gap-3 text-sm">
                <p.icon className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
                <span><span className="text-slate-200">{p.title}.</span> <span className="text-slate-500">{p.text}</span></span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-slate-600">Your Intelligent AI Agent for Business Operations</p>
      </div>

      <aside className="relative hidden overflow-hidden border-l border-line bg-navy-900/60 lg:block" aria-label="About Nexora AI">
        <NetworkBackground className="pointer-events-none absolute inset-0 h-full w-full opacity-60" />
        <div className="relative flex h-full flex-col justify-center gap-10 px-12 py-12 xl:px-16">
          <div>
            <h2 className="max-w-md text-3xl font-semibold leading-tight tracking-tight text-white">
              Run your operations in plain English. <span className="text-brand">Approve what matters.</span>
            </h2>
            <ul className="mt-8 grid max-w-xl gap-x-8 gap-y-5 sm:grid-cols-2">
              {POINTS.map((p) => (
                <li key={p.title} className="flex gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-navy-800 text-brand">
                    <p.icon className="h-4 w-4" aria-hidden />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-slate-100">{p.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{p.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="max-w-xl">
            <AgentDemo />
          </div>
        </div>
      </aside>
    </div>
  )
}