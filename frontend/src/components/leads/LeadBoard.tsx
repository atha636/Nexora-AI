import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, GripVertical, MapPin } from 'lucide-react'
import { useState, type DragEvent } from 'react'
import { Link } from 'react-router-dom'
import { Skeleton } from '../ui/Card'
import { useToast } from '../ui/Toast'
import { PriorityBadge } from './Badges'
import { errorMessage, leadsApi } from '../../lib/api'
import { formatDate, titleCase } from '../../lib/format'
import { LEAD_STATUSES, type Lead, type LeadList, type LeadQuery, type LeadStatus } from '../../lib/types'

const BOARD_LIMIT = 100 // the API returns at most 100 leads per request

const accent: Record<LeadStatus, string> = {
  new: 'bg-electric',
  contacted: 'bg-amber-400',
  qualified: 'bg-brand',
  won: 'bg-emerald-400',
  lost: 'bg-slate-500',
}

/** A pipeline view of the leads: one column per status. Drag a card to another column to change its status,
 *  or use the "Move to" menu on the card (works with the keyboard and on touch screens, where dragging does not). */
export default function LeadBoard({ query, onEdit }: { query: LeadQuery; onEdit: (lead: Lead) => void }) {
  const toast = useToast()
  const qc = useQueryClient()
  const [dragId, setDragId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<LeadStatus | null>(null)

  const boardQuery: LeadQuery = { ...query, status: '', sort: 'created_at', order: 'desc', page: 1, page_size: BOARD_LIMIT }
  const key = ['leads', 'board', { ...boardQuery }]
  const leads = useQuery({ queryKey: key, queryFn: () => leadsApi.list(boardQuery) })

  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: LeadStatus }) => leadsApi.update(id, { status }),
    // Show the card in its new column immediately; roll back if the server says no.
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<LeadList>(key)
      qc.setQueryData<LeadList>(key, (old) => old && { ...old, items: old.items.map((l) => (l.id === id ? { ...l, status } : l)) })
      return { previous }
    },
    onError: (e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous)
      toast.error(errorMessage(e, 'Could not move the lead'))
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['leads'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })

  if (leads.isLoading)
    return (
      <div className="grid grid-cols-[repeat(5,minmax(13rem,1fr))] gap-3 overflow-x-auto" aria-busy="true">
        {LEAD_STATUSES.map((s) => (
          <Skeleton key={s} className="h-72" />
        ))}
      </div>
    )
  if (leads.isError)
    return (
      <p role="alert" className="rounded-xl border border-line p-8 text-center text-sm text-red-400">
        {errorMessage(leads.error, 'Could not load the pipeline.')}{' '}
        <button className="underline" onClick={() => leads.refetch()}>
          Retry
        </button>
      </p>
    )

  const items = leads.data?.items ?? []
  const total = leads.data?.total ?? 0
  const drop = (status: LeadStatus) => (e: DragEvent) => {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain') || dragId
    setOverCol(null)
    setDragId(null)
    const lead = items.find((l) => l.id === id)
    if (lead && lead.status !== status) move.mutate({ id: lead.id, status })
  }

  return (
    <div className="space-y-3">
      {total > BOARD_LIMIT && (
        <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
          Showing the newest {BOARD_LIMIT} of {total} leads. Narrow the search or filters above to see the rest.
        </p>
      )}
      <div className="grid grid-cols-[repeat(5,minmax(13rem,1fr))] gap-3 overflow-x-auto pb-2" role="group" aria-label="Lead pipeline">
        {LEAD_STATUSES.map((status) => {
          const col = items.filter((l) => l.status === status)
          const share = items.length ? Math.round((col.length / items.length) * 100) : 0
          return (
            <section
              key={status}
              aria-label={`${titleCase(status)}: ${col.length} lead${col.length === 1 ? '' : 's'}`}
              onDragOver={(e) => {
                e.preventDefault()
                setOverCol(status)
              }}
              onDragLeave={() => setOverCol((c) => (c === status ? null : c))}
              onDrop={drop(status)}
              className={`flex min-h-[18rem] min-w-[13rem] flex-col rounded-xl border bg-navy-900/60 transition-colors ${
                overCol === status ? 'border-brand bg-brand/5' : 'border-line'
              }`}
            >
              <header className="border-b border-line px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${accent[status]}`} aria-hidden />
                  <h3 className="text-sm font-semibold">{titleCase(status)}</h3>
                  <span className="ml-auto rounded-full bg-navy-700 px-2 text-xs tabular-nums text-slate-300">{col.length}</span>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-navy-700" aria-hidden>
                  <div className={`h-full ${accent[status]} transition-all duration-500`} style={{ width: `${share}%` }} />
                </div>
                <p className="mt-1 text-[11px] text-slate-500">{share}% of shown leads</p>
              </header>
              <ul className="flex-1 space-y-2 overflow-y-auto p-2" style={{ maxHeight: '60vh' }}>
                {col.map((l) => (
                  <li
                    key={l.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', l.id)
                      e.dataTransfer.effectAllowed = 'move'
                      setDragId(l.id)
                    }}
                    onDragEnd={() => {
                      setDragId(null)
                      setOverCol(null)
                    }}
                    className={`group cursor-grab rounded-lg border border-line bg-navy-800 p-3 text-sm shadow-sm transition hover:border-slate-500 active:cursor-grabbing ${
                      dragId === l.id ? 'opacity-40' : ''
                    }`}
                  >
                    <div className="flex items-start gap-1.5">
                      <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-slate-600 group-hover:text-slate-400" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <Link to={`/leads/${l.id}`} className="block truncate font-medium hover:text-electric">
                          {l.name}
                        </Link>
                        {l.company && (
                          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-400">
                            <Building2 className="h-3 w-3 shrink-0" aria-hidden /> {l.company}
                          </p>
                        )}
                        {l.city && (
                          <p className="flex items-center gap-1 truncate text-xs text-slate-500">
                            <MapPin className="h-3 w-3 shrink-0" aria-hidden /> {l.city}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <PriorityBadge priority={l.priority} />
                      <span className="ml-auto text-[11px] text-slate-500">{l.last_contacted_at ? formatDate(l.last_contacted_at) : 'Never contacted'}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <select
                        aria-label={`Move ${l.name} to`}
                        value={l.status}
                        onChange={(e) => move.mutate({ id: l.id, status: e.target.value as LeadStatus })}
                        className="min-w-0 flex-1 rounded-md border border-line bg-navy-950 px-1.5 py-1 text-xs text-slate-300"
                      >
                        {LEAD_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s === l.status ? `In ${titleCase(s)}` : `Move to ${titleCase(s)}`}
                          </option>
                        ))}
                      </select>
                      <button onClick={() => onEdit(l)} className="rounded px-1.5 py-1 text-xs text-electric hover:bg-navy-700">
                        Edit
                      </button>
                    </div>
                  </li>
                ))}
                {col.length === 0 && (
                  <li className="grid place-items-center rounded-lg border border-dashed border-line px-2 py-8 text-center text-xs text-slate-600">
                    Drop a lead here
                  </li>
                )}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}