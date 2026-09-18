import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { Profile } from '../lib/types'

const authState = vi.hoisted(() => ({
  session: { user: { id: 'u1' } } as unknown,
  profile: null as Profile | null,
  loading: false,
  profileLoading: false,
  signOut: vi.fn(),
  refreshProfile: vi.fn(),
}))
vi.mock('../context/AuthContext', () => ({ useAuth: () => authState }))

const api = vi.hoisted(() => ({
  getEmpresaAccessState: vi.fn(),
  claimNativeVerification: vi.fn(),
}))
vi.mock('../lib/onboarding/api', () => api)
vi.mock('../sections/VerifyEmailScreen', () => ({
  VerifyEmailScreen: ({ email, mode }: { email: string; mode: string }) => <div>VERIFY {email} {mode}</div>,
}))

import { EmpresaGate } from './EmpresaGate'
import { ProtectedRoute } from './ProtectedRoute'

function app(initial: string) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/" element={<div>LANDING</div>} />
        <Route path="/admin" element={<div>ADMIN</div>} />
        <Route path="/cliente" element={<div>CLIENTE</div>} />
        <Route
          path="/empresa"
          element={
            <ProtectedRoute allow={['empresa']}>
              <EmpresaGate mode="dashboard">
                <div>DASHBOARD</div>
              </EmpresaGate>
            </ProtectedRoute>
          }
        />
        <Route
          path="/onboarding/:step?"
          element={
            <ProtectedRoute allow={['empresa']}>
              <EmpresaGate mode="onboarding">
                <div>WIZARD</div>
              </EmpresaGate>
            </ProtectedRoute>
          }
        />
        <Route
          path="/bienvenida"
          element={
            <ProtectedRoute allow={['empresa']}>
              <EmpresaGate mode="welcome">
                <div>WELCOME</div>
              </EmpresaGate>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

const empresaProfile: Profile = { id: 'u1', email: 'ralm@example.com', full_name: 'Ralm', role: 'empresa', empresa_id: 'e1', cliente_id: null }

describe('redirecciones de empresa', () => {
  beforeEach(() => {
    authState.profile = empresaProfile
    api.claimNativeVerification.mockResolvedValue({ ok: false })
  })

  it('muestra carga y luego la verificación si el email no está verificado', async () => {
    api.getEmpresaAccessState.mockResolvedValue({ verification: { has_empresa: true, email_verified: false, mode: 'otp' }, onboarding_status: 'not_started', onboarding_current_step: null, welcome_seen: false })
    app('/empresa')
    expect(screen.getByText(/comprobando tu cuenta/i)).toBeInTheDocument()
    expect(await screen.findByText(/VERIFY ralm@example.com otp/)).toBeInTheDocument()
    expect(screen.queryByText('DASHBOARD')).not.toBeInTheDocument()
  })

  it('empresa nueva verificada sin bienvenida vista: /empresa redirige a /bienvenida', async () => {
    api.getEmpresaAccessState.mockResolvedValue({ verification: { has_empresa: true, email_verified: true, mode: 'native' }, onboarding_status: 'not_started', onboarding_current_step: null, welcome_seen: false })
    app('/empresa')
    expect(await screen.findByText('WELCOME')).toBeInTheDocument()
  })

  it('bienvenida vista: /empresa muestra el dashboard aunque el onboarding esté incompleto', async () => {
    api.getEmpresaAccessState.mockResolvedValue({ verification: { has_empresa: true, email_verified: true, mode: 'native' }, onboarding_status: 'in_progress', onboarding_current_step: 'billing', welcome_seen: true })
    app('/empresa')
    expect(await screen.findByText('DASHBOARD')).toBeInTheDocument()
  })

  it('bienvenida vista: /bienvenida no vuelve a mostrarse (redirige al dashboard)', async () => {
    api.getEmpresaAccessState.mockResolvedValue({ verification: { has_empresa: true, email_verified: true, mode: 'native' }, onboarding_status: 'not_started', onboarding_current_step: null, welcome_seen: true })
    app('/bienvenida')
    expect(await screen.findByText('DASHBOARD')).toBeInTheDocument()
  })

  it('con onboarding incompleto se puede abrir el wizard desde el dashboard', async () => {
    api.getEmpresaAccessState.mockResolvedValue({ verification: { has_empresa: true, email_verified: true, mode: 'native' }, onboarding_status: 'not_started', onboarding_current_step: null, welcome_seen: true })
    app('/onboarding/company')
    expect(await screen.findByText('WIZARD')).toBeInTheDocument()
  })

  it('empresa existente completed nunca ve la bienvenida y entra al dashboard', async () => {
    api.getEmpresaAccessState.mockResolvedValue({ verification: { has_empresa: true, email_verified: true, mode: 'otp' }, onboarding_status: 'completed', onboarding_current_step: null, welcome_seen: false })
    app('/empresa')
    expect(await screen.findByText('DASHBOARD')).toBeInTheDocument()
  })

  it('con onboarding completo, /onboarding redirige a /empresa (sin bucle)', async () => {
    api.getEmpresaAccessState.mockResolvedValue({ verification: { has_empresa: true, email_verified: true, mode: 'otp' }, onboarding_status: 'completed', onboarding_current_step: null, welcome_seen: true })
    app('/onboarding/company')
    expect(await screen.findByText('DASHBOARD')).toBeInTheDocument()
    expect(screen.queryByText('WIZARD')).not.toBeInTheDocument()
  })

  it('en modo nativo reconoce la confirmación de Supabase sin pedir OTP', async () => {
    api.getEmpresaAccessState.mockResolvedValue({ verification: { has_empresa: true, email_verified: false, mode: 'native' }, onboarding_status: 'completed', onboarding_current_step: null, welcome_seen: true })
    api.claimNativeVerification.mockResolvedValue({ ok: true })
    app('/empresa')
    expect(await screen.findByText('DASHBOARD')).toBeInTheDocument()
  })

  it('un cliente final no entra en el wizard de empresa', async () => {
    authState.profile = { ...empresaProfile, role: 'cliente', empresa_id: 'e1', cliente_id: 'c1' }
    app('/onboarding')
    expect(await screen.findByText('CLIENTE')).toBeInTheDocument()
    expect(api.getEmpresaAccessState).not.toHaveBeenCalled()
  })

  it('un admin no queda bloqueado por el wizard', async () => {
    authState.profile = { ...empresaProfile, role: 'admin', empresa_id: null }
    app('/onboarding/company')
    expect(await screen.findByText('ADMIN')).toBeInTheDocument()
  })

  it('sin sesión vuelve al login', async () => {
    authState.session = null
    app('/empresa')
    expect(await screen.findByText('LANDING')).toBeInTheDocument()
    authState.session = { user: { id: 'u1' } }
  })
})
