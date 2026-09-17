import type { ReactNode } from 'react'
import { ProtectedRoute } from './ProtectedRoute'
import { EmpresaGate } from './EmpresaGate'

/**
 * Ruta protegida del wizard: solo cuentas de empresa, con email verificado y
 * onboarding no completado. Admin y cliente se redirigen a su propio panel.
 */
export function OnboardingRoute({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute allow={['empresa']}>
      <EmpresaGate mode="onboarding">{children}</EmpresaGate>
    </ProtectedRoute>
  )
}
