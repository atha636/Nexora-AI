import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import AuthShell from '../components/auth/AuthShell'
import { Button } from '../components/ui/Button'
import { TextField } from '../components/ui/Field'
import { errorMessage } from '../lib/api'
import { useAuth } from '../lib/auth'

const schema = z.object({
  email: z.email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
})
type Values = z.infer<typeof schema>

export default function Login() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/'
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) })

  if (user) return <Navigate to={from} replace />

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null)
    try {
      await login(values.email, values.password)
      navigate(from, { replace: true })
    } catch (e) {
      setServerError(errorMessage(e, 'Could not sign in.'))
    }
  })

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your workspace.">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <TextField label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />
        {serverError && (
          <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {serverError}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-slate-400">
        New to Nexora?{' '}
        <Link to="/signup" className="text-electric hover:underline">
          Create an account
        </Link>
      </p>
    </AuthShell>
  )
}