import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bookmark, Share2, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { errorMessage, viewsApi } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import type { LeadQuery, SavedView } from '../../lib/types'
import { filtersFromQuery, hasAnyFilter, queryPatchFromView, sameFilters, SMART_FILTERS } from '../../lib/views'
import { Button } from '../ui/Button'
import { inputClass } from '../ui/Field'
import { ConfirmDialog, Modal } from '../ui/Modal'
import { useToast } from '../ui/Toast'

const chip = (on: boolean) =>
  `inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition ${
    on ? 'border-brand bg-brand/20 text-white' : 'border-line text-slate-300 hover:border-slate-500 hover:text-white'
  }`

/** Quick filter chips plus the person's saved views. Applying anything just changes the lead query. */
export default function SavedViews({ query, onChange }: { query: LeadQuery; onChange: (patch: Partial<LeadQuery>) => void }) {
  const { can } = useAuth()
  const toast = useToast()
  const qc = useQueryClient()
  const views = useQuery({ queryKey: ['views'], queryFn: viewsApi.list })
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [shared, setShared] = useState(false)
  const [deleting, setDeleting] = useState<SavedView | null>(null)

  const current = filtersFromQuery(query)
  const active = (views.data ?? []).find((v) => sameFilters(v.filters, current) && hasAnyFilter(query))

  const create = useMutation({
    mutationFn: () => viewsApi.create({ name, filters: current, shared }),
    onSuccess: () => {
      toast.success('View saved')
      setSaving(false)
      setName('')
      setShared(false)
      qc.invalidateQueries({ queryKey: ['views'] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const remove = useMutation({
    mutationFn: (id: string) => viewsApi.remove(id),
    onSuccess: () => {
      toast.success('View deleted')
      setDeleting(null)
      qc.invalidateQueries({ queryKey: ['views'] })
    },
    onError: (e) => {
      toast.error(errorMessage(e))
      setDeleting(null)
    },
  })

  const toggleSmart = (id: string) => {
    const f = SMART_FILTERS.find((x) => x.id === id)!
    if (f.isOn(query)) onChange(Object.fromEntries(Object.keys(f.patch).map((k) => [k, undefined])))
    else onChange(f.patch)
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (name.trim()) create.mutate()
  }

  return (
    <div className="space-y-2.5" data-testid="saved-views">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Quick filters">
        {SMART_FILTERS.map((f) => (
          <button key={f.id} aria-pressed={f.isOn(query)} onClick={() => toggleSmart(f.id)} className={chip(f.isOn(query))}>
            {f.label}
          </button>
        ))}
        {hasAnyFilter(query) && !active && (
          <button onClick={() => setSaving(true)} className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-brand/60 px-3 py-1 text-xs text-brand hover:bg-brand/10">
            <Bookmark className="h-3.5 w-3.5" aria-hidden /> Save this view
          </button>
        )}
      </div>

      {(views.data?.length ?? 0) > 0 && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Saved views">
          <span className="text-xs uppercase tracking-wide text-slate-500">Views</span>
          {views.data!.map((v) => {
            const on = active?.id === v.id
            return (
              <span key={v.id} className={`${chip(on)} !gap-0 !py-0 !pr-0.5`}>
                <button aria-pressed={on} onClick={() => onChange(queryPatchFromView(v.filters))} className="inline-flex min-w-0 items-center gap-1.5 py-1 pr-1.5">
                  {v.shared && <Share2 className="h-3 w-3 shrink-0 text-electric" aria-label="Shared with the team" />}
                  <span className="truncate">{v.name}</span>
                </button>
                {(v.mine || (v.shared && can('manager'))) && (
                  <button aria-label={`Delete view ${v.name}`} onClick={() => setDeleting(v)} className="rounded-full p-1.5 text-slate-500 hover:text-red-400">
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            )
          })}
        </div>
      )}

      <Modal open={saving} title="Save this view" onClose={() => setSaving(false)}>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="view-name" className="mb-1 block text-sm font-medium text-slate-300">
              Name
            </label>
            <input id="view-name" autoFocus maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Hot leads in Delhi" className={inputClass} />
          </div>
          {can('manager') && (
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} /> Share with the whole team
            </label>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setSaving(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || create.isPending}>
              {create.isPending ? 'Saving…' : 'Save view'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        title="Delete this view?"
        message={`"${deleting?.name ?? ''}" will be removed${deleting?.shared ? ' for everyone on the team' : ''}. Your leads are not affected.`}
        busy={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}