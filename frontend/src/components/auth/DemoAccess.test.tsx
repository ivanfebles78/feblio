import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DemoAccess } from './DemoAccess'
import { LoginForm } from './LoginForm'
import type { DemoAccount } from '../../lib/env'

const ACCOUNTS = 'Admin:admin@example.com,Empresa:empresa@example.com,Cliente:cliente@example.com'

function Harness({ onSubmit }: { onSubmit: (email: string, password: string) => Promise<void> }) {
  const [account, setAccount] = useState<DemoAccount | null>(null)
  return (
    <>
      <LoginForm busy={false} demoAccount={account} onClearDemo={() => setAccount(null)} onSubmit={onSubmit} />
      <DemoAccess onPick={setAccount} />
    </>
  )
}

describe('<DemoAccess />', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('no renderiza nada si VITE_DEMO_MODE no está definido (producción)', () => {
    vi.stubEnv('VITE_DEMO_MODE', '')
    vi.stubEnv('VITE_DEMO_ACCOUNTS', ACCOUNTS)
    const { container } = render(<DemoAccess onPick={() => undefined} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('con VITE_DEMO_MODE=true muestra solo las etiquetas, sin emails ni contraseñas', () => {
    vi.stubEnv('VITE_DEMO_MODE', 'true')
    vi.stubEnv('VITE_DEMO_ACCOUNTS', ACCOUNTS)
    const { container } = render(<DemoAccess onPick={() => undefined} />)
    expect(screen.getByRole('button', { name: 'Admin' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Empresa' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cliente' })).toBeInTheDocument()
    expect(container.innerHTML).not.toMatch(/@example\.com/)
    expect(container.innerHTML).not.toMatch(/password/i)
  })

  it('al elegir una cuenta, el login muestra la etiqueta (no el email) y exige la contraseña manualmente', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'true')
    vi.stubEnv('VITE_DEMO_ACCOUNTS', ACCOUNTS)
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<Harness onSubmit={onSubmit} />)

    await user.click(screen.getByRole('button', { name: 'Empresa' }))
    expect(screen.getByRole('status')).toHaveTextContent('Cuenta de demostración: Empresa')
    expect(screen.queryByLabelText(/correo electrónico/i)).not.toBeInTheDocument()
    expect(document.body.innerHTML).not.toMatch(/empresa@example\.com/)

    // Sin contraseña no hay login automático
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }))
    expect(onSubmit).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText(/^contraseña/i), 'Manual123')
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }))
    expect(onSubmit).toHaveBeenCalledWith('empresa@example.com', 'Manual123')
  })

  it('"Usar otro email" vuelve al campo de correo normal', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'true')
    vi.stubEnv('VITE_DEMO_ACCOUNTS', ACCOUNTS)
    const user = userEvent.setup()
    render(<Harness onSubmit={vi.fn().mockResolvedValue(undefined)} />)
    await user.click(screen.getByRole('button', { name: 'Cliente' }))
    await user.click(screen.getByRole('button', { name: /usar otro email/i }))
    expect(screen.getByLabelText(/correo electrónico/i)).toBeInTheDocument()
  })
})
