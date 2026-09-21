import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { setUserLanguage } from '../i18n'

const auth = vi.hoisted(() => ({
  session: null as unknown,
  profile: null as unknown,
  signUp: vi.fn(),
}))
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }))

import RegisterPage from './RegisterPage'

function Where() {
  const loc = useLocation()
  return <p data-testid="where">{loc.pathname}</p>
}

function setup() {
  render(
    <MemoryRouter initialEntries={['/registro']}>
      <Where />
      <Routes>
        <Route path="/" element={<div>LOGIN</div>} />
        <Route path="/registro" element={<RegisterPage />} />
      </Routes>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/nombre o razón social/i), 'Construcciones Norte, S.L.')
  await user.type(screen.getByLabelText(/^CIF\/NIF/i), 'B12345674')
  await user.type(screen.getByLabelText(/nombre y apellidos/i), 'Laura Martín')
  await user.type(screen.getByLabelText(/correo electrónico/i), 'laura@norte.es')
  await user.type(screen.getByLabelText(/^contraseña/i), 'Segura123')
  await user.type(screen.getByLabelText(/confirmar contraseña/i), 'Segura123')
  await user.click(screen.getByRole('checkbox', { name: /términos del servicio/i }))
}

describe('<RegisterPage /> (español)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('muestra el título, el selector de idioma y el enlace de inicio de sesión', () => {
    setup()
    expect(screen.getByRole('heading', { name: /crea tu empresa en feblio/i })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: /idioma de la interfaz/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /inicia sesión/i })).toHaveAttribute('href', '/')
  })

  it('envía el registro con el idioma de la interfaz y muestra la pantalla de confirmación', async () => {
    auth.signUp.mockResolvedValue({ error: null, needsConfirmation: true })
    const user = setup()
    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: /crear empresa/i }))
    await waitFor(() => expect(auth.signUp).toHaveBeenCalledTimes(1))
    expect(auth.signUp.mock.calls[0][0]).toMatchObject({ email: 'laura@norte.es', role: 'empresa', language: 'es' })
    expect(await screen.findByRole('status')).toHaveTextContent(/revisa tu correo/i)
    expect(screen.getByRole('status')).toHaveTextContent(/si laura@norte\.es es válido/i)
  })

  it('traduce los errores de Supabase Auth a mensajes neutros en español', async () => {
    auth.signUp.mockResolvedValue({ error: 'User already registered', needsConfirmation: false })
    const user = setup()
    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: /crear empresa/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/no hemos podido completar el registro con ese correo/i)
    expect(screen.queryByText(/already registered/i)).not.toBeInTheDocument()
  })
})

describe('<RegisterPage /> in English', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders titles, benefits, badges and buttons in English', () => {
    setUserLanguage('en')
    setup()
    expect(screen.getByRole('heading', { name: /manage your projects, clients and documents from one place/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /create your company on feblio/i })).toBeInTheDocument()
    expect(screen.getByText(/only the essentials/i)).toBeInTheDocument()
    expect(screen.getByRole('list', { name: /feblio benefits/i })).toHaveTextContent(/projects and documents in order/i)
    expect(screen.getByText(/data hosted in the eu/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create company/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^sign in$/i })).toHaveAttribute('href', '/')
    expect(screen.queryByText(/crea tu empresa|inicia sesión|datos alojados/i)).not.toBeInTheDocument()
  })

  it('switching the language with the selector keeps the route at /registro', async () => {
    const user = setup()
    expect(screen.getByRole('heading', { name: /crea tu empresa en feblio/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'English' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/registro')
    expect(screen.getByRole('heading', { name: /create your company on feblio/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Español' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/registro')
    expect(screen.getByRole('heading', { name: /crea tu empresa en feblio/i })).toBeInTheDocument()
  })

  it('translates Supabase Auth errors and the confirmation screen into English', async () => {
    setUserLanguage('en')
    auth.signUp.mockResolvedValueOnce({ error: 'email rate limit exceeded', needsConfirmation: false }).mockResolvedValueOnce({ error: null, needsConfirmation: true })
    const user = setup()
    await user.type(screen.getByLabelText(/company or legal name/i), 'Construcciones Norte, S.L.')
    await user.type(screen.getByLabelText(/tax id/i), 'B12345674')
    await user.type(screen.getByLabelText(/^full name/i), 'Laura Martín')
    await user.type(screen.getByLabelText(/email address/i), 'laura@norte.es')
    await user.type(screen.getByLabelText(/^password\*/i), 'Segura123')
    await user.type(screen.getByLabelText(/confirm password/i), 'Segura123')
    await user.click(screen.getByRole('checkbox', { name: /terms of service/i }))
    await user.click(screen.getByRole('button', { name: /create company/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/too many attempts/i)
    expect(auth.signUp.mock.calls[0][0]).toMatchObject({ language: 'en' })
    await user.click(screen.getByRole('button', { name: /create company/i }))
    expect(await screen.findByRole('status')).toHaveTextContent(/check your email/i)
    expect(screen.getByRole('status')).toHaveTextContent(/if laura@norte\.es is valid/i)
    expect(screen.getByRole('link', { name: /go to sign in/i })).toHaveAttribute('href', '/')
  })
})
