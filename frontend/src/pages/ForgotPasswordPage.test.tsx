import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const auth = vi.hoisted(() => ({ requestPasswordReset: vi.fn() }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }))

import ForgotPasswordPage from './ForgotPasswordPage'

function setup() {
  render(
    <MemoryRouter initialEntries={['/recuperar-contrasena']}>
      <ForgotPasswordPage />
    </MemoryRouter>,
  )
  return userEvent.setup()
}

describe('<ForgotPasswordPage />', () => {
  beforeEach(() => vi.clearAllMocks())

  it('valida el correo antes de enviar', async () => {
    const user = setup()
    await user.type(screen.getByLabelText(/correo electrónico/i), 'no-es-un-correo')
    await user.click(screen.getByRole('button', { name: /enviar enlace/i }))
    expect(auth.requestPasswordReset).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/correo electrónico/i)).toHaveAttribute('aria-invalid', 'true')
  })

  it('envía la solicitud (simulada) y responde de forma neutra', async () => {
    auth.requestPasswordReset.mockResolvedValue({ error: null })
    const user = setup()
    await user.type(screen.getByLabelText(/correo electrónico/i), 'Laura@Norte.es')
    await user.click(screen.getByRole('button', { name: /enviar enlace/i }))
    expect(auth.requestPasswordReset).toHaveBeenCalledWith('Laura@Norte.es')
    expect(await screen.findByRole('status')).toHaveTextContent(/si laura@norte\.es tiene una cuenta/i)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('un usuario inexistente recibe exactamente la misma respuesta neutra (sin enumeración)', async () => {
    auth.requestPasswordReset.mockResolvedValue({ error: 'User not found' })
    const user = setup()
    await user.type(screen.getByLabelText(/correo electrónico/i), 'nadie@norte.es')
    await user.click(screen.getByRole('button', { name: /enviar enlace/i }))
    expect(await screen.findByRole('status')).toHaveTextContent(/si nadie@norte\.es tiene una cuenta/i)
    expect(screen.queryByText(/not found|no existe/i)).not.toBeInTheDocument()
  })

  it('el límite de intentos se muestra como error accesible', async () => {
    auth.requestPasswordReset.mockResolvedValue({ error: 'email rate limit exceeded' })
    const user = setup()
    await user.type(screen.getByLabelText(/correo electrónico/i), 'laura@norte.es')
    await user.click(screen.getByRole('button', { name: /enviar enlace/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/demasiados intentos/i)
  })

  it('evita envíos duplicados mientras está en curso', async () => {
    let resolve: (v: { error: string | null }) => void = () => {}
    auth.requestPasswordReset.mockImplementation(() => new Promise((r) => (resolve = r)))
    const user = setup()
    await user.type(screen.getByLabelText(/correo electrónico/i), 'laura@norte.es')
    const btn = screen.getByRole('button', { name: /enviar enlace/i })
    await user.click(btn)
    await waitFor(() => expect(btn).toBeDisabled())
    await user.click(btn)
    expect(auth.requestPasswordReset).toHaveBeenCalledTimes(1)
    resolve({ error: null })
  })
})
