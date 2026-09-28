import { describe, expect, test } from 'vitest'
import { evaluateBilling, type BillingInfo } from './logic'

const NOW = Date.parse('2026-06-15T12:00:00Z')
const info = (over: Partial<BillingInfo>): BillingInfo => ({ subscription_status: 'trial', trial_ends_at: null, current_period_end: null, ...over })

describe('evaluateBilling', () => {
  test('active concede acceso', () => {
    expect(evaluateBilling(info({ subscription_status: 'active' }), NOW)).toEqual({ allowed: true, state: 'active', daysLeft: null })
  })

  test('prueba vigente concede acceso y calcula los días que quedan', () => {
    const trial_ends_at = new Date(NOW + 3 * 86_400_000 + 1000).toISOString()
    const r = evaluateBilling(info({ subscription_status: 'trial', trial_ends_at }), NOW)
    expect(r.allowed).toBe(true)
    expect(r.state).toBe('trial')
    expect(r.daysLeft).toBe(4) // ceil de 3 días y algo
  })

  test('prueba vencida bloquea', () => {
    const trial_ends_at = new Date(NOW - 1000).toISOString()
    expect(evaluateBilling(info({ subscription_status: 'trial', trial_ends_at }), NOW)).toMatchObject({ allowed: false, state: 'trial_expired' })
  })

  test('prueba sin fecha bloquea', () => {
    expect(evaluateBilling(info({ subscription_status: 'trial', trial_ends_at: null }), NOW)).toMatchObject({ allowed: false, state: 'trial_expired' })
  })

  test('past_due y canceled bloquean', () => {
    expect(evaluateBilling(info({ subscription_status: 'past_due' }), NOW).allowed).toBe(false)
    expect(evaluateBilling(info({ subscription_status: 'canceled' }), NOW).allowed).toBe(false)
  })
})
