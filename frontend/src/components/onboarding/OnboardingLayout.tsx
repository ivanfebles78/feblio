import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
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

  /** Guarda y vuelve al dashboard: la configuración es progresiva y nunca bloquea el panel. */
  async function saveAndExit() {
    const ok = await ctx.flush()
    if (!ok) {
      setConfirmLeave(() => () => navigate('/empresa'))
      return
    }
    navigate('/empresa')
  }

  async function saveAndSignOut() {
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
        onSignOut={saveAndSignOut}
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
                  {t('onboarding.layout.stepOf', { order: def.order, total: STEPS.length })}
                  {!def.required && t('onboarding.layout.optionalSuffix')}
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
              blockedReason={blockedReason ?? (hasErrors(errors) ? t('onboarding.layout.fixFields') : undefined)}
              onBack={back}
              onNext={next}
              onSkip={() => setConfirmSkip(true)}
            />
          </div>
        </main>

        <aside className="hidden lg:block lg:sticky lg:top-20 lg:self-start">
          <div className="surface p-4 text-sm">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t('onboarding.layout.summary')}</h2>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {completedCount}
              <span className="text-base font-medium text-slate-400"> / {STEPS.length}</span>
            </p>
            <p className="text-xs text-slate-500">{t('onboarding.layout.completedOrSkipped')}</p>
            <ul className="mt-4 space-y-1.5 text-xs">
              {STEPS.filter((s) => statuses[s.key] === 'error' || statuses[s.key] === 'requires_attention').map((s) => (
                <li key={s.key} className="rounded-lg bg-orange-50 px-2 py-1.5 text-orange-800">
                  {t('onboarding.layout.needsAttention', { title: s.title })}
                </li>
              ))}
              {ctx.snapshot?.integrations.filter((i) => i.status === 'pending_credentials').map((i) => (
                <li key={i.kind} className="rounded-lg bg-amber-50 px-2 py-1.5 text-amber-800">
                  {t('onboarding.layout.pendingCredentials', { provider: i.provider })}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[11px] leading-relaxed text-slate-400">
              {t('onboarding.layout.autosaveNote')}
            </p>
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmSkip}
        title={t('onboarding.layout.skipTitle', { title: def.title })}
        tone="warning"
        confirmLabel={t('onboarding.layout.skip')}
        onConfirm={skip}
        onCancel={() => setConfirmSkip(false)}
      >
        {t('onboarding.layout.skipBody')}
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmLeave !== null}
        title={t('onboarding.layout.unsavedTitle')}
        tone="danger"
        confirmLabel={t('onboarding.layout.leaveWithoutSaving')}
        cancelLabel={t('common.actions.back')}
        onConfirm={() => {
          const action = confirmLeave
          setConfirmLeave(null)
          action?.()
        }}
        onCancel={() => setConfirmLeave(null)}
      >
        {ctx.saveError ? t('onboarding.layout.unsavedBodyWithError', { error: ctx.saveError }) : t('onboarding.layout.unsavedBody')}
      </ConfirmDialog>
    </div>
  )
}
