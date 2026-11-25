import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useToast } from '../components/ui/Toast'
import { errorMessage, tasksApi } from '../lib/api'
import type { Task } from '../lib/types'

/** Complete / reopen / delete, shared by the lead page and the Tasks page. */
export function useTaskActions() {
  const qc = useQueryClient()
  const toast = useToast()
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['tasks'] })
    qc.invalidateQueries({ queryKey: ['tasks-summary'] })
    qc.invalidateQueries({ queryKey: ['lead'] }) // the lead's timeline records task events
  }
  const toggle = useMutation({
    mutationFn: (t: Task) => tasksApi.update(t.id, { status: t.status === 'open' ? 'done' : 'open' }),
    onSuccess: (t) => {
      if (t.status === 'done') toast.success('Task done')
      refresh()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const remove = useMutation({
    mutationFn: (t: Task) => tasksApi.remove(t.id),
    onSuccess: () => {
      toast.success('Task deleted')
      refresh()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  return { toggle, remove, refresh }
}