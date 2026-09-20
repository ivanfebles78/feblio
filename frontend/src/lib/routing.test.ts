import { beforeEach, describe, expect, it } from 'vitest'
import { clearReturnTo, homePathForRole, rememberReturnTo, resolveEmpresaDestination, resolveReturnTo, sanitizeReturnTo, takeReturnTo } from './routing'

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

describe('conservación de ruta tras autenticar (sanitizeReturnTo / resolveReturnTo)', () => {
  beforeEach(() => localStorage.clear())

  it('acepta solo rutas internas relativas y conserva búsqueda y fragmento', () => {
    expect(sanitizeReturnTo('/empresa/solicitudes/abc?tab=docs#conv')).toBe('/empresa/solicitudes/abc?tab=docs#conv')
    expect(sanitizeReturnTo('/cliente?solicitud=s1')).toBe('/cliente?solicitud=s1')
  })

  it('rechaza URLs externas, protocol-relative, esquemas, barras invertidas y codificaciones', () => {
    for (const bad of ['https://evil.example/x', 'http://evil.example', '//evil.example/x', '/\\evil.example', '/\\\\evil.example', 'javascript:alert(1)', '/%2f%2fevil.example', '/%5cevil', '  ', '', '/', 'empresa', '/a b', null, undefined, '/' + 'a'.repeat(3000)]) {
      expect(sanitizeReturnTo(bad as string)).toBeNull()
    }
  })

  it('devuelve la ruta si el rol puede abrirla y la home del rol si no', () => {
    expect(resolveReturnTo('/empresa/solicitudes/abc', 'empresa')).toBe('/empresa/solicitudes/abc')
    expect(resolveReturnTo('/cliente?solicitud=s1', 'cliente')).toBe('/cliente?solicitud=s1')
    expect(resolveReturnTo('/admin', 'admin')).toBe('/admin')
    expect(resolveReturnTo('/empresa/solicitudes/abc', 'cliente')).toBe('/cliente') // ruta no autorizada
    expect(resolveReturnTo('/admin/usuarios', 'empresa')).toBe('/empresa')
    expect(resolveReturnTo('/empresarial', 'empresa')).toBe('/empresa') // prefijo parcial no cuenta
    expect(resolveReturnTo('https://evil.example', 'empresa')).toBe('/empresa') // manipulada
    expect(resolveReturnTo(null, 'empresa')).toBe('/empresa') // login normal sin ruta guardada
  })

  it('recuerda la ruta en localStorage, la entrega una sola vez y caduca a los 10 minutos', () => {
    rememberReturnTo('/empresa/solicitudes/abc')
    expect(takeReturnTo()).toBe('/empresa/solicitudes/abc')
    expect(takeReturnTo()).toBeNull()
    rememberReturnTo('//evil.example')
    expect(takeReturnTo()).toBeNull()
    rememberReturnTo('/empresa/plantillas')
    expect(takeReturnTo(Date.now() + 11 * 60 * 1000)).toBeNull()
    rememberReturnTo('/empresa/plantillas')
    clearReturnTo()
    expect(takeReturnTo()).toBeNull()
  })
})
