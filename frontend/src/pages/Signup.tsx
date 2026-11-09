import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import AuthShell from '../components/auth/AuthShell'
import { Button } from '../components/ui/Button'
import { TextField } from '../components/ui/Field'
import { errorMessage } from '../lib/api'
import { useAuth } from '../lib/auth'

const schema = z.object({
  full_name: z.string().trim().min(1, 'Enter your name').max(120),
  organization_name: z.string().trim().min(1, 'Enter your company name').max(120),
  email: z.email('Enter a valid email'),
  password: z.string().min(8, 'Use at least 8 characters').max(72, 'Use at most 72 characters'),
})
type Values = z.infer<typeof schema>

export default function Signup() {
  const { user, signup } = useAuth()
  const navigate = useNavigate()
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) })

  if (user) return <Navigate to="/" replace />

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null)
    try {
      await signup(values)
      navigate('/', { replace: true })
    } catch (e) {
      setServerError(errorMessage(e, 'Could not create your account.'))
    }
  })

  return (
    <AuthShell title="Create your workspace" subtitle="You’ll be the owner of a new organization.">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <TextField label="Your name" autoComplete="name" error={errors.full_name?.message} {...register('full_name')} />
        <TextField
          label="Company name"
          autoComplete="organization"
          error={errors.organization_name?.message}
          {...register('organization_name')}
        />
        <TextField label="Work email" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          error={errors.password?.message}
          {...register('password')}
        />
        {serverError && (
          <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {serverError}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Creating…' : 'Create account'}
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-slate-400">
        Already have an account?{' '}
        <Link to="/login" className="text-electric hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  )
}