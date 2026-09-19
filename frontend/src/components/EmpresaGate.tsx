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
  // El estado se guarda junto con el modo para el que se consultó: React reutiliza esta
  // instancia entre rutas (/empresa ↔ /bienvenida, mismo tipo de elemento) y, sin esta marca,
  // un render intermedio con el estado del modo anterior podía mostrar la pantalla equivocada
  // durante un instante (y redirigir en bucle si la bienvenida acababa de marcarse como vista).
  const [state, setState] = useState<{ forMode: EmpresaGateProps['mode']; data: AccessState } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (forMode: EmpresaGateProps['mode']) => {
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
        forMode,
        data: {
          emailVerified: verified,
          verificationMode: res.verification.mode,
          onboardingStatus: res.onboarding_status ?? 'not_started',
          onboardingCurrentStep: res.onboarding_current_step,
          welcomeSeen: res.welcome_seen,
        },
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo comprobar el estado de la cuenta.')
    } finally {
      setLoading(false)
    }
  }, [empresaId])

  // Se vuelve a consultar al cambiar de modo (ver comentario del estado).
  useEffect(() => {
    load(mode)
  }, [load, mode])
  const reload = useCallback(() => load(mode), [load, mode])

  if (!empresaId) {
    // Cuenta de empresa sin tenant (caso anómalo): el dashboard muestra el aviso; el wizard no aplica.
    return mode === 'dashboard' ? <>{children}</> : <Navigate to="/empresa" replace />
  }
  if (error) {
    return <ErrorScreen message={error} onRetry={reload} onSignOut={signOut} />
  }
  // Mientras el estado no corresponda al modo actual no se decide nada (evita el render intermedio).
  if (loading || !state || state.forMode !== mode) return <LoadingScreen text="Comprobando tu cuenta…" />
  const access = state.data

  const destination = resolveEmpresaDestination({
    hasEmpresa: true,
    emailVerified: access.emailVerified,
    onboardingStatus: access.onboardingStatus,
    onboardingCurrentStep: access.onboardingCurrentStep,
    welcomeSeen: access.welcomeSeen,
  })

  if (destination.kind === 'verify') {
    return <VerifyEmailScreen email={profile?.email ?? ''} mode={access.verificationMode} onVerified={reload} />
  }
  if (destination.kind === 'welcome' && mode !== 'welcome') {
    return <Navigate to={WELCOME_PATH} replace state={{ from: location.pathname }} />
  }
  if (destination.kind === 'dashboard' && mode === 'welcome') {
    return <Navigate to="/empresa" replace />
  }
  if (destination.kind === 'dashboard' && mode === 'onboarding' && access.onboardingStatus === 'completed') {
    // Configuración ya activada: el wizard solo se reabre desde Configuración (reopen)
    return <Navigate to="/empresa" replace />
  }
  return <>{children}</>
}
