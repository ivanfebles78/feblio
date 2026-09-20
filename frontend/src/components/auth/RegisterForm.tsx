import { useId, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Eye, EyeOff } from 'lucide-react'
import { CheckboxField, TextField } from '../forms/Field'
import { PasswordRequirements } from './PasswordRequirements'
import { Button } from '../v2/Button'
import { LEGAL_ROUTES } from '../../lib/legal'
import type { EntityType } from '../../lib/types'
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

/**
 * Registro de empresa (v2): solo los datos imprescindibles para crear la empresa.
 * Canales, documentos, automatizaciones y facturación se configuran después,
 * dentro de Feblio. El rol no se elige: todo registro público es una cuenta de empresa.
 */
export interface RegisterFormValues {
  companyName: string
  taxId: string
  fullName: string
  email: string
  password: string
  confirmPassword: string
  termsAccepted: boolean
  marketingConsent: boolean
}

export const EMPTY_REGISTER: RegisterFormValues = {
  companyName: '',
  taxId: '',
  fullName: '',
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
  const company = validateRequiredText(v.companyName, 'Indica el nombre o la razón social de la empresa.')
  if (!company.ok) e.companyName = company.message
  const tax = validateTaxId(v.taxId)
  if (!tax.ok) e.taxId = tax.message
  const name = validatePersonName(v.fullName)
  if (!name.ok) e.fullName = name.message
  const email = validateEmail(v.email)
  if (!email.ok) e.email = email.message
  const pw = validatePassword(v.password)
  if (!pw.ok) e.password = pw.message
  const conf = validatePasswordConfirmation(v.password, v.confirmPassword)
  if (!conf.ok) e.confirmPassword = conf.message
  if (!v.termsAccepted) e.termsAccepted = 'Debes aceptar los Términos del servicio y la Política de privacidad para registrarte.'
  return e
}

/** Tipo de titular inferido del identificador fiscal: CIF → sociedad; NIF/NIE → autónomo o profesional. */
export function entityTypeForTaxId(taxId: string): EntityType {
  const kind = validateTaxId(taxId).kind
  return kind === 'NIF' || kind === 'NIE' ? 'self_employed' : 'company'
}

/** Convierte los valores del formulario en parámetros de signUp (sin confirmPassword; rol fijo: empresa). */
export function toSignUpParams(v: RegisterFormValues): SignUpParams {
  return {
    email: v.email.trim(),
    password: v.password,
    fullName: v.fullName.trim(),
    role: 'empresa',
    companyName: v.companyName.trim(),
    entityType: entityTypeForTaxId(v.taxId),
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
  const submitting = useRef(false)
  const pwReqId = useId()

  function set<K extends keyof RegisterFormValues>(key: K, value: RegisterFormValues[K]) {
    setValues((v) => {
      const next = { ...v, [key]: value }
      // Recalcula siempre: un error ya visible (p. ej. términos) desaparece en cuanto el valor es válido.
      setErrors(validateRegister(next))
      return next
    })
  }

  function blur(key: keyof RegisterFormValues) {
    setTouched((t) => ({ ...t, [key]: true }))
    setErrors(validateRegister(values))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy || submitting.current) return // evita envíos duplicados
    const errs = validateRegister(values)
    setErrors(errs)
    setTouched({ companyName: true, taxId: true, fullName: true, email: true, password: true, confirmPassword: true, termsAccepted: true, marketingConsent: true })
    const firstError = Object.keys(errs)[0]
    if (firstError) {
      // El DOM aún no refleja aria-invalid (estado asíncrono): enfoca por nombre de campo.
      formRef.current?.querySelector<HTMLElement>(`[name="${firstError}"]`)?.focus()
      return
    }
    submitting.current = true
    try {
      await onSubmit(toSignUpParams(values))
    } finally {
      submitting.current = false
    }
  }

  const err = (k: keyof RegisterFormValues) => (touched[k] ? errors[k] : undefined)
  const legend = 'mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500'

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-5" aria-label="Formulario de registro de empresa" aria-busy={busy}>
      <fieldset className="grid gap-4 sm:grid-cols-2" disabled={busy}>
        <legend className={legend}>Empresa</legend>
        <TextField label="Nombre o razón social" name="companyName" autoComplete="organization" required value={values.companyName} onChange={(e) => set('companyName', e.target.value)} onBlur={() => blur('companyName')} error={err('companyName')} />
        <TextField
          label="CIF/NIF"
          name="taxId"
          autoComplete="off"
          spellCheck={false}
          required
          value={values.taxId}
          onChange={(e) => set('taxId', e.target.value)}
          onBlur={(e) => {
            set('taxId', normalizeTaxId(e.target.value))
            blur('taxId')
          }}
          error={err('taxId')}
          hint="CIF de la sociedad, o NIF/NIE si eres autónomo o profesional."
        />
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2" disabled={busy}>
        <legend className={legend}>Responsable</legend>
        <TextField className="sm:col-span-2" label="Nombre y apellidos" name="fullName" autoComplete="name" required value={values.fullName} onChange={(e) => set('fullName', e.target.value)} onBlur={() => blur('fullName')} error={err('fullName')} />
        <TextField className="sm:col-span-2" label="Correo electrónico" name="email" type="email" inputMode="email" autoComplete="email" required value={values.email} onChange={(e) => set('email', e.target.value)} onBlur={() => blur('email')} error={err('email')} hint="Lo usarás para iniciar sesión. Te enviaremos un enlace para confirmarlo." />
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
                className="rounded-md p-1 text-slate-500 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                aria-pressed={showPass}
              >
                {showPass ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
              </button>
            }
          />
        </div>
        <TextField label="Confirmar contraseña" name="confirmPassword" type={showPass ? 'text' : 'password'} autoComplete="new-password" required value={values.confirmPassword} onChange={(e) => set('confirmPassword', e.target.value)} onBlur={() => blur('confirmPassword')} error={err('confirmPassword')} />
        <div className="sm:col-span-2">
          <PasswordRequirements password={values.password} id={pwReqId} />
        </div>
      </fieldset>

      <div className="space-y-3 border-t border-slate-200 pt-4">
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
              <Link to={LEGAL_ROUTES.terms} target="_blank" rel="noreferrer" className="font-medium text-brand-700 underline underline-offset-2">
                Términos del servicio
              </Link>{' '}
              y la{' '}
              <Link to={LEGAL_ROUTES.privacy} target="_blank" rel="noreferrer" className="font-medium text-brand-700 underline underline-offset-2">
                Política de privacidad
              </Link>
              .
            </>
          }
        />
        <CheckboxField name="marketingConsent" checked={values.marketingConsent} onChange={(c) => set('marketingConsent', c)} label="Quiero recibir novedades y comunicaciones comerciales (opcional)." />
      </div>

      <Button type="submit" size="lg" block disabled={busy} trailing={!busy ? <ArrowRight className="h-4 w-4" aria-hidden="true" /> : undefined}>
        {busy ? 'Creando tu empresa…' : 'Crear empresa'}
      </Button>
    </form>
  )
}
