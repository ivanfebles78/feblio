import { describe, expect, it } from 'vitest'
import { homePathForRole, resolveEmpresaDestination } from './routing'

describe('resolveEmpresaDestination', () => {
  it('envía a verificación si el email no está verificado', () => {
    expect(resolveEmpresaDestination({ hasEmpresa: true, emailVerified: false, onboardingStatus: 'not_started', onboardingCurrentStep: null })).toEqual({ kind: 'verify' })
  })
  it('un onboarding incompleto entra en /onboarding (reanudando el último paso)', () => {
    expect(resolveEmpresaDestination({ hasEmpresa: true, emailVerified: true, onboardingStatus: 'in_progress', onboardingCurrentStep: 'billing' })).toEqual({ kind: 'onboarding', path: '/onboarding/billing' })
    expect(resolveEmpresaDestination({ hasEmpresa: true, emailVerified: true, onboardingStatus: 'not_started', onboardingCurrentStep: null })).toEqual({ kind: 'onboarding', path: '/onboarding' })
    expect(resolveEmpresaDestination({ hasEmpresa: true, emailVerified: true, onboardingStatus: 'requires_attention', onboardingCurrentStep: 'email' }).kind).toBe('onboarding')
  })
  it('un onboarding completo entra en /empresa', () => {
    expect(resolveEmpresaDestination({ hasEmpresa: true, emailVerified: true, onboardingStatus: 'completed', onboardingCurrentStep: null })).toEqual({ kind: 'dashboard', path: '/empresa' })
  })
  it('una cuenta sin empresa no queda atrapada', () => {
    expect(resolveEmpresaDestination({ hasEmpresa: false, emailVerified: false, onboardingStatus: null, onboardingCurrentStep: null }).kind).toBe('dashboard')
  })
})

describe('homePathForRole', () => {
  it('admin y cliente nunca van al wizard de empresa', () => {
    expect(homePathForRole('admin')).toBe('/admin')
    expect(homePathForRole('cliente')).toBe('/cliente')
    expect(homePathForRole('empresa')).toBe('/empresa')
  })
})
