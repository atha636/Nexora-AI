import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import AuthShell from '../components/auth/AuthShell'
import { Button } from '../components/ui/Button'
import { TextField } from '../components/ui/Field'
import { api, errorMessage } from '../lib/api'

const schema = z.object({ email: z.email('Enter a valid email') })
type Values = z.infer<typeof schema>

export default function ForgotPassword() {
  const [done, setDone] = useState<{ detail: string; dev_reset_link: string | null } | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) })

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null)
    try {
      const res = await api.post<{ detail: string; dev_reset_link: string | null }>('/auth/forgot-password', values)
      setDone(res.data)
    } catch (e) {
      setServerError(errorMessage(e, 'Could not send the reset link.'))
    }
  })

  return (
    <AuthShell title="Reset your password" subtitle="We'll email you a link to choose a new one.">
      {done ? (
        <div className="space-y-4 text-sm">
          <p role="status" className="rounded-lg bg-emerald-500/10 px-3 py-2 text-emerald-300">
            {done.detail}
          </p>
          {done.dev_reset_link && (
            <p className="rounded-lg border border-line px-3 py-2 text-slate-300">
              Development mode (no real email is sent):{' '}
              <a className="break-all text-electric hover:underline" href={done.dev_reset_link}>
                open the reset link
              </a>
            </p>
          )}
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <TextField label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
          {serverError && (
            <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {serverError}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>
      )}
      <p className="mt-5 text-center text-sm text-slate-400">
        <Link to="/login" className="text-electric hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  )
}