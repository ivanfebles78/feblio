import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setUserLanguage } from '../i18n'

const supabase = vi.hoisted(() => ({
  functions: { invoke: vi.fn() },
  rpc: vi.fn(),
  auth: { refreshSession: vi.fn().mockResolvedValue({}) },
}))
vi.mock('../lib/supabase', () => ({ supabase }))
const api = vi.hoisted(() => ({ claimNativeVerification: vi.fn() }))
vi.mock('../lib/onboarding/api', () => api)
const auth = vi.hoisted(() => ({ signOut: vi.fn() }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }))

import { VerifyEmailScreen } from './VerifyEmailScreen'

describe('<VerifyEmailScreen />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    supabase.functions.invoke.mockResolvedValue({ data: { ok: true }, error: null })
  })

  it('modo OTP en español: envía el código al montar y muestra el aviso con el correo', async () => {
    render(<VerifyEmailScreen email="laura@norte.es" onVerified={() => undefined} />)
    expect(screen.getByRole('heading', { name: /verifica tu email/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/código de verificación de 6 dígitos/i)).toBeInTheDocument()
    expect(await screen.findByText(/código enviado a laura@norte\.es/i)).toBeInTheDocument()
    expect(supabase.functions.invoke).toHaveBeenCalledWith('send-otp', { body: {} })
    expect(screen.getByRole('button', { name: /verificar cuenta/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reenviar código/i })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: /idioma de la interfaz/i })).toBeInTheDocument()
  })

  it('modo OTP in English: texts, code-length validation and wrong code are translated', async () => {
    setUserLanguage('en')
    supabase.rpc.mockResolvedValue({ data: { ok: false }, error: null })
    const user = userEvent.setup()
    render(<VerifyEmailScreen email="laura@norte.es" onVerified={() => undefined} />)
    expect(screen.getByRole('heading', { name: /verify your email/i })).toBeInTheDocument()
    expect(screen.getByText(/we have sent a 6-digit code to/i)).toHaveTextContent('laura@norte.es')
    expect(await screen.findByText(/code sent to laura@norte\.es/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /verify account/i }))
    expect(screen.getByRole('alert')).toHaveTextContent(/the code has 6 digits/i)
    await user.type(screen.getByLabelText(/6-digit verification code/i), '123456')
    await user.click(screen.getByRole('button', { name: /verify account/i }))
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith('verify_email_otp', { p_code: '123456' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/incorrect code/i)
    expect(screen.getByText(/14-day free trial/i)).toBeInTheDocument()
    expect(screen.queryByText(/verifica tu email|código incorrecto|reenviar/i)).not.toBeInTheDocument()
  })

  it('cambiar de idioma con el selector no reenvía el código', async () => {
    const user = userEvent.setup()
    render(<VerifyEmailScreen email="laura@norte.es" onVerified={() => undefined} />)
    await screen.findByText(/código enviado/i)
    await user.click(screen.getByRole('button', { name: 'English' }))
    expect(screen.getByRole('heading', { name: /verify your email/i })).toBeInTheDocument()
    expect(supabase.functions.invoke).toHaveBeenCalledTimes(1)
  })

  it('native mode in English: confirm button and pending-confirmation error', async () => {
    setUserLanguage('en')
    api.claimNativeVerification.mockResolvedValue({ ok: false })
    const user = userEvent.setup()
    render(<VerifyEmailScreen email="laura@norte.es" mode="native" onVerified={() => undefined} />)
    expect(supabase.functions.invoke).not.toHaveBeenCalled()
    expect(screen.getByText(/we have sent a confirmation link to/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /i have confirmed/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/the confirmation has not been recorded yet/i)
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })
})
