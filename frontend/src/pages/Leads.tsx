import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Plus, Search, Trash2, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PriorityBadge, StatusBadge } from '../components/leads/Badges'
import LeadForm from '../components/leads/LeadForm'
import { Button } from '../components/ui/Button'
import { Card, Skeleton } from '../components/ui/Card'
import { inputClass } from '../components/ui/Field'
import { ConfirmDialog, Modal } from '../components/ui/Modal'
import { useToast } from '../components/ui/Toast'
import { authApi, errorMessage, leadsApi } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatDate, titleCase } from '../lib/format'
import {
  LEAD_PRIORITIES,
  LEAD_STATUSES,
  type Lead,
  type LeadInput,
  type LeadPriority,
  type LeadQuery,
  type LeadStatus,
} from '../lib/types'

const PAGE_SIZE = 10

const columns: { key: string; label: string; sortable?: boolean }[] = [
  { key: 'name', label: 'Name', sortable: true },
  { key: 'company', label: 'Company' },
  { key: 'city', label: 'City', sortable: true },
  { key: 'priority', label: 'Priority', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'last_contacted_at', label: 'Last contacted', sortable: true },
]

export default function Leads() {
  const { can } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [query, setQuery] = useState<LeadQuery>({
    q: '',
    city: '',
    priority: '',
    status: '',
    sort: 'created_at',
    order: 'desc',
    page: 1,
    page_size: PAGE_SIZE,
  })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<Lead | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Lead | null>(null)
  const [bulkDeleting, setBulkDeleting] = useState(false)

  // Wait 300ms after typing stops before querying, and go back to page 1.
  useEffect(() => {
    const t = setTimeout(() => setQuery((q) => (q.q === search ? q : { ...q, q: search, page: 1 })), 300)
    return () => clearTimeout(t)
  }, [search])

  const leads = useQuery({
    queryKey: ['leads', query],
    queryFn: () => leadsApi.list(query),
    placeholderData: keepPreviousData,
  })
  const cities = useQuery({ queryKey: ['lead-cities'], queryFn: leadsApi.cities })
  const team = useQuery({ queryKey: ['team'], queryFn: authApi.team })

  const refresh = () => {
    setSelected(new Set())
    queryClient.invalidateQueries({ queryKey: ['leads'] })
    queryClient.invalidateQueries({ queryKey: ['lead-cities'] })
  }

  const save = useMutation({
    mutationFn: (input: LeadInput) =>
      editing && editing !== 'new' ? leadsApi.update(editing.id, input) : leadsApi.create(input),
    onSuccess: () => {
      toast.success(editing === 'new' ? 'Lead created' : 'Lead updated')
      setEditing(null)
      refresh()
    },
  })

  const remove = useMutation({
    mutationFn: (id: string) => leadsApi.remove(id),
    onSuccess: () => {
      toast.success('Lead deleted')
      setDeleting(null)
      refresh()
    },
    onError: (e) => {
      toast.error(errorMessage(e))
      setDeleting(null)
    },
  })

  const bulkRemove = useMutation({
    mutationFn: () => leadsApi.bulkDelete([...selected]),
    onSuccess: (r) => {
      toast.success(`${r.deleted} lead(s) deleted`)
      setBulkDeleting(false)
      refresh()
    },
    onError: (e) => {
      toast.error(errorMessage(e))
      setBulkDeleting(false)
    },
  })

  const bulkUpdate = useMutation({
    mutationFn: (changes: { status?: LeadStatus; priority?: LeadPriority }) => leadsApi.bulkUpdate([...selected], changes),
    onSuccess: (r) => {
      toast.success(`${r.updated} lead(s) updated`)
      refresh()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const items = leads.data?.items ?? []
  const total = leads.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const allSelected = items.length > 0 && items.every((l) => selected.has(l.id))
  const hasFilters = !!(query.q || query.city || query.priority || query.status)

  const setFilter = (patch: Partial<LeadQuery>) => {
    setSelected(new Set())
    setQuery((q) => ({ ...q, ...patch, page: 1 }))
  }
  const toggleSort = (key: string) =>
    setQuery((q) => ({ ...q, sort: key, order: q.sort === key && q.order === 'asc' ? 'desc' : 'asc', page: 1 }))
  const toggleOne = (id: string) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(items.map((l) => l.id)))

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">CRM</h1>
          <p className="mt-1 text-sm text-slate-400">{leads.data ? `${total} lead${total === 1 ? '' : 's'}` : 'Loading…'}</p>
        </div>
        <Button onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" aria-hidden /> New lead
        </Button>
      </div>

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" aria-hidden />
            <input
              aria-label="Search leads"
              placeholder="Search name, email, company…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`${inputClass} pl-9`}
            />
          </div>
          <select aria-label="Filter by city" className={inputClass} value={query.city} onChange={(e) => setFilter({ city: e.target.value })}>
            <option value="">All cities</option>
            {(cities.data ?? []).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by priority"
            className={inputClass}
            value={query.priority}
            onChange={(e) => setFilter({ priority: e.target.value as LeadPriority | '' })}
          >
            <option value="">All priorities</option>
            {LEAD_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {titleCase(p)}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by status"
            className={inputClass}
            value={query.status}
            onChange={(e) => setFilter({ status: e.target.value as LeadStatus | '' })}
          >
            <option value="">All statuses</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {titleCase(s)}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-brand/40 bg-brand/10 px-4 py-2 text-sm" role="region" aria-label="Bulk actions">
          <span className="font-medium">{selected.size} selected</span>
          <select
            aria-label="Set status for selected"
            className={`${inputClass} !w-auto`}
            value=""
            onChange={(e) => e.target.value && bulkUpdate.mutate({ status: e.target.value as LeadStatus })}
          >
            <option value="">Set status…</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {titleCase(s)}
              </option>
            ))}
          </select>
          <select
            aria-label="Set priority for selected"
            className={`${inputClass} !w-auto`}
            value=""
            onChange={(e) => e.target.value && bulkUpdate.mutate({ priority: e.target.value as LeadPriority })}
          >
            <option value="">Set priority…</option>
            {LEAD_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {titleCase(p)}
              </option>
            ))}
          </select>
          {can('manager') && (
            <Button variant="danger" className="!py-1.5" onClick={() => setBulkDeleting(true)}>
              <Trash2 className="h-4 w-4" aria-hidden /> Delete
            </Button>
          )}
          <button className="ml-auto text-slate-400 hover:text-white" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      )}

      <Card className="overflow-hidden">
        {leads.isError ? (
          <div role="alert" className="p-8 text-center text-sm text-red-400">
            {errorMessage(leads.error, 'Could not load leads.')}{' '}
            <button className="underline" onClick={() => leads.refetch()}>
              Retry
            </button>
          </div>
        ) : leads.isLoading ? (
          <div className="space-y-3 p-4" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="grid place-items-center gap-3 p-12 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand/15 text-brand">
              <Users className="h-6 w-6" aria-hidden />
            </span>
            <p className="font-medium">{hasFilters ? 'No leads match your filters' : 'No leads yet'}</p>
            <p className="max-w-sm text-sm text-slate-400">
              {hasFilters ? 'Try clearing a filter or searching for something else.' : 'Add your first lead to start tracking your pipeline.'}
            </p>
            {!hasFilters && <Button onClick={() => setEditing('new')}>Add a lead</Button>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className={`w-full min-w-[760px] text-left text-sm ${leads.isFetching ? 'opacity-70' : ''}`}>
              <thead className="border-b border-line text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="w-10 px-4 py-3">
                    <input type="checkbox" aria-label="Select all on this page" checked={allSelected} onChange={toggleAll} />
                  </th>
                  {columns.map((c) => (
                    <th key={c.key} className="px-4 py-3 font-medium" aria-sort={query.sort === c.key ? (query.order === 'asc' ? 'ascending' : 'descending') : undefined}>
                      {c.sortable ? (
                        <button onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 uppercase hover:text-white">
                          {c.label}
                          {query.sort === c.key && (query.order === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                        </button>
                      ) : (
                        c.label
                      )}
                    </th>
                  ))}
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((l) => (
                  <tr key={l.id} className="hover:bg-navy-700/40">
                    <td className="px-4 py-3">
                      <input type="checkbox" aria-label={`Select ${l.name}`} checked={selected.has(l.id)} onChange={() => toggleOne(l.id)} />
                    </td>
                    <td className="px-4 py-3 font-medium">
                      <Link to={`/leads/${l.id}`} className="hover:text-electric">
                        {l.name}
                      </Link>
                      {l.email && <div className="text-xs font-normal text-slate-500">{l.email}</div>}
                    </td>
                    <td className="px-4 py-3 text-slate-300">{l.company ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-300">{l.city ?? '—'}</td>
                    <td className="px-4 py-3">
                      <PriorityBadge priority={l.priority} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={l.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-300">{formatDate(l.last_contacted_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <button className="rounded px-2 py-1 text-electric hover:bg-navy-700" onClick={() => setEditing(l)}>
                        Edit
                      </button>
                      {can('manager') && (
                        <button aria-label={`Delete ${l.name}`} className="rounded p-1.5 text-slate-400 hover:bg-navy-700 hover:text-red-400" onClick={() => setDeleting(l)}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-slate-400">
            <span>
              Page {query.page} of {pages}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" className="!px-2" aria-label="Previous page" disabled={query.page <= 1} onClick={() => setQuery((q) => ({ ...q, page: q.page - 1 }))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" className="!px-2" aria-label="Next page" disabled={query.page >= pages} onClick={() => setQuery((q) => ({ ...q, page: q.page + 1 }))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Modal open={editing !== null} title={editing === 'new' ? 'New lead' : 'Edit lead'} onClose={() => setEditing(null)}>
        {editing && (
          <LeadForm
            key={editing === 'new' ? 'new' : editing.id}
            lead={editing === 'new' ? undefined : editing}
            team={team.data ?? []}
            onSubmit={async (input) => {
              await save.mutateAsync(input)
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        title="Delete lead?"
        message={`“${deleting?.name}” and its history will be permanently removed.`}
        busy={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
      <ConfirmDialog
        open={bulkDeleting}
        title={`Delete ${selected.size} leads?`}
        message="They will be permanently removed. This can’t be undone."
        busy={bulkRemove.isPending}
        onConfirm={() => bulkRemove.mutate()}
        onCancel={() => setBulkDeleting(false)}
      />
    </div>
  )
}