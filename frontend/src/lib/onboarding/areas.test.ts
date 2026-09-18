import { describe, expect, it } from 'vitest'
import { SETUP_AREAS, SETUP_TOTAL_MINUTES, computeSetupProgress } from './areas'
import { STEPS } from './steps'

describe('SETUP_AREAS', () => {
  it('agrupa exactamente los 10 pasos reales en 5 áreas sin repetir', () => {
    const mapped = SETUP_AREAS.flatMap((a) => a.steps)
    expect(SETUP_AREAS).toHaveLength(5)
    expect(mapped).toHaveLength(STEPS.length)
    expect(new Set(mapped).size).toBe(STEPS.length)
    expect(mapped.sort()).toEqual(STEPS.map((s) => s.key).sort())
  })
})

describe('computeSetupProgress', () => {
  it('empresa recién creada: 0 %, primera área actual y primer paso real "company"', () => {
    const p = computeSetupProgress({})
    expect(p.percent).toBe(0)
    expect(p.completedAreas).toBe(0)
    expect(p.nextArea?.key).toBe('company')
    expect(p.nextStep).toBe('company')
    expect(p.minutesRemaining).toBe(SETUP_TOTAL_MINUTES)
    expect(p.complete).toBe(false)
  })

  it('área completada cuando todos sus pasos están completados u omitidos', () => {
    const p = computeSetupProgress({ company: 'completed', repository: 'completed', forms: 'skipped', email: 'in_progress' })
    expect(p.areas[0].status).toBe('done')
    expect(p.areas[1].status).toBe('done')
    expect(p.areas[2].status).toBe('current')
    expect(p.nextStep).toBe('email')
    expect(p.completedAreas).toBe(2)
    expect(p.percent).toBe(40)
    expect(p.minutesRemaining).toBe(6 + 3 + 5)
  })

  it('el siguiente paso real es el primero abierto dentro del área actual', () => {
    const p = computeSetupProgress({ company: 'completed', repository: 'completed', forms: 'pending' })
    expect(p.nextArea?.key).toBe('documents')
    expect(p.nextStep).toBe('forms')
  })

  it('onboarding completed fuerza el 100 % aunque falten filas de pasos', () => {
    const p = computeSetupProgress({}, 'completed')
    expect(p.percent).toBe(100)
    expect(p.complete).toBe(true)
    expect(p.nextStep).toBeNull()
    expect(p.minutesRemaining).toBe(0)
  })
})
