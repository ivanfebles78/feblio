import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'
import type { UserRole } from '../lib/types'

export function ProtectedRoute({
  allow,
  children,
}: {
  allow: UserRole[]
  children: ReactNode
}) {
  const { session, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 text-slate-400">
        Cargando…
      </div>
    )
  }
  if (!session) return <Navigate to="/" replace />
  if (profile && !allow.includes(profile.role)) {
    return <Navigate to={`/${profile.role}`} replace />
  }
  return <>{children}</>
}
