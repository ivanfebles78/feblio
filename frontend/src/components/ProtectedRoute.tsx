import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import type { UserRole } from '../lib/types'
import { homePathForRole, rememberReturnTo, sanitizeReturnTo } from '../lib/routing'
import { ErrorScreen, LoadingScreen } from './LoadingScreen'

export function ProtectedRoute({ allow, children }: { allow: UserRole[]; children: ReactNode }) {
  const { t } = useTranslation()
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
  if (!profile && profileLoading) return <LoadingScreen text={t('common.loading.preparingAccount')} />
  if (!profile) {
    return (
      <ErrorScreen
        title={t('common.errors.loadProfile')}
        message={t('common.errors.loadProfileDetail')}
        onRetry={refreshProfile}
        onSignOut={signOut}
      />
    )
  }
  if (!allow.includes(profile.role)) return <Navigate to={homePathForRole(profile.role)} replace />
  return <>{children}</>
}
