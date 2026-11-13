import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
  UploadCloud,
  type LucideIcon,
} from 'lucide-react'
import { useRef, useState, type DragEvent, type FormEvent } from 'react'
import AskPanel from '../components/knowledge/AskPanel'
import { Button } from '../components/ui/Button'
import { Card, Skeleton } from '../components/ui/Card'
import { inputClass } from '../components/ui/Field'
import { ConfirmDialog } from '../components/ui/Modal'
import { useToast } from '../components/ui/Toast'
import { documentsApi, errorMessage } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatBytes, formatDate } from '../lib/format'
import {
  ALLOWED_EXTENSIONS,
  MAX_UPLOAD_BYTES,
  type DocumentItem,
  type DocumentStatus,
} from '../lib/types'

const statusInfo: Record<DocumentStatus, { label: string; icon: LucideIcon; style: string; spin?: boolean }> = {
  pending: { label: 'Queued', icon: Clock, style: 'bg-slate-500/20 text-slate-300' },
  processing: { label: 'Processing', icon: Loader2, style: 'bg-electric/15 text-electric', spin: true },
  ready: { label: 'Ready', icon: CheckCircle2, style: 'bg-emerald-400/15 text-emerald-300' },
  failed: { label: 'Failed', icon: AlertCircle, style: 'bg-red-500/15 text-red-300' },
}

function StatusBadge({ status }: { status: DocumentStatus }) {
  const { label, icon: Icon, style, spin } = statusInfo[status]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}>
      <Icon className={`h-3.5 w-3.5 ${spin ? 'animate-spin' : ''}`} aria-hidden />
      {label}
    </span>
  )
}

/** Same rules the server enforces, checked first so people get instant feedback. */
function validateFile(file: File): string | null {
  const name = file.name.toLowerCase()
  if (!ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext))) return `${file.name}: only PDF, DOCX and TXT files are supported.`
  if (file.size === 0) return `${file.name}: the file is empty.`
  if (file.size > MAX_UPLOAD_BYTES) return `${file.name}: larger than ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`
  return null
}

export default function Knowledge() {
  const { can } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState<DocumentItem | null>(null)
  const [query, setQuery] = useState('')

  const docs = useQuery({
    queryKey: ['documents'],
    queryFn: documentsApi.list,
    // Keep checking every 2 seconds while anything is still being processed.
    refetchInterval: (q) =>
      q.state.data?.some((d) => d.status === 'pending' || d.status === 'processing') ? 2000 : false,
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['documents'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const remove = useMutation({
    mutationFn: (id: string) => documentsApi.remove(id),
    onSuccess: () => {
      toast.success('Document deleted')
      setDeleting(null)
      refresh()
    },
    onError: (e) => {
      toast.error(errorMessage(e))
      setDeleting(null)
    },
  })

  const reindex = useMutation({
    mutationFn: (id: string) => documentsApi.reindex(id),
    onSuccess: () => {
      toast.success('Re-indexing started')
      refresh()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const search = useMutation({ mutationFn: (q: string) => documentsApi.search(q) })

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files)
    if (list.length === 0) return
    setUploading(true)
    let uploaded = 0
    for (const file of list) {
      const problem = validateFile(file)
      if (problem) {
        toast.error(problem)
        continue
      }
      try {
        await documentsApi.upload(file)
        uploaded += 1
      } catch (e) {
        toast.error(`${file.name}: ${errorMessage(e, 'Upload failed.')}`)
      }
    }
    setUploading(false)
    if (fileInput.current) fileInput.current.value = ''
    if (uploaded > 0) {
      toast.success(uploaded === 1 ? 'Upload complete. Processing…' : `${uploaded} files uploaded. Processing…`)
      refresh()
    }
  }

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    setDragging(false)
    void handleFiles(e.dataTransfer.files)
  }

  const onSearch = (e: FormEvent) => {
    e.preventDefault()
    if (query.trim()) search.mutate(query.trim())
  }

  const items = docs.data ?? []
  const readyCount = items.filter((d) => d.status === 'ready').length

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Knowledge</h1>
        <p className="mt-1 text-sm text-slate-400">
          Upload your company documents so Nexora can search them. {readyCount} of {items.length} ready.
        </p>
      </div>

      <label
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition focus-within:outline focus-within:outline-2 focus-within:outline-electric ${
          dragging ? 'border-electric bg-electric/10' : 'border-line bg-navy-800/40 hover:border-brand/60'
        }`}
      >
        <input
          ref={fileInput}
          type="file"
          multiple
          accept=".pdf,.docx,.txt"
          className="sr-only"
          disabled={uploading}
          onChange={(e) => e.target.files && void handleFiles(e.target.files)}
        />
        {uploading ? (
          <Loader2 className="h-8 w-8 animate-spin text-electric" aria-hidden />
        ) : (
          <UploadCloud className="h-8 w-8 text-brand" aria-hidden />
        )}
        <span className="font-medium">{uploading ? 'Uploading…' : 'Drop files here, or click to browse'}</span>
        <span className="text-xs text-slate-500">PDF, DOCX or TXT · up to {MAX_UPLOAD_BYTES / (1024 * 1024)} MB each</span>
      </label>

      <Card className="overflow-hidden">
        <div className="border-b border-line px-5 py-3 text-sm font-semibold text-slate-200">Documents</div>
        {docs.isError ? (
          <div role="alert" className="p-8 text-center text-sm text-red-400">
            {errorMessage(docs.error, 'Could not load documents.')}{' '}
            <button className="underline" onClick={() => docs.refetch()}>
              Retry
            </button>
          </div>
        ) : docs.isLoading ? (
          <div className="space-y-3 p-4" aria-busy="true">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="grid place-items-center gap-2 p-12 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand/15 text-brand">
              <FileText className="h-6 w-6" aria-hidden />
            </span>
            <p className="font-medium">No documents yet</p>
            <p className="max-w-sm text-sm text-slate-400">Upload a policy, handbook or report above to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="hidden px-3 py-3 font-medium md:table-cell">Size</th>
                  <th className="hidden px-3 py-3 font-medium md:table-cell">Status</th>
                  <th className="hidden px-3 py-3 text-right font-medium md:table-cell">Chunks</th>
                  <th className="hidden px-3 py-3 font-medium md:table-cell">Uploaded</th>
                  {can('manager') && <th className="px-3 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((d) => {
                  const busy = d.status === 'pending' || d.status === 'processing'
                  return (
                    <tr key={d.id} className="align-top">
                      <td className="px-5 py-3">
                        <div className="flex items-start gap-2">
                          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                          <div className="min-w-0">
                            <p className="break-all font-medium">{d.filename}</p>
                            <p className="text-xs uppercase text-slate-500">
                              {d.file_type}
                              {d.page_count ? ` · ${d.page_count} page${d.page_count === 1 ? '' : 's'}` : ''}
                            </p>
                            {/* On phones the Status column is hidden, so show it here instead. */}
                            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 md:hidden">
                              <StatusBadge status={d.status} />
                              <span>{formatBytes(d.file_size)}</span>
                              {d.status === 'ready' && <span>· {d.chunk_count} chunks</span>}
                            </div>
                            {d.status === 'failed' && d.error_message && (
                              <p className="mt-1 text-xs text-red-300">{d.error_message}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="hidden px-3 py-3 text-slate-300 md:table-cell">{formatBytes(d.file_size)}</td>
                      <td className="hidden px-3 py-3 md:table-cell">
                        <StatusBadge status={d.status} />
                      </td>
                      <td className="hidden px-3 py-3 text-right tabular-nums text-slate-300 md:table-cell">{d.status === 'ready' ? d.chunk_count : '—'}</td>
                      <td className="hidden px-3 py-3 text-slate-300 md:table-cell">{formatDate(d.created_at)}</td>
                      {can('manager') && (
                        <td className="px-3 py-3 text-right whitespace-nowrap">
                          <button
                            aria-label={`Re-index ${d.filename}`}
                            title="Re-index"
                            disabled={busy || reindex.isPending}
                            onClick={() => reindex.mutate(d.id)}
                            className="rounded p-1.5 text-slate-400 hover:bg-navy-700 hover:text-electric disabled:opacity-40"
                          >
                            <RefreshCw className="h-4 w-4" />
                          </button>
                          <button
                            aria-label={`Delete ${d.filename}`}
                            title="Delete"
                            onClick={() => setDeleting(d)}
                            className="rounded p-1.5 text-slate-400 hover:bg-navy-700 hover:text-red-400"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <AskPanel disabled={readyCount === 0} />

      <Card className="p-5">
        <h2 className="text-sm font-semibold text-slate-200">Test search</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Shows the raw passages most similar to your question, with no AI involved. Useful for checking what the answers are based on.
        </p>
        <form onSubmit={onSearch} className="mt-4 flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" aria-hidden />
            <input
              aria-label="Search your documents"
              placeholder="e.g. What is our refund policy?"
              maxLength={500}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={`${inputClass} pl-9`}
            />
          </div>
          <Button type="submit" disabled={!query.trim() || search.isPending || readyCount === 0}>
            {search.isPending ? 'Searching…' : 'Search'}
          </Button>
        </form>
        {readyCount === 0 && items.length > 0 && (
          <p className="mt-2 text-xs text-slate-500">Search becomes available once a document is ready.</p>
        )}

        {search.isError && (
          <p role="alert" className="mt-4 text-sm text-red-400">
            {errorMessage(search.error, 'Search failed.')}
          </p>
        )}
        {search.data && search.data.hits.length === 0 && (
          <p className="mt-4 text-sm text-slate-400">No matching passages found.</p>
        )}
        {search.data && search.data.hits.length > 0 && (
          <ol className="mt-4 space-y-3" aria-label="Search results">
            {search.data.hits.map((h) => (
              <li key={h.chunk_id} className="rounded-xl border border-line bg-navy-900/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-slate-200">
                    {h.filename} ·{' '}
                    <span className="text-slate-400">
                      {h.page_number !== null ? `Page ${h.page_number}` : `Section ${h.chunk_index + 1}`}
                    </span>
                  </span>
                  <span className="rounded-full bg-brand/20 px-2 py-0.5 text-violet-300">{Math.round(h.score * 100)}% match</span>
                </div>
                {/* Document text is untrusted: rendered as plain text, never as HTML. */}
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{h.content}</p>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <ConfirmDialog
        open={!!deleting}
        title="Delete document?"
        message={`“${deleting?.filename}” and everything indexed from it will be permanently removed.`}
        busy={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}