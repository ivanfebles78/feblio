import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'
import type { UserRole } from '../lib/types'
import { homePathForRole, rememberReturnTo, sanitizeReturnTo } from '../lib/routing'
import { ErrorScreen, LoadingScreen } from './LoadingScreen'

export function ProtectedRoute({ allow, children }: { allow: UserRole[]; children: ReactNode }) {
  const { session, profile, loading, profileLoading, refreshProfile, signOut } = useAuth()
  const location = useLocation()

  if (loading) return <LoadingScreen />
  if (!session) {
    // Conserva la ruta interna pedida (p. ej. un enlace profundo abierto desde un magic link)
    // para volver a ella cuando la sesión quede establecida. Solo rutas relativas internas.
    const from = sanitizeReturnTo(`${location.pathname}${location.search}`)
    rememberReturnTo(from)
    return <Navigate to="/" replace state={from ? { from } : undefined} />
  }
  if (!profile && profileLoading) return <LoadingScreen text="Preparando tu cuenta…" />
  if (!profile) {
    return (
      <ErrorScreen
        title="No se pudo cargar tu perfil"
        message="Tu sesión es válida pero no encontramos tu perfil. Reintenta o cierra sesión."
        onRetry={refreshProfile}
        onSignOut={signOut}
      />
    )
  }
  if (!allow.includes(profile.role)) return <Navigate to={homePathForRole(profile.role)} replace />
  return <>{children}</>
}
