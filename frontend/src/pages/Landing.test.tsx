import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const auth = vi.hoisted(() => ({
  session: null,
  profile: null,
  signIn: vi.fn(),
  resendConfirmation: vi.fn().mockResolvedValue({ error: null }),
}))
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../components/HeroScene', () => ({ HeroScene: () => <div /> }))
vi.mock('../components/auth/DemoAccess', () => ({ DemoAccess: () => null }))

import Landing from './Landing'

function setup(path = '/') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Landing />
    </MemoryRouter>,
  )
  return userEvent.setup()
}

async function login(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/correo electrónico/i), 'laura@norte.es')
  await user.type(screen.getByLabelText(/^contraseña/i), 'Segura123')
  await user.click(screen.getByRole('button', { name: /iniciar sesión/i }))
}

describe('<Landing /> (inicio de sesión)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('ofrece recuperar la contraseña y crear empresa', () => {
    setup()
    expect(screen.getByRole('link', { name: /has olvidado tu contraseña/i })).toHaveAttribute('href', '/recuperar-contrasena')
    expect(screen.getByRole('link', { name: /crear empresa/i })).toHaveAttribute('href', '/registro')
  })

  it('credenciales incorrectas: mensaje genérico sin reenvío', async () => {
    auth.signIn.mockResolvedValue({ error: 'Invalid login credentials' })
    const user = setup()
    await login(user)
    expect(await screen.findByRole('alert')).toHaveTextContent(/email o contraseña incorrectos/i)
    expect(screen.queryByRole('button', { name: /reenviar enlace/i })).not.toBeInTheDocument()
  })

  it('correo pendiente de confirmar: permite reenviar el enlace con respuesta neutra', async () => {
    auth.signIn.mockResolvedValue({ error: 'Email not confirmed' })
    const user = setup()
    await login(user)
    expect(await screen.findByRole('alert')).toHaveTextContent(/confirma tu email/i)
    await user.click(screen.getByRole('button', { name: /reenviar enlace/i }))
    expect(auth.resendConfirmation).toHaveBeenCalledWith('laura@norte.es')
    expect(await screen.findByRole('status')).toHaveTextContent(/si la cuenta existe y sigue pendiente/i)
  })

  it('tras restablecer la contraseña muestra el aviso y limpia el parámetro', () => {
    setup('/?reset=ok')
    expect(screen.getByRole('status')).toHaveTextContent(/contraseña actualizada/i)
  })
})
