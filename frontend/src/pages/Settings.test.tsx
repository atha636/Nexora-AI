import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const s = vi.hoisted(() => ({
  role: 'admin' as string,
  calls: [] as string[],
}))
const team = [
  { id: 'me', email: 'me@x.com', full_name: 'Me Myself', role: 'admin' },
  { id: 'o', email: 'o@x.com', full_name: 'Olivia Owner', role: 'owner' },
  { id: 'a2', email: 'a2@x.com', full_name: 'Other Admin', role: 'admin' },
  { id: 'e', email: 'e@x.com', full_name: 'Eve Employee', role: 'employee' },
]
vi.mock('../lib/api', () => ({
  errorMessage: (e: unknown) => String(e),
  authApi: { team: async () => team },
  accountApi: { updateProfile: vi.fn(), changePassword: vi.fn(), renameOrganization: vi.fn() },
  teamApi: {
    add: vi.fn(),
    changeRole: async (id: string, role: string) => { s.calls.push(`role:${id}:${role}`); return { ...team[3], role } },
    remove: async (id: string) => { s.calls.push(`remove:${id}`) },
  },
}))
vi.mock('../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'me', email: 'me@x.com', full_name: 'Me Myself', role: s.role, organization: { id: 'org', name: 'Acme' } },
    can: (r: string) => ({ employee: 0, manager: 1, admin: 2, owner: 3 })[s.role]! >= ({ employee: 0, manager: 1, admin: 2, owner: 3 })[r]!,
  }),
}))
vi.mock('../components/ui/Toast', () => ({ useToast: () => ({ success: () => {}, error: () => {} }) }))

import Settings from './Settings'

const setup = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Settings />
    </QueryClientProvider>,
  )

describe('Settings', () => {
  beforeEach(() => { s.calls = []; s.role = 'admin' })

  it('lets an admin manage only the people the server allows', async () => {
    setup()
    expect(await screen.findByText('Eve Employee')).toBeInTheDocument()
    expect(screen.getByLabelText('Role for Eve Employee')).toBeInTheDocument()
    expect(screen.queryByLabelText('Role for Olivia Owner')).toBeNull() // owner is fixed
    expect(screen.queryByLabelText('Role for Other Admin')).toBeNull() // only the owner changes admins
    expect(screen.queryByLabelText('Role for Me Myself')).toBeNull() // not yourself
  })

  it('changes a role', async () => {
    setup()
    await userEvent.selectOptions(await screen.findByLabelText('Role for Eve Employee'), 'manager')
    expect(s.calls).toContain('role:e:manager')
  })

  it('asks before removing someone', async () => {
    setup()
    await userEvent.click(await screen.findByLabelText('Remove Eve Employee'))
    expect(s.calls).toEqual([])
    const dialog = screen.getByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))
    expect(s.calls).toContain('remove:e')
  })

  it('shows employees a read-only team list', async () => {
    s.role = 'employee'
    setup()
    await screen.findByText('Eve Employee')
    expect(screen.queryByRole('button', { name: /Add teammate/ })).toBeNull()
    expect(screen.queryByLabelText('Remove Eve Employee')).toBeNull()
    expect(screen.getByLabelText('Organization name')).toBeDisabled()
  })

  it('keeps the password button disabled until the form is valid', async () => {
    setup()
    const btn = screen.getByRole('button', { name: 'Change password' })
    expect(btn).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Current password'), 'oldpassword')
    await userEvent.type(screen.getByLabelText('New password'), 'newpassword1')
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'different')
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument()
    expect(btn).toBeDisabled()
  })
})