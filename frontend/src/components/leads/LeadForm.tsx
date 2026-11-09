import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { errorMessage } from '../../lib/api'
import { fromDateInput, titleCase, toDateInput } from '../../lib/format'
import { LEAD_PRIORITIES, LEAD_STATUSES, type Lead, type LeadInput, type TeamMember } from '../../lib/types'
import { Button } from '../ui/Button'
import { SelectField, TextField } from '../ui/Field'

const schema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(120),
  email: z.union([z.literal(''), z.email('Enter a valid email')]),
  phone: z.string().trim().max(30, 'Too long'),
  company: z.string().trim().max(120),
  city: z.string().trim().max(80),
  source: z.string().trim().max(80),
  status: z.enum(['new', 'contacted', 'qualified', 'won', 'lost']),
  priority: z.enum(['low', 'medium', 'high']),
  assigned_to: z.string(),
  last_contacted_at: z.string(),
})
type Values = z.infer<typeof schema>

const orNull = (s: string) => (s.trim() ? s.trim() : null)

export default function LeadForm({
  lead,
  team,
  onSubmit,
  onCancel,
}: {
  lead?: Lead
  team: TeamMember[]
  onSubmit: (input: LeadInput) => Promise<void>
  onCancel: () => void
}) {
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: lead?.name ?? '',
      email: lead?.email ?? '',
      phone: lead?.phone ?? '',
      company: lead?.company ?? '',
      city: lead?.city ?? '',
      source: lead?.source ?? '',
      status: lead?.status ?? 'new',
      priority: lead?.priority ?? 'medium',
      assigned_to: lead?.assigned_to ?? '',
      last_contacted_at: toDateInput(lead?.last_contacted_at),
    },
  })

  const submit = handleSubmit(async (v) => {
    setServerError(null)
    try {
      await onSubmit({
        name: v.name.trim(),
        email: orNull(v.email),
        phone: orNull(v.phone),
        company: orNull(v.company),
        city: orNull(v.city),
        source: orNull(v.source),
        status: v.status,
        priority: v.priority,
        assigned_to: v.assigned_to || null,
        last_contacted_at: fromDateInput(v.last_contacted_at),
      })
    } catch (e) {
      setServerError(errorMessage(e, 'Could not save the lead.'))
    }
  })

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <TextField label="Name *" error={errors.name?.message} {...register('name')} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Email" type="email" error={errors.email?.message} {...register('email')} />
        <TextField label="Phone" type="tel" error={errors.phone?.message} {...register('phone')} />
        <TextField label="Company" error={errors.company?.message} {...register('company')} />
        <TextField label="City" error={errors.city?.message} {...register('city')} />
        <TextField label="Source" placeholder="Website, referral…" error={errors.source?.message} {...register('source')} />
        <TextField label="Last contacted" type="date" {...register('last_contacted_at')} />
        <SelectField label="Status" {...register('status')}>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {titleCase(s)}
            </option>
          ))}
        </SelectField>
        <SelectField label="Priority" {...register('priority')}>
          {LEAD_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {titleCase(p)}
            </option>
          ))}
        </SelectField>
      </div>
      <SelectField label="Assigned to" {...register('assigned_to')}>
        <option value="">Unassigned</option>
        {team.map((m) => (
          <option key={m.id} value={m.id}>
            {m.full_name}
          </option>
        ))}
      </SelectField>

      {serverError && (
        <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {serverError}
        </p>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : lead ? 'Save changes' : 'Create lead'}
        </Button>
      </div>
    </form>
  )
}