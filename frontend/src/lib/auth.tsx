import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { UNAUTHORIZED_EVENT, authApi, tokenStore, type SignupInput } from './api'
import { ROLE_RANK, type Role, type User } from './types'

interface AuthState {
  user: User | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  signup: (input: SignupInput) => Promise<void>
  logout: () => Promise<void>
  /** True when the signed-in user's role is `role` or higher. */
  can: (role: Role) => boolean
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [hasToken, setHasToken] = useState(() => !!tokenStore.get())

  const { data: user = null, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: authApi.me,
    enabled: hasToken,
    retry: false,
    staleTime: 5 * 60_000,
  })

  const clearSession = useCallback(() => {
    tokenStore.clear()
    setHasToken(false)
    queryClient.clear()
  }, [queryClient])

  // The API client fires this when any request comes back 401 (expired/invalid token).
  useEffect(() => {
    window.addEventListener(UNAUTHORIZED_EVENT, clearSession)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, clearSession)
  }, [clearSession])

  const value = useMemo<AuthState>(
    () => ({
      user,
      isLoading: hasToken && isLoading,
      login: async (email, password) => {
        const { access_token } = await authApi.login(email, password)
        tokenStore.set(access_token)
        setHasToken(true)
        await queryClient.invalidateQueries({ queryKey: ['me'] })
      },
      signup: async (input) => {
        const { access_token } = await authApi.signup(input)
        tokenStore.set(access_token)
        setHasToken(true)
        await queryClient.invalidateQueries({ queryKey: ['me'] })
      },
      logout: async () => {
        try {
          await authApi.logout()
        } catch {
          /* even if the server can't be reached, sign out locally */
        }
        clearSession()
      },
      can: (role) => (user ? ROLE_RANK[user.role] >= ROLE_RANK[role] : false),
    }),
    [user, hasToken, isLoading, queryClient, clearSession],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}