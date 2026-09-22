import { t } from '../../i18n'
import { STEPS } from './steps'
import type { OnboardingStepKey, StepStatus } from './types'

/**
 * Configuración progresiva: los 10 pasos reales del wizard agrupados en 5 áreas
 * visibles en el dashboard. El mapeo sigue el orden y las claves de STEPS
 * (lib/onboarding/steps.ts); los pasos y sus datos no cambian.
 *
 *   1 Perfil de empresa            → company
 *   2 Documentos y formularios     → repository, forms
 *   3 Canales de comunicación      → email, whatsapp, sms, voice   (opcionales)
 *   4 Automatizaciones             → automation
 *   5 Facturación y activación     → billing, review
 */
export type SetupAreaKey = 'company' | 'documents' | 'channels' | 'catalog' | 'automation' | 'billing'

export interface SetupAreaDefinition {
  key: SetupAreaKey
  /** Título traducido (getter: se resuelve al leerlo según el idioma activo). */
  readonly title: string
  readonly description: string
  steps: OnboardingStepKey[]
  /** Minutos estimados para completar el área (orientativo). */
  minutes: number
}

export function areaTitle(key: SetupAreaKey): string {
  return t(`onboarding.areas.${key}.title`)
}
export function areaDescription(key: SetupAreaKey): string {
  return t(`onboarding.areas.${key}.description`)
}

function defineArea(key: SetupAreaKey, steps: OnboardingStepKey[], minutes: number): SetupAreaDefinition {
  return {
    key,
    steps,
    minutes,
    get title() {
      return areaTitle(key)
    },
    get description() {
      return areaDescription(key)
    },
  }
}

export const SETUP_AREAS: SetupAreaDefinition[] = [
  defineArea('company', ['company'], 4),
  defineArea('documents', ['repository', 'forms'], 6),
  defineArea('channels', ['email', 'whatsapp', 'sms', 'voice'], 6),
  defineArea('catalog', ['services'], 5),
  defineArea('automation', ['automation'], 3),
  defineArea('billing', ['billing', 'review'], 5),
]

// Comprobación estática: cada paso real pertenece exactamente a un área.
const MAPPED = SETUP_AREAS.flatMap((a) => a.steps)
if (MAPPED.length !== STEPS.length || STEPS.some((s) => !MAPPED.includes(s.key))) {
  throw new Error('SETUP_AREAS no cubre exactamente los pasos del onboarding')
}

export type StepStatuses = Partial<Record<OnboardingStepKey, StepStatus>>

const isDone = (s: StepStatus | undefined) => s === 'completed' || s === 'skipped'

export interface SetupAreaProgress extends SetupAreaDefinition {
  status: 'done' | 'current' | 'pending'
  /** Primer paso real del área que sigue abierto (si el área no está completa). */
  nextStep: OnboardingStepKey | null
  completedSteps: number
}

export interface SetupProgress {
  areas: SetupAreaProgress[]
  completedAreas: number
  totalAreas: number
  percent: number
  /** Siguiente área recomendada (la primera incompleta) y su paso real. */
  nextArea: SetupAreaProgress | null
  nextStep: OnboardingStepKey | null
  minutesRemaining: number
  complete: boolean
}

/**
 * Calcula el progreso por áreas a partir de los estados reales de los pasos.
 * Los pasos sin fila (empresa recién creada) cuentan como pendientes.
 * Si onboarding_status es 'completed' (activación hecha o empresa preexistente),
 * todo se considera completo aunque falten filas.
 */
export function computeSetupProgress(statuses: StepStatuses, onboardingStatus?: string | null): SetupProgress {
  const forceComplete = onboardingStatus === 'completed'
  let currentAssigned = false
  const areas: SetupAreaProgress[] = SETUP_AREAS.map((a) => {
    const done = forceComplete ? a.steps.length : a.steps.filter((k) => isDone(statuses[k])).length
    const nextStep = forceComplete ? null : (a.steps.find((k) => !isDone(statuses[k])) ?? null)
    let status: SetupAreaProgress['status'] = 'pending'
    if (done === a.steps.length) status = 'done'
    else if (!currentAssigned) {
      status = 'current'
      currentAssigned = true
    }
    return { ...a, status, nextStep, completedSteps: done, get title() { return areaTitle(a.key) }, get description() { return areaDescription(a.key) } }
  })
  const completedAreas = areas.filter((a) => a.status === 'done').length
  const nextArea = areas.find((a) => a.status === 'current') ?? null
  const minutesRemaining = areas.filter((a) => a.status !== 'done').reduce((s, a) => s + a.minutes, 0)
  return {
    areas,
    completedAreas,
    totalAreas: areas.length,
    percent: Math.round((completedAreas / areas.length) * 100),
    nextArea,
    nextStep: nextArea?.nextStep ?? null,
    minutesRemaining,
    complete: completedAreas === areas.length,
  }
}

export const SETUP_TOTAL_MINUTES = SETUP_AREAS.reduce((s, a) => s + a.minutes, 0)
