import type { UserRole } from './types'

export type OnboardingStatus = 'not_started' | 'in_progress' | 'completed' | 'requires_attention'

export interface EmpresaAccessState {
  /** La cuenta tiene una empresa asociada */
  hasEmpresa: boolean
  emailVerified: boolean
  onboardingStatus: OnboardingStatus | null
  onboardingCurrentStep: string | null
  /** La bienvenida de primera entrada ya se mostró (0013). */
  welcomeSeen: boolean
}

export type EmpresaDestination =
  | { kind: 'verify' }
  | { kind: 'welcome'; path: '/bienvenida' }
  | { kind: 'dashboard'; path: '/empresa' }

/**
 * Decide a dónde debe ir una cuenta de empresa según su estado.
 * verificación → bienvenida (una sola vez, solo empresas nuevas) → dashboard.
 * El wizard ya no es obligatorio: la configuración es progresiva desde el dashboard.
 * Es una función pura para poder probarla sin React ni Supabase.
 */
export function resolveEmpresaDestination(state: EmpresaAccessState): EmpresaDestination {
  if (!state.hasEmpresa) return { kind: 'dashboard', path: '/empresa' }
  if (!state.emailVerified) return { kind: 'verify' }
  if (!state.welcomeSeen && state.onboardingStatus !== 'completed') return { kind: 'welcome', path: '/bienvenida' }
  return { kind: 'dashboard', path: '/empresa' }
}

/** Ruta "home" de cada rol. Admin y cliente nunca pasan por el wizard de empresa. */
export function homePathForRole(role: UserRole): string {
  switch (role) {
    case 'admin':
      return '/admin'
    case 'cliente':
      return '/cliente'
    case 'empresa':
    default:
      return '/empresa'
  }
}

export const ONBOARDING_BASE = '/onboarding'
export const WELCOME_PATH = '/bienvenida'
export const REGISTER_PATH = '/registro'
export const FORGOT_PASSWORD_PATH = '/recuperar-contrasena'
export const RESET_PASSWORD_PATH = '/restablecer-contrasena'
export const onboardingStepPath = (step: string) => `${ONBOARDING_BASE}/${step}`
