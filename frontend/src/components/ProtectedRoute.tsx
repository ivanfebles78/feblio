import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'
import type { UserRole } from '../lib/types'
import { homePathForRole } from '../lib/routing'
import { ErrorScreen, LoadingScreen } from './LoadingScreen'

export function ProtectedRoute({ allow, children }: { allow: UserRole[]; children: ReactNode }) {
  const { session, profile, loading, profileLoading, refreshProfile, signOut } = useAuth()

  if (loading) return <LoadingScreen />
  if (!session) return <Navigate to="/" replace />
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
