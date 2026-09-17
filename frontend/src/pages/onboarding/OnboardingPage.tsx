import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { OnboardingLayout } from '../../components/onboarding/OnboardingLayout'
import { OnboardingResumeBanner } from '../../components/onboarding/OnboardingResumeBanner'
import { LoadingScreen, ErrorScreen } from '../../components/LoadingScreen'
import { OnboardingProvider, useOnboarding } from '../../lib/onboarding/OnboardingContext'
import { STEPS, STEP_KEYS, firstOpenStep, isStepKey } from '../../lib/onboarding/steps'
import { onboardingStepPath } from '../../lib/routing'
import { useAuth } from '../../context/AuthContext'
import type { OnboardingStepKey, StepStatus } from '../../lib/onboarding/types'
import { STEP_REGISTRY } from './registry'

export default function OnboardingPage() {
  return (
    <OnboardingProvider>
      <OnboardingRouter />
    </OnboardingProvider>
  )
}

function OnboardingRouter() {
  const { step } = useParams<{ step?: string }>()
  const ctx = useOnboarding()
  const { signOut } = useAuth()

  if (ctx.loading) return <LoadingScreen text="Cargando tu configuración…" />
  if (ctx.error || !ctx.snapshot) return <ErrorScreen message={ctx.error ?? 'Sin datos.'} onRetry={ctx.reload} onSignOut={signOut} />

  if (!isStepKey(step)) {
    // Reanudar: último paso guardado o primer paso abierto
    const statuses = STEP_KEYS.reduce((acc, k) => ({ ...acc, [k]: ctx.stepStatus(k) }), {} as Record<OnboardingStepKey, StepStatus>)
    const saved = ctx.snapshot.empresa.onboarding_current_step
    const target = isStepKey(saved ?? undefined) ? (saved as OnboardingStepKey) : firstOpenStep(statuses)
    return <Navigate to={onboardingStepPath(target)} replace />
  }

  return <OnboardingStepView step={step} />
}

function OnboardingStepView({ step }: { step: OnboardingStepKey }) {
  const ctx = useOnboarding()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [showErrors, setShowErrors] = useState(false)
  const entry = STEP_REGISTRY[step]
  const errors = useMemo(() => entry.validate(ctx), [entry, ctx])
  const blocked = entry.blocked?.(ctx)

  // Al cambiar de paso: reinicia "mostrar errores"
  useEffect(() => {
    setShowErrors(false)
  }, [step])

  // Resultado de un OAuth (vuelta desde /integraciones/callback)
  const oauth = params.get('oauth')
  const oauthMessage = params.get('message')
  useEffect(() => {
    if (oauth) {
      ctx.reload()
      const t = window.setTimeout(() => navigate(onboardingStepPath(step), { replace: true }), 6000)
      return () => window.clearTimeout(t)
    }
  }, [oauth]) // eslint-disable-line react-hooks/exhaustive-deps

  const completedCount = STEPS.filter((s) => ['completed', 'skipped'].includes(ctx.stepStatus(s.key))).length
  const isResuming = ctx.snapshot?.empresa.onboarding_status === 'in_progress' && completedCount > 0 && step === ctx.snapshot.empresa.onboarding_current_step

  const banner = oauth ? (
    <div className={`rounded-2xl px-4 py-3 text-sm ${oauth === 'connected' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`} role="status">
      {oauth === 'connected' ? 'Conexión completada correctamente.' : `La conexión no se completó${oauthMessage ? `: ${oauthMessage}` : '.'}`}
    </div>
  ) : isResuming ? (
    <OnboardingResumeBanner currentStep={step} completedCount={completedCount} />
  ) : undefined

  const Component = entry.Component
  return (
    <OnboardingLayout current={step} errors={errors} blockedReason={blocked} onShowErrors={() => setShowErrors(true)} banner={banner}>
      <Component mode="wizard" errors={errors} showErrors={showErrors} />
    </OnboardingLayout>
  )
}
