import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Moon, Sparkles, Sun, Trash2, UserPlus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '../components/ui/Button'
import { Card, Skeleton } from '../components/ui/Card'
import { inputClass, SelectField, TextField } from '../components/ui/Field'
import { ConfirmDialog, Modal } from '../components/ui/Modal'
import { useToast } from '../components/ui/Toast'
import { TOUR_EVENT } from '../components/layout/ProductTour'
import { LANGS, useT } from '../i18n'
import { useTheme } from '../hooks/useTheme'
import { accountApi, authApi, errorMessage, teamApi, type NewMemberInput } from '../lib/api'
import { useAuth } from '../lib/auth'
import { titleCase } from '../lib/format'
import { type Role, type TeamMember } from '../lib/types'

const ASSIGNABLE: Exclude<Role, 'owner'>[] = ['admin', 'manager', 'employee']

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold">{title}</h2>
      {hint && <p className="mt-1 text-sm text-slate-400">{hint}</p>}
      <div className="mt-4">{children}</div>
    </Card>
  )
}

function ProfileSection() {
  const { user } = useAuth()
  const toast = useToast()
  const qc = useQueryClient()
  const [name, setName] = useState(user?.full_name ?? '')
  const save = useMutation({
    mutationFn: () => accountApi.updateProfile(name.trim()),
    onSuccess: (me) => {
      qc.setQueryData(['me'], me)
      toast.success('Profile updated')
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  return (
    <Section title="Profile" hint="How your name appears to teammates.">
      <form
        className="grid max-w-md gap-3"
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          if (name.trim()) save.mutate()
        }}
      >
        <TextField label="Full name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        <TextField label="Email" value={user?.email ?? ''} disabled readOnly />
        <div>
          <Button type="submit" disabled={save.isPending || !name.trim() || name.trim() === user?.full_name}>
            {save.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>
    </Section>
  )
}

function PasswordSection() {
  const toast = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const mismatch = confirm !== '' && next !== confirm
  const change = useMutation({
    mutationFn: () => accountApi.changePassword(current, next),
    onSuccess: () => {
      toast.success('Password changed')
      setCurrent('')
      setNext('')
      setConfirm('')
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  return (
    <Section title="Password" hint="Use at least 8 characters.">
      <form
        className="grid max-w-md gap-3"
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          if (!mismatch) change.mutate()
        }}
      >
        <TextField label="Current password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        <TextField label="New password" type="password" autoComplete="new-password" minLength={8} maxLength={72} value={next} onChange={(e) => setNext(e.target.value)} />
        <TextField
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          error={mismatch ? 'Passwords do not match' : undefined}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <div>
          <Button type="submit" disabled={change.isPending || !current || next.length < 8 || next !== confirm}>
            {change.isPending ? 'Changing…' : 'Change password'}
          </Button>
        </div>
      </form>
    </Section>
  )
}

function LanguageSection() {
  const { lang, setLang, t } = useT()
  return (
    <Section title={t('lang.title')} hint={t('lang.hint')}>
      <div role="radiogroup" aria-label={t('lang.label')} className="flex gap-3">
        {LANGS.map(({ code, label }) => (
          <button
            key={code}
            role="radio"
            aria-checked={lang === code}
            onClick={() => setLang(code)}
            className={`rounded-lg border px-4 py-2 text-sm transition ${
              lang === code ? 'border-brand bg-brand/10 text-white' : 'border-line text-slate-400 hover:bg-navy-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500">{t('lang.note')}</p>
    </Section>
  )
}

function AppearanceSection() {
  const { theme, setTheme } = useTheme()
  const opts = [
    { key: 'dark' as const, label: 'Dark', icon: Moon },
    { key: 'light' as const, label: 'Light', icon: Sun },
  ]
  return (
    <Section title="Appearance" hint="Saved in this browser.">
      <div role="radiogroup" aria-label="Theme" className="flex gap-3">
        {opts.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            role="radio"
            aria-checked={theme === key}
            onClick={() => setTheme(key)}
            className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm transition ${
              theme === key ? 'border-brand bg-brand/10 text-white' : 'border-line text-slate-400 hover:bg-navy-700'
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden /> {label}
          </button>
        ))}
      </div>
      <div className="mt-5 border-t border-line pt-4">
        <p className="text-sm font-medium">Product tour</p>
        <p className="mt-0.5 text-xs text-slate-500">A short walkthrough of the main areas.</p>
        <Button variant="outline" className="mt-3" onClick={() => window.dispatchEvent(new Event(TOUR_EVENT))}>
          <Sparkles className="h-4 w-4" aria-hidden /> Take the tour again
        </Button>
      </div>
    </Section>
  )
}

function OrganizationSection() {
  const { user, can } = useAuth()
  const toast = useToast()
  const qc = useQueryClient()
  const [name, setName] = useState(user?.organization.name ?? '')
  const rename = useMutation({
    mutationFn: () => accountApi.renameOrganization(name.trim()),
    onSuccess: (me) => {
      qc.setQueryData(['me'], me)
      toast.success('Organization renamed')
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const editable = can('admin')
  return (
    <Section title="Organization" hint={editable ? 'Shown in the top bar and on emails.' : 'Only admins can rename the organization.'}>
      <form
        className="flex max-w-md items-end gap-3"
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          if (name.trim()) rename.mutate()
        }}
      >
        <div className="flex-1">
          <TextField label="Organization name" value={name} maxLength={120} disabled={!editable} onChange={(e) => setName(e.target.value)} />
        </div>
        {editable && (
          <Button type="submit" disabled={rename.isPending || !name.trim() || name.trim() === user?.organization.name}>
            Save
          </Button>
        )}
      </form>
    </Section>
  )
}

function AddMemberModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth()
  const toast = useToast()
  const qc = useQueryClient()
  const empty: NewMemberInput = { full_name: '', email: '', password: '', role: 'employee' }
  const [form, setForm] = useState<NewMemberInput>(empty)
  const add = useMutation({
    mutationFn: () => teamApi.add(form),
    onSuccess: (m) => {
      toast.success(`${m.full_name} added. Share the temporary password with them.`)
      qc.invalidateQueries({ queryKey: ['team'] })
      setForm(empty)
      onClose()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const roles = user?.role === 'owner' ? ASSIGNABLE : ASSIGNABLE.filter((r) => r !== 'admin')
  return (
    <Modal open={open} title="Add a teammate" onClose={onClose}>
      <form
        className="grid gap-3"
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          add.mutate()
        }}
      >
        <TextField label="Full name" required maxLength={120} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        <TextField label="Work email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <TextField
          label="Temporary password"
          type="text"
          required
          minLength={8}
          maxLength={72}
          autoComplete="off"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <SelectField label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as NewMemberInput['role'] })}>
          {roles.map((r) => (
            <option key={r} value={r}>
              {titleCase(r)}
            </option>
          ))}
        </SelectField>
        <p className="text-xs text-slate-500">They can sign in with this password and change it under Settings. Email invites are not set up yet.</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={add.isPending}>
            {add.isPending ? 'Adding…' : 'Add teammate'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function TeamSection() {
  const { user, can } = useAuth()
  const toast = useToast()
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<TeamMember | null>(null)
  const team = useQuery({ queryKey: ['team'], queryFn: authApi.team })
  const manage = can('admin')

  /** Mirrors the server's rules: not yourself, not the owner, and only the owner touches admins. */
  const editable = (m: TeamMember) =>
    manage && m.id !== user?.id && m.role !== 'owner' && (m.role !== 'admin' || user?.role === 'owner')

  const changeRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: Exclude<Role, 'owner'> }) => teamApi.changeRole(id, role),
    onSuccess: (m) => {
      toast.success(`${m.full_name} is now ${m.role}`)
      qc.invalidateQueries({ queryKey: ['team'] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const remove = useMutation({
    mutationFn: (id: string) => teamApi.remove(id),
    onSuccess: () => {
      toast.success('Member removed')
      setRemoving(null)
      qc.invalidateQueries({ queryKey: ['team'] })
      qc.invalidateQueries({ queryKey: ['leads'] })
    },
    onError: (e) => {
      toast.error(errorMessage(e))
      setRemoving(null)
    },
  })
  const roles = user?.role === 'owner' ? ASSIGNABLE : ASSIGNABLE.filter((r) => r !== 'admin')

  return (
    <Section title="Team" hint="Everyone with access to this organization.">
      <div className="mb-3 flex justify-end">
        {manage && (
          <Button onClick={() => setAdding(true)}>
            <UserPlus className="h-4 w-4" aria-hidden /> Add teammate
          </Button>
        )}
      </div>
      {team.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : team.isError ? (
        <p role="alert" className="text-sm text-red-400">
          {errorMessage(team.error)}
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {(team.data ?? []).map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-brand/20 text-sm font-semibold text-brand" aria-hidden>
                {m.full_name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {m.full_name}
                  {m.id === user?.id && <span className="ml-2 text-xs text-slate-500">(you)</span>}
                </p>
                <p className="truncate text-xs text-slate-500">{m.email}</p>
              </div>
              {editable(m) ? (
                <>
                  <select
                    aria-label={`Role for ${m.full_name}`}
                    className={`${inputClass} !w-auto`}
                    value={m.role}
                    disabled={changeRole.isPending}
                    onChange={(e) => changeRole.mutate({ id: m.id, role: e.target.value as Exclude<Role, 'owner'> })}
                  >
                    {roles.map((r) => (
                      <option key={r} value={r}>
                        {titleCase(r)}
                      </option>
                    ))}
                  </select>
                  <button
                    aria-label={`Remove ${m.full_name}`}
                    title="Remove from organization"
                    onClick={() => setRemoving(m)}
                    className="rounded-md p-2 text-slate-500 hover:bg-navy-700 hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <span className="rounded-full bg-navy-700 px-3 py-1 text-xs text-slate-300">{titleCase(m.role)}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {manage && (
        <p className="mt-3 text-xs text-slate-500">Removing someone unassigns their leads. Their past activity stays in the history.</p>
      )}
      <AddMemberModal open={adding} onClose={() => setAdding(false)} />
      <ConfirmDialog
        open={!!removing}
        title="Remove this person?"
        message={removing ? `${removing.full_name} will lose access to ${user?.organization.name}. Their leads become unassigned.` : ''}
        confirmLabel="Remove"
        onConfirm={() => removing && remove.mutate(removing.id)}
        onCancel={() => setRemoving(null)}
      />
    </Section>
  )
}

export default function Settings() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-slate-400">Your account, your organization and your team.</p>
      </div>
      <ProfileSection />
      <PasswordSection />
      <AppearanceSection />
      <LanguageSection />
      <OrganizationSection />
      <TeamSection />
    </div>
  )
}