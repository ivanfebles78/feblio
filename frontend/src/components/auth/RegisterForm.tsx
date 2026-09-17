import { useId, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Eye, EyeOff } from 'lucide-react'
import { CheckboxField, RadioCards, TextField } from '../forms/Field'
import { PasswordRequirements } from './PasswordRequirements'
import { LEGAL_ROUTES } from '../../lib/legal'
import { ENTITY_TYPE_LABEL, type EntityType } from '../../lib/types'
import {
  normalizeTaxId,
  validateEmail,
  validatePassword,
  validatePasswordConfirmation,
  validatePersonName,
  validateRequiredText,
  validateTaxId,
} from '../../lib/validation'
import type { SignUpParams } from '../../context/AuthContext'

export interface RegisterFormValues {
  fullName: string
  companyName: string
  entityType: EntityType | ''
  taxId: string
  email: string
  password: string
  confirmPassword: string
  termsAccepted: boolean
  marketingConsent: boolean
}

export const EMPTY_REGISTER: RegisterFormValues = {
  fullName: '',
  companyName: '',
  entityType: '',
  taxId: '',
  email: '',
  password: '',
  confirmPassword: '',
  termsAccepted: false,
  marketingConsent: false,
}

type Errors = Partial<Record<keyof RegisterFormValues, string>>

/** Validación completa del registro (pura, testeable). */
export function validateRegister(v: RegisterFormValues): Errors {
  const e: Errors = {}
  const name = validatePersonName(v.fullName)
  if (!name.ok) e.fullName = name.message
  const company = validateRequiredText(v.companyName, 'Indica la razón social o el nombre comercial.')
  if (!company.ok) e.companyName = company.message
  if (!v.entityType) e.entityType = 'Indica si eres empresa o autónomo/profesional.'
  const tax = validateTaxId(v.taxId)
  if (!tax.ok) e.taxId = tax.message
  const email = validateEmail(v.email)
  if (!email.ok) e.email = email.message
  const pw = validatePassword(v.password)
  if (!pw.ok) e.password = pw.message
  const conf = validatePasswordConfirmation(v.password, v.confirmPassword)
  if (!conf.ok) e.confirmPassword = conf.message
  if (!v.termsAccepted) e.termsAccepted = 'Debes aceptar los Términos del servicio y la Política de privacidad para registrarte.'
  return e
}

/** Convierte los valores del formulario en parámetros de signUp (sin confirmPassword). */
export function toSignUpParams(v: RegisterFormValues): SignUpParams {
  return {
    email: v.email.trim(),
    password: v.password,
    fullName: v.fullName.trim(),
    role: 'empresa',
    companyName: v.companyName.trim(),
    entityType: v.entityType || 'company',
    taxId: normalizeTaxId(v.taxId),
    termsAccepted: v.termsAccepted,
    marketingConsent: v.marketingConsent,
  }
}

interface RegisterFormProps {
  busy: boolean
  onSubmit: (params: SignUpParams) => Promise<void>
}

export function RegisterForm({ busy, onSubmit }: RegisterFormProps) {
  const [values, setValues] = useState<RegisterFormValues>(EMPTY_REGISTER)
  const [errors, setErrors] = useState<Errors>({})
  const [touched, setTouched] = useState<Partial<Record<keyof RegisterFormValues, boolean>>>({})
  const [showPass, setShowPass] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const pwReqId = useId()

  function set<K extends keyof RegisterFormValues>(key: K, value: RegisterFormValues[K]) {
    setValues((v) => {
      const next = { ...v, [key]: value }
      if (touched[key]) setErrors(validateRegister(next))
      return next
    })
  }

  function blur(key: keyof RegisterFormValues) {
    setTouched((t) => ({ ...t, [key]: true }))
    setErrors(validateRegister(values))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const errs = validateRegister(values)
    setErrors(errs)
    setTouched({
      fullName: true, companyName: true, entityType: true, taxId: true, email: true,
      password: true, confirmPassword: true, termsAccepted: true, marketingConsent: true,
    })
    if (Object.keys(errs).length > 0) {
      // Foco en el primer campo con error
      const first = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')
      first?.focus()
      return
    }
    await onSubmit(toSignUpParams(values))
  }

  const err = (k: keyof RegisterFormValues) => (touched[k] ? errors[k] : undefined)

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-3" aria-label="Formulario de registro">
      <TextField
        label="Nombre y apellidos"
        name="fullName"
        autoComplete="name"
        required
        value={values.fullName}
        onChange={(e) => set('fullName', e.target.value)}
        onBlur={() => blur('fullName')}
        error={err('fullName')}
        hint="La persona propietaria de la cuenta."
      />
      <TextField
        label="Razón social o nombre comercial"
        name="companyName"
        autoComplete="organization"
        required
        value={values.companyName}
        onChange={(e) => set('companyName', e.target.value)}
        onBlur={() => blur('companyName')}
        error={err('companyName')}
        hint="El nombre de tu empresa o actividad."
      />
      <RadioCards<EntityType>
        legend="Tipo de titular"
        name="entityType"
        value={values.entityType}
        onChange={(v) => {
          set('entityType', v)
          setTouched((t) => ({ ...t, entityType: true }))
        }}
        options={[
          { value: 'company', label: ENTITY_TYPE_LABEL.company, description: 'Sociedad con CIF' },
          { value: 'self_employed', label: ENTITY_TYPE_LABEL.self_employed, description: 'Persona física con NIF/NIE' },
        ]}
        error={err('entityType')}
      />
      <TextField
        label="NIF fiscal"
        name="taxId"
        autoComplete="off"
        required
        value={values.taxId}
        onChange={(e) => set('taxId', e.target.value)}
        onBlur={(e) => {
          set('taxId', normalizeTaxId(e.target.value))
          blur('taxId')
        }}
        error={err('taxId')}
        hint={values.entityType === 'self_employed' ? 'NIF o NIE de la persona (p. ej. 12345678Z).' : 'CIF de la entidad (p. ej. B12345678).'}
        spellCheck={false}
      />
      <TextField
        label="Correo electrónico profesional"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        value={values.email}
        onChange={(e) => set('email', e.target.value)}
        onBlur={() => blur('email')}
        error={err('email')}
        hint="Lo usarás para iniciar sesión."
      />
      <div>
        <TextField
          label="Contraseña"
          name="password"
          type={showPass ? 'text' : 'password'}
          autoComplete="new-password"
          required
          value={values.password}
          onChange={(e) => set('password', e.target.value)}
          onBlur={() => blur('password')}
          error={err('password')}
          aria-describedby={pwReqId}
          trailing={
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              className="rounded-md p-1 text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              aria-pressed={showPass}
            >
              {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          }
        />
        <PasswordRequirements password={values.password} id={pwReqId} />
      </div>
      <TextField
        label="Confirmar contraseña"
        name="confirmPassword"
        type={showPass ? 'text' : 'password'}
        autoComplete="new-password"
        required
        value={values.confirmPassword}
        onChange={(e) => set('confirmPassword', e.target.value)}
        onBlur={() => blur('confirmPassword')}
        error={err('confirmPassword')}
      />

      <CheckboxField
        name="termsAccepted"
        required
        checked={values.termsAccepted}
        onChange={(c) => {
          set('termsAccepted', c)
          setTouched((t) => ({ ...t, termsAccepted: true }))
        }}
        error={err('termsAccepted')}
        label={
          <>
            He leído y acepto los{' '}
            <Link to={LEGAL_ROUTES.terms} target="_blank" rel="noreferrer" className="font-medium text-brand-600 underline">
              Términos del servicio
            </Link>{' '}
            y la{' '}
            <Link to={LEGAL_ROUTES.privacy} target="_blank" rel="noreferrer" className="font-medium text-brand-600 underline">
              Política de privacidad
            </Link>
            .
          </>
        }
      />
      <CheckboxField
        name="marketingConsent"
        checked={values.marketingConsent}
        onChange={(c) => set('marketingConsent', c)}
        label="Deseo recibir novedades y comunicaciones comerciales (opcional)."
      />

      <button type="submit" className="btn-primary w-full" disabled={busy}>
        {busy ? (
          'Un momento…'
        ) : (
          <>
            Crear cuenta <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </>
        )}
      </button>
    </form>
  )
}
