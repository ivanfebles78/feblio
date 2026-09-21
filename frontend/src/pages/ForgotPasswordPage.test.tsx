import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { setUserLanguage } from '../i18n'

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

describe('<ForgotPasswordPage /> in English', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setUserLanguage('en')
  })

  it('renders the title, description, field, button and language selector in English', () => {
    setup()
    expect(screen.getByRole('heading', { name: /reset password/i })).toBeInTheDocument()
    expect(screen.getByText(/enter the email address you use to sign in to feblio/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send link/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /back to sign in/i })).toHaveAttribute('href', '/')
    expect(screen.getByRole('group', { name: /interface language/i })).toBeInTheDocument()
    expect(screen.queryByText(/recuperar contraseña|enviar enlace|correo electrónico/i)).not.toBeInTheDocument()
  })

  it('shows the validation message and the neutral confirmation in English', async () => {
    auth.requestPasswordReset.mockResolvedValue({ error: null })
    const user = setup()
    await user.click(screen.getByRole('button', { name: /send link/i }))
    expect(screen.getByLabelText(/email address/i)).toHaveAccessibleDescription(/enter an email address/i)
    await user.type(screen.getByLabelText(/email address/i), 'laura@norte.es')
    await user.click(screen.getByRole('button', { name: /send link/i }))
    expect(await screen.findByRole('status')).toHaveTextContent(/if laura@norte\.es has a feblio account/i)
    expect(screen.getByRole('button', { name: /use another email/i })).toBeInTheDocument()
  })

  it('rate limit error is translated into English', async () => {
    auth.requestPasswordReset.mockResolvedValue({ error: 'email rate limit exceeded' })
    const user = setup()
    await user.type(screen.getByLabelText(/email address/i), 'laura@norte.es')
    await user.click(screen.getByRole('button', { name: /send link/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/too many attempts/i)
  })
})
