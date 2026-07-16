import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile, UserRole } from '../lib/types'

interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (
    email: string,
    password: string,
    fullName: string,
    role: UserRole,
  ) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, empresa_id, cliente_id')
    .eq('id', userId)
    .single()
  if (error) {
    console.error('No se pudo cargar el perfil:', error.message)
    return null
  }
  return data as Profile
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session)
      if (data.session?.user) {
        setProfile(await loadProfile(data.session.user.id))
      }
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, s) => {
      if (!active) return
      setSession(s)
      setProfile(s?.user ? await loadProfile(s.user.id) : null)
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error ? error.message : null }
  }

  async function signUp(
    email: string,
    password: string,
    fullName: string,
    role: UserRole,
  ) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, role } },
    })
    return { error: error ? error.message : null }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setProfile(null)
  }

  const value = useMemo<AuthState>(
    () => ({ session, profile, loading, signIn, signUp, signOut }),
    [session, profile, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
