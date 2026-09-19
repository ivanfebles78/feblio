import { describe, expect, it } from 'vitest'
import { homePathForRole, resolveEmpresaDestination } from './routing'

describe('resolveEmpresaDestination', () => {
  it('sin email verificado → verificación, antes que nada', () => {
    expect(resolveEmpresaDestination({ hasEmpresa: true, emailVerified: false, onboardingStatus: 'not_started', onboardingCurrentStep: null, welcomeSeen: false })).toEqual({ kind: 'verify' })
  })
  it('empresa nueva verificada sin bienvenida vista → bienvenida (una sola vez)', () => {
    expect(resolveEmpresaDestination({ hasEmpresa: true, emailVerified: true, onboardingStatus: 'not_started', onboardingCurrentStep: null, welcomeSeen: false })).toEqual({ kind: 'welcome', path: '/bienvenida' })
    expect(resolveEmpresaDestination({ hasEmpresa: true, emailVerified: true, onboardingStatus: 'in_progress', onboardingCurrentStep: 'billing', welcomeSeen: false }).kind).toBe('welcome')
  })
  it('bienvenida vista → dashboard aunque el onboarding esté incompleto (configuración progresiva)', () => {
    expect(resolveEmpresaDestination({ hasEmpresa: true, emailVerified: true, onboardingStatus: 'not_started', onboardingCurrentStep: null, welcomeSeen: true })).toEqual({ kind: 'dashboard', path: '/empresa' })
    expect(resolveEmpresaDestination({ hasEmpresa: true, emailVerified: true, onboardingStatus: 'requires_attention', onboardingCurrentStep: 'email', welcomeSeen: true }).kind).toBe('dashboard')
  })
  it('empresa existente completed nunca ve la bienvenida, aunque no esté marcada', () => {
    expect(resolveEmpresaDestination({ hasEmpresa: true, emailVerified: true, onboardingStatus: 'completed', onboardingCurrentStep: null, welcomeSeen: false })).toEqual({ kind: 'dashboard', path: '/empresa' })
  })
  it('sin empresa asociada va al dashboard (que muestra el aviso)', () => {
    expect(resolveEmpresaDestination({ hasEmpresa: false, emailVerified: false, onboardingStatus: null, onboardingCurrentStep: null, welcomeSeen: false }).kind).toBe('dashboard')
  })
})

describe('homePathForRole', () => {
  it('cada rol tiene su panel', () => {
    expect(homePathForRole('admin')).toBe('/admin')
    expect(homePathForRole('empresa')).toBe('/empresa')
    expect(homePathForRole('cliente')).toBe('/cliente')
  })
})
