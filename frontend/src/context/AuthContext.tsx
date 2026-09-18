import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { LEGAL_VERSIONS } from '../lib/legal'
import { normalizeTaxId } from '../lib/validation'
import { taxTypeForEntity, type EntityType, type Profile, type TaxType, type UserRole } from '../lib/types'

export interface SignUpParams {
  email: string
  password: string
  /** Nombre y apellidos de la persona propietaria de la cuenta */
  fullName: string
  role: UserRole
  /** Razón social o nombre comercial de la empresa (tenant) */
  companyName?: string
  entityType?: EntityType
  /** Compatibilidad: se infiere de entityType si no se indica */
  taxType?: TaxType
  taxId?: string
  termsAccepted: boolean
  marketingConsent?: boolean
}

export interface SignUpResult {
  error: string | null
  /** Supabase exige confirmar el email por enlace antes de iniciar sesión */
  needsConfirmation: boolean
}

interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  /** Sesión activa pero el perfil aún se está cargando */
  profileLoading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (params: SignUpParams) => Promise<SignUpResult>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

const PROFILE_COLUMNS = 'id, email, full_name, role, empresa_id, cliente_id, contact_email, phone, job_title, is_onboarding_owner'

async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).single()
  if (error) {
    // Proyecto sin la migración 0009: reintenta con las columnas básicas
    const basic = await supabase
      .from('profiles')
      .select('id, email, full_name, role, empresa_id, cliente_id')
      .eq('id', userId)
      .single()
    if (basic.error) {
      console.error('No se pudo cargar el perfil:', basic.error.message)
      return null
    }
    return basic.data as Profile
  }
  return data as Profile
}

/** Metadatos que handle_new_user() usa para crear empresa, perfil y consentimientos. */
export function buildSignUpMetadata(p: SignUpParams, userAgent = ''): Record<string, string | boolean> {
  const entityType = p.entityType ?? (p.taxType === 'NIF' ? 'self_employed' : 'company')
  const taxType = p.taxType ?? taxTypeForEntity(entityType)
  return {
    full_name: p.fullName.trim(),
    role: p.role,
    company_name: (p.companyName ?? '').trim(),
    entity_type: entityType,
    tax_type: taxType,
    tax_id: normalizeTaxId(p.taxId ?? ''),
    terms_accepted: p.termsAccepted,
    terms_version: LEGAL_VERSIONS.terms,
    privacy_version: LEGAL_VERSIONS.privacy,
    marketing_consent: p.marketingConsent ?? false,
    user_agent: userAgent.slice(0, 512),
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(false)

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session)
      if (data.session?.user) {
        setProfileLoading(true)
        setProfile(await loadProfile(data.session.user.id))
        setProfileLoading(false)
      }
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, s) => {
      if (!active) return
      setSession(s)
      if (s?.user) {
        setProfileLoading(true)
        setProfile(await loadProfile(s.user.id))
        setProfileLoading(false)
      } else {
        setProfile(null)
      }
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error ? error.message : null }
  }, [])

  const signUp = useCallback(async (params: SignUpParams): Promise<SignUpResult> => {
    if (!params.termsAccepted) {
      return { error: 'Debes aceptar los Términos del servicio y la Política de privacidad.', needsConfirmation: false }
    }
    const { data, error } = await supabase.auth.signUp({
      email: params.email.trim().toLowerCase(),
      password: params.password,
      options: { data: buildSignUpMetadata(params, typeof navigator !== 'undefined' ? navigator.userAgent : '') },
    })
    if (error) return { error: error.message, needsConfirmation: false }
    // Sin sesión => el proyecto exige confirmación nativa por email (ver docs/onboarding.md).
    return { error: null, needsConfirmation: !data.session }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setProfile(null)
  }, [])

  const refreshProfile = useCallback(async () => {
    if (session?.user) setProfile(await loadProfile(session.user.id))
  }, [session])

  const value = useMemo<AuthState>(
    () => ({ session, profile, loading, profileLoading, signIn, signUp, signOut, refreshProfile }),
    [session, profile, loading, profileLoading, signIn, signUp, signOut, refreshProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
