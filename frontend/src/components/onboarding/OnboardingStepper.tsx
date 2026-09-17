import { Link } from 'react-router-dom'
import { STEPS } from '../../lib/onboarding/steps'
import { onboardingStepPath } from '../../lib/routing'
import type { OnboardingStepKey, StepStatus } from '../../lib/onboarding/types'
import { StepStatusIcon } from './StepStatusBadge'
import { STEP_STATUS_LABEL } from '../../lib/onboarding/steps'

interface OnboardingStepperProps {
  current: OnboardingStepKey
  statuses: Record<OnboardingStepKey, StepStatus>
  /** Llamado antes de navegar; puede vetar (cambios sin guardar) */
  onNavigate?: (key: OnboardingStepKey) => boolean
}

const TONE: Record<StepStatus, string> = {
  pending: 'text-slate-500',
  in_progress: 'text-brand-700',
  completed: 'text-emerald-700',
  skipped: 'text-amber-700',
  error: 'text-red-700',
  requires_attention: 'text-orange-700',
}

/** Stepper lateral (escritorio) y compacto (móvil). Los pasos son enlaces reales. */
export function OnboardingStepper({ current, statuses, onNavigate }: OnboardingStepperProps) {
  const currentDef = STEPS.find((s) => s.key === current)!
  const done = STEPS.filter((s) => statuses[s.key] === 'completed' || statuses[s.key] === 'skipped').length

  return (
    <nav aria-label="Pasos de la configuración">
      {/* Móvil */}
      <div className="lg:hidden">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-slate-800">
            Paso {currentDef.order} de {STEPS.length}
          </span>
          <span className="text-xs text-slate-500">{done} completados</span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={STEPS.length} aria-valuenow={done} aria-label="Progreso de la configuración">
          <div className="h-full rounded-full bg-brand-600 transition-[width] motion-reduce:transition-none" style={{ width: `${(done / STEPS.length) * 100}%` }} />
        </div>
        <ol className="mt-3 flex gap-1.5 overflow-x-auto pb-1" aria-label="Lista de pasos">
          {STEPS.map((s) => {
            const st = statuses[s.key]
            const isCurrent = s.key === current
            return (
              <li key={s.key} className="shrink-0">
                <Link
                  to={onboardingStepPath(s.key)}
                  onClick={(e) => {
                    if (onNavigate && !onNavigate(s.key)) e.preventDefault()
                  }}
                  aria-current={isCurrent ? 'step' : undefined}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
                    isCurrent ? 'border-brand-600 bg-brand-600 text-white' : `border-slate-200 bg-white ${TONE[st]}`
                  }`}
                >
                  <span className="sr-only">Paso {s.order}: </span>
                  {s.short}
                  <span className="sr-only"> ({STEP_STATUS_LABEL[st]})</span>
                </Link>
              </li>
            )
          })}
        </ol>
      </div>

      {/* Escritorio */}
      <ol className="hidden space-y-1 lg:block">
        {STEPS.map((s) => {
          const st = statuses[s.key]
          const isCurrent = s.key === current
          return (
            <li key={s.key}>
              <Link
                to={onboardingStepPath(s.key)}
                onClick={(e) => {
                  if (onNavigate && !onNavigate(s.key)) e.preventDefault()
                }}
                aria-current={isCurrent ? 'step' : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
                  isCurrent ? 'bg-brand-50 text-brand-800 ring-1 ring-brand-200' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${isCurrent ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  {s.order}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{s.title}</span>
                  <span className={`block text-[11px] ${TONE[st]}`}>
                    {STEP_STATUS_LABEL[st]}
                    {!s.required && ' · opcional'}
                  </span>
                </span>
                <span className={TONE[st]}>
                  <StepStatusIcon status={st} />
                </span>
              </Link>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
