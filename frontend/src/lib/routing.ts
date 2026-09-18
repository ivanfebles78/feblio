import type { UserRole } from './types'

export type OnboardingStatus = 'not_started' | 'in_progress' | 'completed' | 'requires_attention'

export interface EmpresaAccessState {
  /** La cuenta tiene una empresa asociada */
  hasEmpresa: boolean
  emailVerified: boolean
  onboardingStatus: OnboardingStatus | null
  onboardingCurrentStep: string | null
}

export type EmpresaDestination =
  | { kind: 'verify' }
  | { kind: 'onboarding'; path: string }
  | { kind: 'dashboard'; path: '/empresa' }

/**
 * Decide a dónde debe ir una cuenta de empresa según su estado.
 * Es una función pura para poder probarla sin React ni Supabase.
 */
export function resolveEmpresaDestination(state: EmpresaAccessState): EmpresaDestination {
  if (!state.hasEmpresa) return { kind: 'dashboard', path: '/empresa' }
  if (!state.emailVerified) return { kind: 'verify' }
  if (state.onboardingStatus !== 'completed') {
    const step = state.onboardingCurrentStep
    return { kind: 'onboarding', path: step ? `/onboarding/${step}` : '/onboarding' }
  }
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
export const onboardingStepPath = (step: string) => `${ONBOARDING_BASE}/${step}`
