import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { EMPTY_REGISTER, RegisterForm, toSignUpParams, validateRegister } from './RegisterForm'

const VALID = {
  ...EMPTY_REGISTER,
  fullName: 'Ana Pérez',
  companyName: 'RALM, S.L.',
  entityType: 'company' as const,
  taxId: 'b-12345674',
  email: 'ana@ralm.es',
  password: 'Segura123',
  confirmPassword: 'Segura123',
  termsAccepted: true,
  marketingConsent: false,
}

describe('validateRegister', () => {
  it('acepta un registro completo y válido', () => {
    expect(validateRegister(VALID)).toEqual({})
  })
  it('exige nombre de persona, empresa y tipo de titular', () => {
    const e = validateRegister({ ...VALID, fullName: '', companyName: '', entityType: '' })
    expect(e.fullName).toBeTruthy()
    expect(e.companyName).toBeTruthy()
    expect(e.entityType).toBeTruthy()
  })
  it('valida la confirmación de contraseña', () => {
    expect(validateRegister({ ...VALID, confirmPassword: 'Otra1234' }).confirmPassword).toMatch(/no coinciden/)
  })
  it('los términos son obligatorios y el marketing opcional', () => {
    expect(validateRegister({ ...VALID, termsAccepted: false }).termsAccepted).toBeTruthy()
    expect(validateRegister({ ...VALID, marketingConsent: true })).toEqual({})
    expect(validateRegister({ ...VALID, marketingConsent: false })).toEqual({})
  })
})

describe('toSignUpParams', () => {
  it('diferencia full_name de company_name, normaliza el NIF y no envía confirmPassword', () => {
    const p = toSignUpParams(VALID)
    expect(p.fullName).toBe('Ana Pérez')
    expect(p.companyName).toBe('RALM, S.L.')
    expect(p.taxId).toBe('B12345674')
    expect(p.entityType).toBe('company')
    expect(p.role).toBe('empresa')
    expect(p.termsAccepted).toBe(true)
    expect(p.marketingConsent).toBe(false)
    expect('confirmPassword' in p).toBe(false)
  })
})

describe('<RegisterForm />', () => {
  function setup() {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <MemoryRouter>
        <RegisterForm busy={false} onSubmit={onSubmit} />
      </MemoryRouter>,
    )
    return { onSubmit, user: userEvent.setup() }
  }

  it('muestra campos separados para persona y empresa con labels visibles', () => {
    setup()
    expect(screen.getByLabelText(/nombre y apellidos/i)).toHaveAttribute('autocomplete', 'name')
    expect(screen.getByLabelText(/razón social o nombre comercial/i)).toHaveAttribute('autocomplete', 'organization')
    expect(screen.getByLabelText(/^NIF fiscal/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/correo electrónico profesional/i)).toHaveAttribute('autocomplete', 'email')
    expect(screen.getByLabelText(/^contraseña/i)).toHaveAttribute('autocomplete', 'new-password')
    expect(screen.getByLabelText(/confirmar contraseña/i)).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /empresa/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /autónomo/i })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /términos del servicio/i })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /comunicaciones comerciales/i })).toBeInTheDocument()
  })

  it('no envía si faltan los términos y muestra el error junto al campo', async () => {
    const { onSubmit, user } = setup()
    await user.type(screen.getByLabelText(/nombre y apellidos/i), 'Ana Pérez')
    await user.type(screen.getByLabelText(/razón social/i), 'RALM, S.L.')
    await user.click(screen.getByRole('radio', { name: /empresa/i }))
    await user.type(screen.getByLabelText(/^NIF fiscal/i), 'B12345674')
    await user.type(screen.getByLabelText(/correo electrónico profesional/i), 'ana@ralm.es')
    await user.type(screen.getByLabelText(/^contraseña/i), 'Segura123')
    await user.type(screen.getByLabelText(/confirmar contraseña/i), 'Segura123')
    await user.click(screen.getByRole('button', { name: /crear cuenta/i }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('checkbox', { name: /términos del servicio/i })).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getAllByRole('alert').some((a) => /términos/i.test(a.textContent ?? ''))).toBe(true)
  })

  it('envía persona y empresa por separado sin exigir el consentimiento comercial', async () => {
    const { onSubmit, user } = setup()
    await user.type(screen.getByLabelText(/nombre y apellidos/i), 'Ana Pérez')
    await user.type(screen.getByLabelText(/razón social/i), 'RALM, S.L.')
    await user.click(screen.getByRole('radio', { name: /empresa/i }))
    await user.type(screen.getByLabelText(/^NIF fiscal/i), 'B12345674')
    await user.type(screen.getByLabelText(/correo electrónico profesional/i), 'ana@ralm.es')
    await user.type(screen.getByLabelText(/^contraseña/i), 'Segura123')
    await user.type(screen.getByLabelText(/confirmar contraseña/i), 'Segura123')
    await user.click(screen.getByRole('checkbox', { name: /términos del servicio/i }))
    await user.click(screen.getByRole('button', { name: /crear cuenta/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const params = onSubmit.mock.calls[0][0]
    expect(params).toMatchObject({ fullName: 'Ana Pérez', companyName: 'RALM, S.L.', entityType: 'company', taxId: 'B12345674', termsAccepted: true, marketingConsent: false })
    expect(params).not.toHaveProperty('confirmPassword')
  })

  it('el error de términos desaparece en cuanto se marca la casilla', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: /crear cuenta/i }))
    expect(screen.getByRole('checkbox', { name: /términos del servicio/i })).toHaveAttribute('aria-invalid', 'true')
    await user.click(screen.getByRole('checkbox', { name: /términos del servicio/i }))
    expect(screen.getByRole('checkbox', { name: /términos del servicio/i })).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByText(/debes aceptar los términos/i)).not.toBeInTheDocument()
  })

  it('las contraseñas distintas bloquean el envío', async () => {
    const { onSubmit, user } = setup()
    await user.type(screen.getByLabelText(/^contraseña/i), 'Segura123')
    await user.type(screen.getByLabelText(/confirmar contraseña/i), 'Distinta1')
    await user.click(screen.getByRole('button', { name: /crear cuenta/i }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/confirmar contraseña/i)).toHaveAttribute('aria-invalid', 'true')
  })
})
