import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getEmpresaAccessState, claimNativeVerification } from '../lib/onboarding/api'
import { WELCOME_PATH, resolveEmpresaDestination, type OnboardingStatus } from '../lib/routing'
import { VerifyEmailScreen } from '../sections/VerifyEmailScreen'
import { LoadingScreen, ErrorScreen } from './LoadingScreen'

interface EmpresaGateProps {
  /** Qué pantalla envuelve: el dashboard (/empresa), el wizard (/onboarding) o la bienvenida (/bienvenida) */
  mode: 'dashboard' | 'onboarding' | 'welcome'
  children: ReactNode
}

interface AccessState {
  emailVerified: boolean
  verificationMode: 'otp' | 'native'
  onboardingStatus: OnboardingStatus
  onboardingCurrentStep: string | null
  welcomeSeen: boolean
}

/**
 * Puerta de entrada de las cuentas de empresa.
 * Consulta el estado en servidor (verificación + bienvenida + onboarding) y decide:
 * verificación → bienvenida (una sola vez) → dashboard. El wizard es opcional
 * (configuración progresiva); solo se redirige a /empresa cuando ya está completado.
 * Muestra carga mientras consulta y evita bucles: solo redirige cuando el estado
 * del servidor contradice la ruta actual.
 */
export function EmpresaGate({ mode, children }: EmpresaGateProps) {
  const { profile, signOut } = useAuth()
  const location = useLocation()
  const empresaId = profile?.empresa_id ?? null
  const [state, setState] = useState<AccessState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!empresaId) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await getEmpresaAccessState(empresaId)
      let verified = res.verification.email_verified
      // Modo nativo: reconoce la confirmación por enlace sin pedir un segundo código
      if (!verified && res.verification.mode === 'native') {
        const claim = await claimNativeVerification().catch(() => ({ ok: false }))
        verified = claim.ok
      }
      setState({
        emailVerified: verified,
        verificationMode: res.verification.mode,
        onboardingStatus: res.onboarding_status ?? 'not_started',
        onboardingCurrentStep: res.onboarding_current_step,
        welcomeSeen: res.welcome_seen,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo comprobar el estado de la cuenta.')
    } finally {
      setLoading(false)
    }
  }, [empresaId])

  // Se vuelve a consultar al cambiar de modo: React reutiliza esta instancia entre las rutas
  // /bienvenida → /empresa (mismo tipo de elemento), y el estado previo quedaría obsoleto.
  useEffect(() => {
    load()
  }, [load, mode])

  if (!empresaId) {
    // Cuenta de empresa sin tenant (caso anómalo): el dashboard muestra el aviso; el wizard no aplica.
    return mode === 'dashboard' ? <>{children}</> : <Navigate to="/empresa" replace />
  }
  if (loading) return <LoadingScreen text="Comprobando tu cuenta…" />
  if (error || !state) {
    return <ErrorScreen message={error ?? 'Estado desconocido.'} onRetry={load} onSignOut={signOut} />
  }

  const destination = resolveEmpresaDestination({
    hasEmpresa: true,
    emailVerified: state.emailVerified,
    onboardingStatus: state.onboardingStatus,
    onboardingCurrentStep: state.onboardingCurrentStep,
    welcomeSeen: state.welcomeSeen,
  })

  if (destination.kind === 'verify') {
    return <VerifyEmailScreen email={profile?.email ?? ''} mode={state.verificationMode} onVerified={load} />
  }
  if (destination.kind === 'welcome' && mode !== 'welcome') {
    return <Navigate to={WELCOME_PATH} replace state={{ from: location.pathname }} />
  }
  if (destination.kind === 'dashboard' && mode === 'welcome') {
    return <Navigate to="/empresa" replace />
  }
  if (destination.kind === 'dashboard' && mode === 'onboarding' && state.onboardingStatus === 'completed') {
    // Configuración ya activada: el wizard solo se reabre desde Configuración (reopen)
    return <Navigate to="/empresa" replace />
  }
  return <>{children}</>
}
