import {
  Activity, ArrowRight, BookOpen, ChartColumn, Check, GitBranch, Lock, Mail, MessageSquare, ShieldCheck, Users,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import AgentDemo from '../components/landing/AgentDemo'
import { CountUp, GlowCard, Reveal } from '../components/landing/Motion'
import NetworkBackground from '../components/landing/NetworkBackground'
import { Logo } from '../components/ui/Logo'
import { useAuth } from '../lib/auth'

const FEATURES = [
  { icon: MessageSquare, title: 'An assistant that uses your tools', text: 'Ask in plain English. The agent picks from ten built-in tools, checks its own inputs, and shows every step it took.' },
  { icon: Users, title: 'A real CRM', text: 'Leads, filters, bulk actions and a timeline per lead. The agent and your team work on the same records.' },
  { icon: BookOpen, title: 'Answers from your documents', text: 'Upload PDF, DOCX or TXT. Answers cite the file and page, and say so plainly when the documents do not contain the answer.' },
  { icon: ChartColumn, title: 'Analytics you can question', text: 'Ask "which city earns the most?" and get a chart and a plain-language explanation. Queries are read-only and scoped to your company.' },
  { icon: GitBranch, title: 'Workflows with a pause button', text: 'Trigger, conditions, actions. Runs stop at approval steps, can be retried from the failed step, and can be cancelled.' },
  { icon: Activity, title: 'Full visibility', text: 'Every run has a trace: which tools ran, how long they took, what failed. Managers get an audit log of who did what.' },
]

const STEPS = [
  { n: '01', title: 'You ask', text: 'Type a request the way you would say it to a colleague.' },
  { n: '02', title: 'The agent works', text: 'It searches leads and documents, runs analytics, and prepares drafts, using only the tools your role allows.' },
  { n: '03', title: 'A human approves', text: 'Anything that leaves the building waits for a manager. The approval is enforced by the server, not the screen.' },
  { n: '04', title: 'It is recorded', text: 'The result, the approver and the timing land in the activity log and your dashboard.' },
]

const GUARDS = [
  'Every company sees only its own data, enforced in the API and again in the database (Row Level Security).',
  'Roles (owner, admin, manager, employee) are checked on the server for every action.',
  'Emails are drafts until approved. The approved text is frozen, so what is sent is exactly what was reviewed.',
  'Text from documents is treated as untrusted. It cannot make the agent change records or send anything.',
  'The agent has no raw database access. Analytics run through a fixed, read-only query layer with timeouts and row limits.',
  'Secrets and personal data are redacted from logs. Login, AI and upload endpoints are rate limited.',
]

const STACK = ['React', 'TypeScript', 'FastAPI', 'LangGraph', 'Groq', 'PostgreSQL', 'pgvector', 'Supabase', 'Tailwind CSS', 'SQLAlchemy', 'Vitest', 'Pytest']

export default function Landing() {
  const { user } = useAuth()
  const primary = user ? { to: '/dashboard', label: 'Open dashboard' } : { to: '/signup', label: 'Create free account' }

  return (
    <div className="min-h-full bg-navy-950 text-slate-200">
      <header className="sticky top-0 z-30 border-b border-line/70 bg-navy-950/80 backdrop-blur">
        <nav className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4" aria-label="Main">
          <Link to="/" className="flex items-center gap-2">
            <Logo size={32} />
            <span className="font-semibold tracking-tight text-white">Nexora AI</span>
          </Link>
          <div className="ml-6 hidden items-center gap-6 text-sm text-slate-400 md:flex">
            <a href="#features" className="hover:text-white">Features</a>
            <a href="#how" className="hover:text-white">How it works</a>
            <a href="#security" className="hover:text-white">Security</a>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {!user && (
              <Link to="/login" className="rounded-lg px-3 py-2 text-sm text-slate-300 hover:text-white">
                Sign in
              </Link>
            )}
            <Link to={primary.to} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-black transition hover:bg-electric">
              {user ? primary.label : 'Get started'}
            </Link>
          </div>
        </nav>
      </header>

      {/* ---------------- hero ---------------- */}
      <section className="relative overflow-hidden">
        <div className="nx-grid-bg pointer-events-none absolute inset-0" aria-hidden />
        <NetworkBackground className="pointer-events-none absolute inset-0 h-full w-full opacity-70" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-24 pt-16 lg:grid-cols-[1.05fr_1fr] lg:pt-24">
          <div>
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full border border-line bg-navy-900/80 px-3 py-1 text-xs text-slate-400">
                <span className="h-1.5 w-1.5 rounded-full bg-brand" /> AI agent for business operations
              </span>
            </Reveal>
            <Reveal delay={80}>
              <h1 className="mt-5 text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-6xl">
                Run your operations in plain English.
                <span className="text-brand"> Approve what matters.</span>
              </h1>
            </Reveal>
            <Reveal delay={160}>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-400">
                Nexora AI searches your CRM and documents, analyses your sales, and drafts the follow-up work. Anything
                that leaves the building waits for a person to say yes.
              </p>
            </Reveal>
            <Reveal delay={240}>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link to={primary.to} className="group inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-3 text-sm font-semibold text-black transition hover:bg-electric">
                  {primary.label}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
                {!user && (
                  <Link to="/login" className="rounded-lg border border-line px-5 py-3 text-sm font-medium text-slate-200 transition hover:border-slate-500">
                    Sign in
                  </Link>
                )}
              </div>
            </Reveal>
            <Reveal delay={320}>
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500">
                {['Multi-tenant by design', 'Human approval built in', 'Open source stack'].map((t) => (
                  <li key={t} className="flex items-center gap-1.5">
                    <Check className="h-4 w-4 text-brand" /> {t}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
          <Reveal delay={200} className="nx-float">
            <AgentDemo />
            <p className="mt-3 text-center text-xs text-slate-600">Illustrative example with sample data.</p>
          </Reveal>
        </div>
      </section>

      {/* ---------------- facts ---------------- */}
      <section className="border-y border-line bg-navy-900/50">
        <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-4 py-10 text-center md:grid-cols-4">
          {[
            { n: 10, label: 'tools the agent can use' },
            { n: 4, label: 'roles with enforced permissions' },
            { n: 16, label: 'tables protected by row-level security' },
            { n: 0, label: 'emails sent without approval' },
          ].map((s, i) => (
            <Reveal key={s.label} delay={i * 90} className="flex flex-col-reverse">
              <dt className="mt-1 text-sm text-slate-500">{s.label}</dt>
              <dd className="text-4xl font-semibold tracking-tight text-white">
                <CountUp to={s.n} />
              </dd>
            </Reveal>
          ))}
        </dl>
      </section>

      {/* ---------------- features ---------------- */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24">
        <Reveal>
          <p className="text-sm font-medium text-brand">What is inside</p>
          <h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            One workspace for the work your team repeats every day.
          </h2>
        </Reveal>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 90}>
              <GlowCard className="h-full p-6">
                <span className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-navy-800 text-brand">
                  <f.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-medium text-white">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{f.text}</p>
              </GlowCard>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------------- how it works ---------------- */}
      <section id="how" className="scroll-mt-20 border-t border-line bg-navy-900/40">
        <div className="mx-auto max-w-6xl px-4 py-24">
          <Reveal>
            <p className="text-sm font-medium text-brand">How it works</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">From a sentence to a recorded result.</h2>
          </Reveal>
          <ol className="relative mt-14 grid gap-10 md:grid-cols-4 md:gap-6">
            <div className="absolute left-0 right-0 top-[19px] hidden h-px bg-line md:block" aria-hidden>
              <div className="h-full w-1/4 bg-gradient-to-r from-transparent via-brand to-transparent" style={{ animation: 'nx-sweep 4.5s linear infinite' }} />
            </div>
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 120}>
                <li className="relative list-none">
                  <span className="relative z-10 grid h-10 w-10 place-items-center rounded-full border border-line bg-navy-950 font-mono text-xs text-brand">{s.n}</span>
                  <h3 className="mt-4 font-medium text-white">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{s.text}</p>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------------- security ---------------- */}
      <section id="security" className="mx-auto grid max-w-6xl scroll-mt-20 gap-12 px-4 py-24 lg:grid-cols-[0.9fr_1.1fr]">
        <Reveal>
          <p className="text-sm font-medium text-brand">Built to be trusted</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">The agent is powerful. Its limits are enforced.</h2>
          <p className="mt-4 leading-relaxed text-slate-400">
            Good guardrails are not prompts that ask the model to behave. They are rules in the server and the database
            that the model cannot talk its way around.
          </p>
          <div className="mt-8 inline-flex items-center gap-3 rounded-xl border border-line bg-navy-900 px-4 py-3">
            <ShieldCheck className="h-5 w-5 text-brand" />
            <span className="text-sm text-slate-300">Approvals are checked by the backend</span>
          </div>
        </Reveal>
        <ul className="space-y-3">
          {GUARDS.map((g, i) => (
            <Reveal key={g} delay={i * 70}>
              <li className="flex gap-3 rounded-xl border border-line bg-navy-900 p-4 text-sm leading-relaxed text-slate-300">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                {g}
              </li>
            </Reveal>
          ))}
        </ul>
      </section>

      {/* ---------------- stack ---------------- */}
      <section className="border-y border-line py-8" aria-label="Technology">
        <div className="overflow-hidden [mask-image:linear-gradient(to_right,transparent,#000_12%,#000_88%,transparent)]">
          <div className="nx-marquee flex w-max gap-10 whitespace-nowrap font-mono text-sm text-slate-500">
            {[...STACK, ...STACK].map((t, i) => (
              <span key={i} className="flex items-center gap-10">
                {t}
                <span className="h-1 w-1 rounded-full bg-brand/60" />
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- CTA ---------------- */}
      <section className="relative overflow-hidden">
        <NetworkBackground className="pointer-events-none absolute inset-0 h-full w-full opacity-40" />
        <Reveal className="relative mx-auto max-w-3xl px-4 py-24 text-center">
          <Mail className="mx-auto h-8 w-8 text-brand" />
          <h2 className="mt-5 text-3xl font-semibold tracking-tight text-white sm:text-4xl">See it work on sample business data.</h2>
          <p className="mx-auto mt-4 max-w-xl text-slate-400">
            Create an account and your workspace opens ready to explore. Emails are simulated, so nothing real is ever sent.
          </p>
          <Link to={primary.to} className="group mt-8 inline-flex items-center gap-2 rounded-lg bg-brand px-6 py-3 text-sm font-semibold text-black transition hover:bg-electric">
            {primary.label}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </Reveal>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-8 text-sm text-slate-500">
          <Logo size={24} />
          <span>Nexora AI · Your Intelligent AI Agent for Business Operations</span>
          <span className="ml-auto">A portfolio project. Free-tier demo, not for production data.</span>
        </div>
      </footer>
    </div>
  )
}