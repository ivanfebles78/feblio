import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { OnboardingHeader } from './OnboardingHeader'
import { OnboardingStepper } from './OnboardingStepper'
import { OnboardingNavigation } from './OnboardingNavigation'
import { StepStatusBadge } from './StepStatusBadge'
import { ConfirmDialog } from '../ConfirmDialog'
import { useOnboarding } from '../../lib/onboarding/OnboardingContext'
import { useAuth } from '../../context/AuthContext'
import { STEPS, STEP_KEYS, nextStepKey, prevStepKey, stepDefinition } from '../../lib/onboarding/steps'
import { SKIPPABLE, hasErrors, type FieldErrors } from '../../lib/onboarding/validation'
import { onboardingStepPath } from '../../lib/routing'
import type { OnboardingStepKey, StepStatus } from '../../lib/onboarding/types'

interface OnboardingLayoutProps {
  current: OnboardingStepKey
  errors: FieldErrors
  /** Motivo para bloquear "Siguiente" además de los errores de campo */
  blockedReason?: string
  onShowErrors: () => void
  children: ReactNode
  banner?: ReactNode
}

export function OnboardingLayout({ current, errors, blockedReason, onShowErrors, children, banner }: OnboardingLayoutProps) {
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const ctx = useOnboarding()
  const def = stepDefinition(current)
  const [busy, setBusy] = useState(false)
  const [confirmSkip, setConfirmSkip] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState<null | (() => void)>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  const statuses = STEP_KEYS.reduce(
    (acc, k) => ({ ...acc, [k]: ctx.stepStatus(k) }),
    {} as Record<OnboardingStepKey, StepStatus>,
  )
  const completedCount = STEPS.filter((s) => statuses[s.key] === 'completed' || statuses[s.key] === 'skipped').length

  // Foco en el título al cambiar de paso (lectores de pantalla y teclado)
  useEffect(() => {
    headingRef.current?.focus()
  }, [current])

  /** Persiste lo pendiente; si falla, pide confirmación antes de abandonar. */
  const guardedNavigate = useCallback(
    async (action: () => void) => {
      const ok = await ctx.flush()
      if (ok) action()
      else setConfirmLeave(() => action)
    },
    [ctx],
  )

  const canProceed = !hasErrors(errors) && !blockedReason
  const isLast = current === 'review'

  async function next() {
    if (!canProceed) {
      onShowErrors()
      return
    }
    setBusy(true)
    const ok = await ctx.completeStep(current)
    setBusy(false)
    if (!ok) return
    const n = nextStepKey(current)
    if (n) navigate(onboardingStepPath(n))
  }

  async function skip() {
    setConfirmSkip(false)
    setBusy(true)
    const ok = await ctx.skipStep(current, 'Omitido desde el asistente')
    setBusy(false)
    if (!ok) return
    const n = nextStepKey(current)
    if (n) navigate(onboardingStepPath(n))
  }

  function back() {
    const p = prevStepKey(current)
    if (p) guardedNavigate(() => navigate(onboardingStepPath(p)))
  }

  async function saveAndExit() {
    const ok = await ctx.flush()
    if (!ok) {
      setConfirmLeave(() => () => signOut())
      return
    }
    await signOut()
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <OnboardingHeader
        companyName={ctx.snapshot?.empresa.trade_name || ctx.snapshot?.empresa.name || ''}
        saveState={ctx.saveState}
        saveError={ctx.saveError}
        lastSavedAt={ctx.lastSavedAt}
        dirty={ctx.dirty}
        onRetry={ctx.retry}
        onSaveAndExit={saveAndExit}
        onSignOut={saveAndExit}
      />

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[260px_1fr_240px] lg:px-8 lg:py-8">
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="surface p-3 lg:p-4">
            <OnboardingStepper
              current={current}
              statuses={statuses}
              onNavigate={(key) => {
                if (key === current) return false
                guardedNavigate(() => navigate(onboardingStepPath(key)))
                return false
              }}
            />
          </div>
        </aside>

        <main className="min-w-0">
          {banner && <div className="mb-4">{banner}</div>}
          <div className="surface p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
                  Paso {def.order} de {STEPS.length}
                  {!def.required && ' · opcional'}
                </p>
                <h1 ref={headingRef} tabIndex={-1} className="mt-1 text-2xl font-bold text-slate-900 focus:outline-none">
                  {def.title}
                </h1>
                <p className="mt-1 text-sm text-slate-500">{def.description}</p>
              </div>
              <StepStatusBadge status={statuses[current]} />
            </div>

            <div className="mt-6">{children}</div>

            <OnboardingNavigation
              canGoBack={prevStepKey(current) !== null}
              canProceed={canProceed}
              isLast={isLast}
              skippable={SKIPPABLE.includes(current)}
              busy={busy || ctx.saveState === 'saving'}
              blockedReason={blockedReason ?? (hasErrors(errors) ? 'Revisa los campos marcados para continuar.' : undefined)}
              onBack={back}
              onNext={next}
              onSkip={() => setConfirmSkip(true)}
            />
          </div>
        </main>

        <aside className="hidden lg:block lg:sticky lg:top-20 lg:self-start">
          <div className="surface p-4 text-sm">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Resumen</h2>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {completedCount}
              <span className="text-base font-medium text-slate-400"> / {STEPS.length}</span>
            </p>
            <p className="text-xs text-slate-500">pasos completados u omitidos</p>
            <ul className="mt-4 space-y-1.5 text-xs">
              {STEPS.filter((s) => statuses[s.key] === 'error' || statuses[s.key] === 'requires_attention').map((s) => (
                <li key={s.key} className="rounded-lg bg-orange-50 px-2 py-1.5 text-orange-800">
                  {s.title}: requiere atención
                </li>
              ))}
              {ctx.snapshot?.integrations.filter((i) => i.status === 'pending_credentials').map((i) => (
                <li key={i.kind} className="rounded-lg bg-amber-50 px-2 py-1.5 text-amber-800">
                  {i.provider}: pendiente de credenciales
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[11px] leading-relaxed text-slate-400">
              Tu progreso se guarda automáticamente. Puedes salir y reanudar más tarde desde el mismo paso.
            </p>
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmSkip}
        title={`¿Omitir «${def.title}» por ahora?`}
        tone="warning"
        confirmLabel="Omitir"
        onConfirm={skip}
        onCancel={() => setConfirmSkip(false)}
      >
        Podrás configurarlo más adelante desde Configuración. Este paso quedará marcado como omitido.
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmLeave !== null}
        title="Hay cambios sin guardar"
        tone="danger"
        confirmLabel="Salir sin guardar"
        cancelLabel="Volver"
        onConfirm={() => {
          const action = confirmLeave
          setConfirmLeave(null)
          action?.()
        }}
        onCancel={() => setConfirmLeave(null)}
      >
        No se pudieron guardar los últimos cambios{ctx.saveError ? `: ${ctx.saveError}` : ''}. Si sales ahora se perderán.
      </ConfirmDialog>
    </div>
  )
}
