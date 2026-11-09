import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PriorityBadge, StatusBadge } from '../components/leads/Badges'
import LeadForm from '../components/leads/LeadForm'
import { Button } from '../components/ui/Button'
import { Card, Skeleton } from '../components/ui/Card'
import { ConfirmDialog, Modal } from '../components/ui/Modal'
import { useToast } from '../components/ui/Toast'
import { authApi, errorMessage, leadsApi } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatDate, formatDateTime } from '../lib/format'
import type { ActivityEvent, LeadInput } from '../lib/types'

function describe(e: ActivityEvent): string {
  switch (e.action) {
    case 'lead.created':
      return 'Lead created'
    case 'lead.updated': {
      const changed = (e.details?.changed ?? {}) as Record<string, [unknown, unknown]>
      const parts = Object.entries(changed).map(([field, [from, to]]) =>
        field === 'status' || field === 'priority'
          ? `${field}: ${from ?? '—'} → ${to ?? '—'}`
          : `${field.replace(/_/g, ' ')} changed`,
      )
      return parts.length ? `Updated — ${parts.join(', ')}` : 'Lead updated'
    }
    default:
      return e.action
  }
}

export default function LeadDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const lead = useQuery({ queryKey: ['lead', id], queryFn: () => leadsApi.get(id), retry: false })
  const activity = useQuery({ queryKey: ['lead', id, 'activity'], queryFn: () => leadsApi.activity(id), enabled: lead.isSuccess })
  const team = useQuery({ queryKey: ['team'], queryFn: authApi.team })

  const save = useMutation({
    mutationFn: (input: LeadInput) => leadsApi.update(id, input),
    onSuccess: () => {
      toast.success('Lead updated')
      setEditing(false)
      queryClient.invalidateQueries({ queryKey: ['lead', id] })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
    },
  })
  const remove = useMutation({
    mutationFn: () => leadsApi.remove(id),
    onSuccess: () => {
      toast.success('Lead deleted')
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      navigate('/leads', { replace: true })
    },
    onError: (e) => {
      toast.error(errorMessage(e))
      setDeleting(false)
    },
  })

  const back = (
    <Link to="/leads" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white">
      <ArrowLeft className="h-4 w-4" aria-hidden /> Back to CRM
    </Link>
  )

  if (lead.isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4" aria-busy="true">
        {back}
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }
  if (lead.isError || !lead.data) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        {back}
        <Card className="p-10 text-center text-sm text-slate-400" role="alert">
          {errorMessage(lead.error, 'Lead not found.')}
        </Card>
      </div>
    )
  }

  const l = lead.data
  const assignee = team.data?.find((m) => m.id === l.assigned_to)?.full_name
  const rows: [string, string][] = [
    ['Email', l.email ?? '—'],
    ['Phone', l.phone ?? '—'],
    ['Company', l.company ?? '—'],
    ['City', l.city ?? '—'],
    ['Source', l.source ?? '—'],
    ['Assigned to', assignee ?? 'Unassigned'],
    ['Last contacted', formatDate(l.last_contacted_at)],
    ['Created', formatDate(l.created_at)],
  ]

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {back}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{l.name}</h1>
          <div className="mt-2 flex gap-2">
            <StatusBadge status={l.status} />
            <PriorityBadge priority={l.priority} />
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" aria-hidden /> Edit
          </Button>
          {can('manager') && (
            <Button variant="danger" onClick={() => setDeleting(true)}>
              <Trash2 className="h-4 w-4" aria-hidden /> Delete
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="p-5 lg:col-span-3">
          <h2 className="mb-4 text-sm font-semibold text-slate-200">Details</h2>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {rows.map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-slate-500">{k}</dt>
                <dd className="mt-0.5 break-words text-sm">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold text-slate-200">Activity</h2>
          {activity.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : activity.isError ? (
            <p role="alert" className="text-sm text-red-400">
              Could not load activity.
            </p>
          ) : (activity.data ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">No activity yet.</p>
          ) : (
            <ol className="space-y-4 border-l border-line pl-4">
              {activity.data!.map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-brand" aria-hidden />
                  <p className="text-sm">{describe(e)}</p>
                  <p className="text-xs text-slate-500">
                    {e.actor_name ?? 'System'} · {formatDateTime(e.created_at)}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <Modal open={editing} title="Edit lead" onClose={() => setEditing(false)}>
        <LeadForm
          lead={l}
          team={team.data ?? []}
          onSubmit={async (input) => {
            await save.mutateAsync(input)
          }}
          onCancel={() => setEditing(false)}
        />
      </Modal>
      <ConfirmDialog
        open={deleting}
        title="Delete lead?"
        message={`“${l.name}” and its history will be permanently removed.`}
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
        onCancel={() => setDeleting(false)}
      />
    </div>
  )
}