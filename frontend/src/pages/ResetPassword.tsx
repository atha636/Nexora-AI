import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import AuthShell from '../components/auth/AuthShell'
import { Button } from '../components/ui/Button'
import { TextField } from '../components/ui/Field'
import { api, errorMessage } from '../lib/api'

const schema = z
  .object({
    password: z.string().min(8, 'Use at least 8 characters').max(72, 'Use at most 72 characters'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })
type Values = z.infer<typeof schema>

export default function ResetPassword() {
  const token = useSearchParams()[0].get('token') ?? ''
  const [done, setDone] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) })

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null)
    try {
      await api.post('/auth/reset-password', { token, new_password: values.password })
      setDone(true)
    } catch (e) {
      setServerError(errorMessage(e, 'Could not reset the password.'))
    }
  })

  return (
    <AuthShell title="Choose a new password" subtitle="Pick something you don't use anywhere else.">
      {done ? (
        <p role="status" className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          Your password has been changed.{' '}
          <Link to="/login" className="underline">
            Sign in
          </Link>
        </p>
      ) : !token ? (
        <p role="alert" className="text-sm text-red-300">
          This link is missing its token. <Link to="/forgot-password" className="underline">Request a new one.</Link>
        </p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <TextField label="New password" type="password" autoComplete="new-password" error={errors.password?.message} {...register('password')} />
          <TextField label="Confirm password" type="password" autoComplete="new-password" error={errors.confirm?.message} {...register('confirm')} />
          {serverError && (
            <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {serverError}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Change password'}
          </Button>
        </form>
      )}
    </AuthShell>
  )
}