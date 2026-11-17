const styles: Record<string, string> = {
  draft: 'bg-slate-500/15 text-slate-300',
  pending_approval: 'bg-amber-500/15 text-amber-300',
  pending: 'bg-amber-500/15 text-amber-300',
  approved: 'bg-sky-500/15 text-sky-300',
  sent: 'bg-emerald-500/15 text-emerald-300',
  executed: 'bg-emerald-500/15 text-emerald-300',
  failed: 'bg-red-500/15 text-red-300',
  rejected: 'bg-red-500/15 text-red-300',
  cancelled: 'bg-slate-500/15 text-slate-400',
}

const labels: Record<string, string> = {
  pending_approval: 'Awaiting approval',
  pending: 'Pending',
  executed: 'Sent',
}

export default function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? styles.draft}`}>
      {labels[status] ?? status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}