import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { EMPTY_REGISTER, RegisterForm, entityTypeForTaxId, toSignUpParams, validateRegister } from './RegisterForm'
import { setUserLanguage } from '../../i18n'

const VALID = {
  ...EMPTY_REGISTER,
  companyName: 'Construcciones Norte, S.L.',
  taxId: 'b-12345674',
  fullName: 'Laura Martín',
  email: 'laura@norte.es',
  password: 'Segura123',
  confirmPassword: 'Segura123',
  termsAccepted: true,
  marketingConsent: false,
}

describe('validateRegister', () => {
  it('acepta un registro completo y válido', () => {
    expect(validateRegister(VALID)).toEqual({})
  })
  it('exige razón social, CIF/NIF, responsable, correo y contraseñas', () => {
    const e = validateRegister({ ...VALID, companyName: '', taxId: '', fullName: '', email: '', password: '', confirmPassword: '' })
    expect(Object.keys(e).sort()).toEqual(['companyName', 'confirmPassword', 'email', 'fullName', 'password', 'taxId'])
  })
  it('valida el dígito de control del CIF/NIF y la confirmación de contraseña', () => {
    expect(validateRegister({ ...VALID, taxId: 'B12345678' }).taxId).toMatch(/control/i)
    expect(validateRegister({ ...VALID, confirmPassword: 'Otra1234' }).confirmPassword).toMatch(/no coinciden/)
  })
  it('los términos son obligatorios y el marketing opcional', () => {
    expect(validateRegister({ ...VALID, termsAccepted: false }).termsAccepted).toBeTruthy()
    expect(validateRegister({ ...VALID, marketingConsent: true })).toEqual({})
    expect(validateRegister({ ...VALID, marketingConsent: false })).toEqual({})
  })
})

describe('toSignUpParams', () => {
  it('rol fijo empresa, NIF normalizado, tipo de titular inferido y sin confirmPassword', () => {
    const p = toSignUpParams(VALID)
    expect(p.role).toBe('empresa')
    expect(p.companyName).toBe('Construcciones Norte, S.L.')
    expect(p.fullName).toBe('Laura Martín')
    expect(p.taxId).toBe('B12345674')
    expect(p.entityType).toBe('company')
    expect(p.termsAccepted).toBe(true)
    expect(p.marketingConsent).toBe(false)
    expect('confirmPassword' in p).toBe(false)
    expect('role' in VALID).toBe(false)
  })
  it('infiere autónomo con NIF/NIE y sociedad con CIF', () => {
    expect(entityTypeForTaxId('12345678Z')).toBe('self_employed')
    expect(entityTypeForTaxId('X1234567L')).toBe('self_employed')
    expect(entityTypeForTaxId('B12345674')).toBe('company')
  })
  it('incluye el idioma de la interfaz en el momento del registro', () => {
    expect(toSignUpParams(VALID).language).toBe('es')
    setUserLanguage('en')
    expect(toSignUpParams(VALID).language).toBe('en')
  })
})

describe('<RegisterForm />', () => {
  function setup(onSubmit = vi.fn().mockResolvedValue(undefined), busy = false) {
    render(
      <MemoryRouter>
        <RegisterForm busy={busy} onSubmit={onSubmit} />
      </MemoryRouter>,
    )
    return { onSubmit, user: userEvent.setup() }
  }
  async function fill(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText(/nombre o razón social/i), 'Construcciones Norte, S.L.')
    await user.type(screen.getByLabelText(/^CIF\/NIF/i), 'B12345674')
    await user.type(screen.getByLabelText(/nombre y apellidos/i), 'Laura Martín')
    await user.type(screen.getByLabelText(/correo electrónico/i), 'laura@norte.es')
    await user.type(screen.getByLabelText(/^contraseña/i), 'Segura123')
    await user.type(screen.getByLabelText(/confirmar contraseña/i), 'Segura123')
  }

  it('muestra solo los campos del registro simplificado, sin selector de rol ni de tipo de titular', () => {
    setup()
    expect(screen.getByLabelText(/nombre o razón social/i)).toHaveAttribute('autocomplete', 'organization')
    expect(screen.getByLabelText(/^CIF\/NIF/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/nombre y apellidos/i)).toHaveAttribute('autocomplete', 'name')
    expect(screen.getByLabelText(/correo electrónico/i)).toHaveAttribute('autocomplete', 'email')
    expect(screen.getByLabelText(/^contraseña/i)).toHaveAttribute('autocomplete', 'new-password')
    expect(screen.getByLabelText(/confirmar contraseña/i)).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /términos del servicio/i })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /comunicaciones comerciales/i })).toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.queryByText(/whatsapp|sms|llamadas|automatizaci|facturaci/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /crear empresa/i })).toBeInTheDocument()
  })

  it('no envía si faltan los términos y muestra el error junto al campo', async () => {
    const { onSubmit, user } = setup()
    await fill(user)
    await user.click(screen.getByRole('button', { name: /crear empresa/i }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('checkbox', { name: /términos del servicio/i })).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getAllByRole('alert').some((a) => /términos/i.test(a.textContent ?? ''))).toBe(true)
  })

  it('envía empresa y responsable con rol empresa, sin exigir el consentimiento comercial', async () => {
    const { onSubmit, user } = setup()
    await fill(user)
    await user.click(screen.getByRole('checkbox', { name: /términos del servicio/i }))
    await user.click(screen.getByRole('button', { name: /crear empresa/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ role: 'empresa', companyName: 'Construcciones Norte, S.L.', fullName: 'Laura Martín', taxId: 'B12345674', entityType: 'company', termsAccepted: true, marketingConsent: false })
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('confirmPassword')
  })

  it('el error de términos desaparece en cuanto se marca la casilla', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: /crear empresa/i }))
    expect(screen.getByRole('checkbox', { name: /términos del servicio/i })).toHaveAttribute('aria-invalid', 'true')
    await user.click(screen.getByRole('checkbox', { name: /términos del servicio/i }))
    expect(screen.getByRole('checkbox', { name: /términos del servicio/i })).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByText(/debes aceptar los términos/i)).not.toBeInTheDocument()
  })

  it('las contraseñas distintas bloquean el envío y enfocan el primer error', async () => {
    const { onSubmit, user } = setup()
    await user.type(screen.getByLabelText(/^contraseña/i), 'Segura123')
    await user.type(screen.getByLabelText(/confirmar contraseña/i), 'Distinta1')
    await user.click(screen.getByRole('button', { name: /crear empresa/i }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/confirmar contraseña/i)).toHaveAttribute('aria-invalid', 'true')
    expect(document.activeElement).toBe(screen.getByLabelText(/nombre o razón social/i))
  })

  it('evita envíos duplicados mientras el envío está en curso', async () => {
    let resolve: () => void = () => {}
    const onSubmit = vi.fn().mockImplementation(() => new Promise<void>((r) => (resolve = r)))
    const { user } = setup(onSubmit)
    await fill(user)
    await user.click(screen.getByRole('checkbox', { name: /términos del servicio/i }))
    const btn = screen.getByRole('button', { name: /crear empresa/i })
    await user.click(btn)
    await user.click(btn)
    expect(onSubmit).toHaveBeenCalledTimes(1)
    resolve()
  })

  it('en estado busy deshabilita el botón y anuncia la espera', () => {
    setup(vi.fn(), true)
    expect(screen.getByRole('button', { name: /creando tu empresa/i })).toBeDisabled()
    expect(screen.getByRole('form', { name: /registro de empresa/i })).toHaveAttribute('aria-busy', 'true')
  })
})

describe('<RegisterForm /> in English', () => {
  function setup(onSubmit = vi.fn().mockResolvedValue(undefined)) {
    setUserLanguage('en')
    render(
      <MemoryRouter>
        <RegisterForm busy={false} onSubmit={onSubmit} />
      </MemoryRouter>,
    )
    return { onSubmit, user: userEvent.setup() }
  }

  it('renders labels, legends, links and the submit button in English', () => {
    setup()
    expect(screen.getByRole('form', { name: /company registration form/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/company or legal name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/tax id/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^full name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^password\*/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /terms of service/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/terminos')
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacidad')
    expect(screen.getByRole('checkbox', { name: /commercial communications/i })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: /password requirements/i })).toHaveTextContent(/8 characters minimum/)
    expect(screen.getByRole('button', { name: /create company/i })).toBeInTheDocument()
    expect(screen.queryByText(/crear empresa|razón social|términos del servicio|contraseña/i)).not.toBeInTheDocument()
  })

  it('shows validation messages in English (required fields and terms)', async () => {
    const { onSubmit, user } = setup()
    await user.click(screen.getByRole('button', { name: /create company/i }))
    expect(onSubmit).not.toHaveBeenCalled()
    const alerts = screen.getAllByRole('alert').map((a) => a.textContent ?? '')
    expect(alerts.some((a) => /enter the company's name or legal name/i.test(a))).toBe(true)
    expect(alerts.some((a) => /enter an email address/i.test(a))).toBe(true)
    expect(alerts.some((a) => /enter a password/i.test(a))).toBe(true)
    expect(alerts.some((a) => /you must accept the terms of service/i.test(a))).toBe(true)
    expect(alerts.some((a) => /introduce|debes aceptar/i.test(a))).toBe(false)
  })

  it('password mismatch message is in English', async () => {
    const { user } = setup()
    await user.type(screen.getByLabelText(/^password\*/i), 'Segura123')
    await user.type(screen.getByLabelText(/confirm password/i), 'Distinta1')
    await user.click(screen.getByRole('button', { name: /create company/i }))
    expect(screen.getByLabelText(/confirm password/i)).toHaveAccessibleDescription(/the passwords do not match/i)
  })
})
