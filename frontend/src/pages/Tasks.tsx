import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, ListTodo } from 'lucide-react'
import { useState } from 'react'
import QuickAddTask from '../components/tasks/QuickAddTask'
import TaskItem from '../components/tasks/TaskItem'
import { Card, Skeleton } from '../components/ui/Card'
import { useTaskActions } from '../hooks/useTaskActions'
import { errorMessage, tasksApi } from '../lib/api'
import { useT } from '../i18n'
import type { Key } from '../i18n/en'
import { useAuth } from '../lib/auth'
import { groupTasks } from '../lib/tasks'

const pill = (on: boolean) =>
  `rounded-full border px-3 py-1 text-sm transition ${on ? 'border-brand bg-brand/15 text-white' : 'border-line text-slate-400 hover:text-white'}`

export default function Tasks() {
  const { can } = useAuth()
  const { t } = useT()
  const [scope, setScope] = useState<'mine' | 'all'>('mine')
  const [state, setState] = useState<'open' | 'done'>('open')
  const { toggle, remove, refresh } = useTaskActions()
  const tasks = useQuery({ queryKey: ['tasks', scope, state], queryFn: () => tasksApi.list({ scope, state }) })
  const items = tasks.data?.items ?? []
  const busy = toggle.isPending || remove.isPending

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('tasks.title')}</h1>
        <p className="mt-1 text-sm text-slate-400">{t('tasks.sub')}</p>
      </div>

      <Card className="p-5">
        <QuickAddTask onAdded={refresh} />
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        {can('manager') && (
          <div role="group" aria-label={t('tasks.whose')} className="mr-2 flex gap-2">
            <button aria-pressed={scope === 'mine'} className={pill(scope === 'mine')} onClick={() => setScope('mine')}>
              {t('tasks.mine')}
            </button>
            <button aria-pressed={scope === 'all'} className={pill(scope === 'all')} onClick={() => setScope('all')}>
              {t('tasks.everyone')}
            </button>
          </div>
        )}
        <div role="group" aria-label={t('tasks.status')} className="flex gap-2">
          <button aria-pressed={state === 'open'} className={pill(state === 'open')} onClick={() => setState('open')}>
            {t('tasks.open')}
          </button>
          <button aria-pressed={state === 'done'} className={pill(state === 'done')} onClick={() => setState('done')}>
            {t('tasks.done')}
          </button>
        </div>
      </div>

      {tasks.isLoading ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : tasks.isError ? (
        <Card className="p-8 text-center text-sm text-red-400" role="alert">
          {errorMessage(tasks.error, t('tasks.loadError'))}{' '}
          <button className="underline" onClick={() => tasks.refetch()}>
            {t('dash.retry')}
          </button>
        </Card>
      ) : items.length === 0 ? (
        <Card className="grid place-items-center gap-2 p-10 text-center">
          {state === 'open' ? <ListTodo className="h-8 w-8 text-slate-500" aria-hidden /> : <CheckCircle2 className="h-8 w-8 text-slate-500" aria-hidden />}
          <p className="text-sm font-medium">{state === 'open' ? t('tasks.caughtUp') : t('tasks.nothingDone')}</p>
          <p className="max-w-sm text-sm text-slate-500">
            {state === 'open' ? t('tasks.addHint') : t('tasks.doneHint')}
          </p>
        </Card>
      ) : state === 'open' ? (
        groupTasks(items).map((g) => (
          <section key={g.key} aria-label={t(`tasks.group.${g.key}` as Key)}>
            <h2 className={`mb-1 px-1 text-xs font-semibold uppercase tracking-wide ${g.key === 'overdue' ? 'text-red-300' : 'text-slate-500'}`}>
              {t(`tasks.group.${g.key}` as Key)} · {g.items.length}
            </h2>
            <Card className="px-4">
              <ul className="divide-y divide-line">
                {g.items.map((t) => (
                  <TaskItem key={t.id} task={t} showLead showAssignee={scope === 'all'} busy={busy} onToggle={toggle.mutate} onDelete={remove.mutate} />
                ))}
              </ul>
            </Card>
          </section>
        ))
      ) : (
        <Card className="px-4">
          <ul className="divide-y divide-line">
            {items.map((t) => (
              <TaskItem key={t.id} task={t} showLead showAssignee={scope === 'all'} busy={busy} onToggle={toggle.mutate} onDelete={remove.mutate} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}