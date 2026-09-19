import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const auth = vi.hoisted(() => ({
  session: null as unknown,
  passwordRecovery: false,
  loading: false,
  updatePassword: vi.fn(),
  signOut: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }))

const params = vi.hoisted(() => ({ type: null as string | null, error: null as string | null, errorCode: null as string | null, errorDescription: null as string | null }))
vi.mock('../lib/supabase', () => ({ initialAuthParams: params, supabase: {} }))

import ResetPasswordPage from './ResetPasswordPage'

function setup() {
  render(
    <MemoryRouter initialEntries={['/restablecer-contrasena']}>
      <Routes>
        <Route path="/" element={<div>LOGIN</div>} />
        <Route path="/recuperar-contrasena" element={<div>FORGOT</div>} />
        <Route path="/restablecer-contrasena" element={<ResetPasswordPage />} />
      </Routes>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

describe('<ResetPasswordPage />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    auth.session = null
    auth.passwordRecovery = false
    auth.loading = false
    params.type = null
    params.error = null
    params.errorCode = null
    params.errorDescription = null
  })

  it('enlace caducado: mensaje en español y acceso para pedir otro', () => {
    params.error = 'access_denied'
    params.errorCode = 'otp_expired'
    params.errorDescription = 'Email link is invalid or has expired'
    setup()
    expect(screen.getByRole('alert')).toHaveTextContent(/ha caducado/i)
    expect(screen.getByRole('link', { name: /solicitar un enlace nuevo/i })).toHaveAttribute('href', '/recuperar-contrasena')
  })

  it('sin sesión de recuperación (enlace inválido o abierto a mano) → no válido', () => {
    setup()
    expect(screen.getByRole('alert')).toHaveTextContent(/no es válido o ha caducado/i)
  })

  it('con sesión de recuperación muestra el formulario y aplica los requisitos del registro', async () => {
    auth.session = { user: { email: 'laura@norte.es' } }
    auth.passwordRecovery = true
    const user = setup()
    expect(screen.getByText(/laura@norte\.es/)).toBeInTheDocument()
    await user.type(screen.getByLabelText(/^contraseña nueva/i), 'corta')
    await user.type(screen.getByLabelText(/confirmar contraseña nueva/i), 'otra')
    await user.click(screen.getByRole('button', { name: /guardar contraseña/i }))
    expect(auth.updatePassword).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/^contraseña nueva/i)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText(/confirmar contraseña nueva/i)).toHaveAttribute('aria-invalid', 'true')
  })

  it('contraseña válida: actualiza, cierra sesión y vuelve al login con aviso', async () => {
    auth.session = { user: { email: 'laura@norte.es' } }
    auth.passwordRecovery = true
    auth.updatePassword.mockResolvedValue({ error: null })
    const user = setup()
    await user.type(screen.getByLabelText(/^contraseña nueva/i), 'Segura123')
    await user.type(screen.getByLabelText(/confirmar contraseña nueva/i), 'Segura123')
    await user.click(screen.getByRole('button', { name: /guardar contraseña/i }))
    await waitFor(() => expect(auth.updatePassword).toHaveBeenCalledWith('Segura123'))
    expect(auth.signOut).toHaveBeenCalled()
    expect(await screen.findByText('LOGIN')).toBeInTheDocument()
  })

  it('error del servidor al actualizar se muestra de forma clara', async () => {
    auth.session = { user: { email: 'laura@norte.es' } }
    auth.passwordRecovery = true
    auth.updatePassword.mockResolvedValue({ error: 'New password should be different from the old password.' })
    const user = setup()
    await user.type(screen.getByLabelText(/^contraseña nueva/i), 'Segura123')
    await user.type(screen.getByLabelText(/confirmar contraseña nueva/i), 'Segura123')
    await user.click(screen.getByRole('button', { name: /guardar contraseña/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/distinta de la anterior/i)
    expect(auth.signOut).not.toHaveBeenCalled()
  })

  it('#type=recovery en la URL inicial también habilita el formulario', () => {
    params.type = 'recovery'
    auth.session = { user: { email: 'laura@norte.es' } }
    setup()
    expect(screen.getByRole('form', { name: /nueva contraseña/i })).toBeInTheDocument()
  })
})
