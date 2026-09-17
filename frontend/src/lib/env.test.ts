import { describe, expect, it } from 'vitest'
import { demoAccounts, isDemoMode } from './env'

describe('modo demo', () => {
  it('está oculto si VITE_DEMO_MODE no está definido', () => {
    expect(isDemoMode({})).toBe(false)
    expect(isDemoMode({ VITE_DEMO_MODE: undefined })).toBe(false)
  })
  it('solo se activa con el valor exacto "true"', () => {
    expect(isDemoMode({ VITE_DEMO_MODE: 'true' })).toBe(true)
    expect(isDemoMode({ VITE_DEMO_MODE: '1' })).toBe(false)
    expect(isDemoMode({ VITE_DEMO_MODE: 'TRUE' })).toBe(false)
  })
  it('parsea las cuentas demo (solo etiqueta y email; nunca contraseñas)', () => {
    expect(demoAccounts({ VITE_DEMO_ACCOUNTS: 'Admin:a@x.com, Empresa:e@x.com,rota' })).toEqual([
      { label: 'Admin', email: 'a@x.com' },
      { label: 'Empresa', email: 'e@x.com' },
    ])
    expect(demoAccounts({})).toEqual([])
  })
})
