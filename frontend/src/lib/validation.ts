/**
 * Validaciones de formularios (registro y wizard). Sin dependencias externas.
 * Todas devuelven mensajes traducidos (idioma actual de la interfaz) listos para mostrar junto al campo.
 */
import { t } from '../i18n'

export interface ValidationResult {
  ok: boolean
  message?: string
  /** Información adicional (p. ej. tipo de identificador detectado) */
  kind?: string
}

const ok: ValidationResult = { ok: true }
const fail = (message: string): ValidationResult => ({ ok: false, message })

/* ------------------------------------------------------------------ */
/* Identificación fiscal                                                */
/* ------------------------------------------------------------------ */

/** Mayúsculas y sin espacios, guiones ni puntos. */
export function normalizeTaxId(value: string): string {
  return (value ?? '').toUpperCase().replace(/[\s\-.]/g, '')
}

const NIF_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE'
const CIF_CONTROL_LETTERS = 'JABCDEFGHI'

function nifChecksum(digits: string): string {
  return NIF_LETTERS[Number(digits) % 23]
}

/**
 * Valida NIF (persona física), NIE y CIF (entidad) españoles con dígito de control.
 * Acepta además un identificador intracomunitario genérico (2 letras + 2–12 alfanuméricos)
 * como "foreign" para no bloquear casos especiales; se explica en el mensaje.
 */
export function validateTaxId(raw: string): ValidationResult {
  const v = normalizeTaxId(raw)
  if (!v) return fail(t('auth.validation.taxIdRequired'))

  // NIF persona física: 8 dígitos + letra
  if (/^\d{8}[A-Z]$/.test(v)) {
    return nifChecksum(v.slice(0, 8)) === v[8]
      ? { ...ok, kind: 'NIF' }
      : fail(t('auth.validation.nifControl'))
  }
  // NIE: X/Y/Z + 7 dígitos + letra
  if (/^[XYZ]\d{7}[A-Z]$/.test(v)) {
    const prefix = { X: '0', Y: '1', Z: '2' }[v[0] as 'X' | 'Y' | 'Z']
    return nifChecksum(prefix + v.slice(1, 8)) === v[8]
      ? { ...ok, kind: 'NIE' }
      : fail(t('auth.validation.nieControl'))
  }
  // CIF: letra + 7 dígitos + control (dígito o letra)
  if (/^[ABCDEFGHJKLMNPQRSUVW]\d{7}[0-9A-J]$/.test(v)) {
    const digits = v.slice(1, 8)
    let even = 0
    let odd = 0
    for (let i = 0; i < 7; i++) {
      const n = Number(digits[i])
      if (i % 2 === 0) {
        const d = n * 2
        odd += d > 9 ? d - 9 : d
      } else {
        even += n
      }
    }
    const control = (10 - ((even + odd) % 10)) % 10
    const expectedDigit = String(control)
    const expectedLetter = CIF_CONTROL_LETTERS[control]
    const last = v[8]
    const mustBeLetter = /^[KPQSNW]/.test(v)
    const mustBeDigit = /^[ABEH]/.test(v)
    const valid = mustBeLetter
      ? last === expectedLetter
      : mustBeDigit
        ? last === expectedDigit
        : last === expectedDigit || last === expectedLetter
    return valid ? { ...ok, kind: 'CIF' } : fail(t('auth.validation.cifControl'))
  }
  // Identificador intracomunitario / extranjero: se acepta con aviso
  if (/^[A-Z]{2}[A-Z0-9]{2,12}$/.test(v)) {
    return { ...ok, kind: 'foreign' }
  }
  return fail(t('auth.validation.taxIdFormat'))
}

/* ------------------------------------------------------------------ */
/* Email, teléfono, URL                                                 */
/* ------------------------------------------------------------------ */

export function validateEmail(value: string): ValidationResult {
  const v = (value ?? '').trim()
  if (!v) return fail(t('auth.validation.emailRequired'))
  // Suficientemente estricto sin rechazar dominios nuevos
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return fail(t('auth.validation.emailInvalid'))
  return ok
}

export function validatePhone(value: string, { required = false } = {}): ValidationResult {
  const v = (value ?? '').trim()
  if (!v) return required ? fail(t('auth.validation.phoneRequired')) : ok
  const digits = v.replace(/[\s\-().]/g, '')
  if (!/^\+?\d{6,15}$/.test(digits)) {
    return fail(t('auth.validation.phoneInvalid'))
  }
  return ok
}

export function validateUrl(value: string, { required = false } = {}): ValidationResult {
  const v = (value ?? '').trim()
  if (!v) return required ? fail(t('auth.validation.urlRequired')) : ok
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`)
    if (!u.hostname.includes('.')) return fail(t('auth.validation.urlInvalid'))
    return ok
  } catch {
    return fail(t('auth.validation.urlInvalid'))
  }
}

/* ------------------------------------------------------------------ */
/* IBAN (mod 97)                                                        */
/* ------------------------------------------------------------------ */

export function normalizeIban(value: string): string {
  return (value ?? '').toUpperCase().replace(/\s+/g, '')
}

export function validateIban(value: string, { required = false } = {}): ValidationResult {
  const v = normalizeIban(value)
  if (!v) return required ? fail(t('auth.validation.ibanRequired')) : ok
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(v)) return fail(t('auth.validation.ibanFormat'))
  const rearranged = v.slice(4) + v.slice(0, 4)
  const numeric = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55))
  // mod 97 por trozos para evitar overflow
  let remainder = 0
  for (let i = 0; i < numeric.length; i += 7) {
    remainder = Number(String(remainder) + numeric.slice(i, i + 7)) % 97
  }
  return remainder === 1 ? ok : fail(t('auth.validation.ibanControl'))
}

/* ------------------------------------------------------------------ */
/* Zona horaria                                                         */
/* ------------------------------------------------------------------ */

export function isValidTimezone(tz: string): boolean {
  if (!tz) return false
  try {
    new Intl.DateTimeFormat('es-ES', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export function validateTimezone(tz: string): ValidationResult {
  return isValidTimezone(tz) ? ok : fail(t('auth.validation.timezoneInvalid'))
}

/* ------------------------------------------------------------------ */
/* Contraseña                                                           */
/* ------------------------------------------------------------------ */

export interface PasswordRequirement {
  key: string
  label: string
  met: boolean
}

export const PASSWORD_MIN_LENGTH = 8

export function passwordRequirements(password: string): PasswordRequirement[] {
  const p = password ?? ''
  return [
    { key: 'length', label: t('auth.validation.passwordMinLength', { min: PASSWORD_MIN_LENGTH }), met: p.length >= PASSWORD_MIN_LENGTH },
    { key: 'upper', label: t('auth.validation.passwordUpper'), met: /[A-ZÁÉÍÓÚÑ]/.test(p) },
    { key: 'lower', label: t('auth.validation.passwordLower'), met: /[a-záéíóúñ]/.test(p) },
    { key: 'digit', label: t('auth.validation.passwordDigit'), met: /\d/.test(p) },
  ]
}

export function validatePassword(password: string): ValidationResult {
  const reqs = passwordRequirements(password)
  const missing = reqs.filter((r) => !r.met)
  if (!password) return fail(t('auth.validation.passwordRequired'))
  if (missing.length) return fail(t('auth.validation.passwordMustMeet', { requirements: missing.map((m) => m.label.toLowerCase()).join(', ') }))
  return ok
}

export function validatePasswordConfirmation(password: string, confirmation: string): ValidationResult {
  if (!confirmation) return fail(t('auth.validation.confirmRequired'))
  return password === confirmation ? ok : fail(t('auth.validation.passwordsMismatch'))
}

/* ------------------------------------------------------------------ */
/* Porcentajes, horarios y series                                       */
/* ------------------------------------------------------------------ */

export function validatePercentage(value: number | string, label?: string): ValidationResult {
  const n = typeof value === 'string' ? Number(value.replace(',', '.')) : value
  const subject = label ?? t('auth.validation.percentageLabel')
  if (value === '' || Number.isNaN(n)) return fail(t('auth.validation.percentageNumber', { label: subject }))
  if (n < 0 || n > 100) return fail(t('auth.validation.percentageRange', { label: subject }))
  return ok
}

export interface DayHours {
  enabled: boolean
  from: string // "09:00"
  to: string // "18:00"
}

export type BusinessHours = Record<string, DayHours>

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

/** Nombre del día para mostrar (las claves internas del horario son los días en español). */
export function businessDayLabel(day: string): string {
  return t(`auth.forms.businessHours.days.${day}`, { defaultValue: day })
}

export function validateBusinessHours(hours: BusinessHours | undefined): ValidationResult {
  if (!hours) return ok
  for (const [day, h] of Object.entries(hours)) {
    if (!h.enabled) continue
    if (!TIME_RE.test(h.from) || !TIME_RE.test(h.to)) return fail(t('auth.validation.hoursInvalid', { day: businessDayLabel(day) }))
    if (h.from >= h.to) return fail(t('auth.validation.hoursOrder', { day: businessDayLabel(day) }))
  }
  return ok
}

export function validateSeries(quote: string, invoice: string, advance: string): ValidationResult {
  const all = [quote, invoice, advance].map((s) => (s ?? '').trim().toUpperCase())
  if (all.some((s) => !s)) return fail(t('auth.validation.seriesRequired'))
  if (all.some((s) => !/^[A-Z0-9\-_/]{1,10}$/.test(s))) return fail(t('auth.validation.seriesFormat'))
  if (new Set(all).size !== all.length) return fail(t('auth.validation.seriesDuplicate'))
  return ok
}

/* ------------------------------------------------------------------ */
/* Nombres                                                              */
/* ------------------------------------------------------------------ */

export function validateRequiredText(value: string, message: string, min = 2): ValidationResult {
  const v = (value ?? '').trim()
  if (v.length < min) return fail(message)
  return ok
}

/** Nombre y apellidos: al menos dos palabras. */
export function validatePersonName(value: string): ValidationResult {
  const v = (value ?? '').trim()
  if (!v) return fail(t('auth.validation.personNameRequired'))
  if (v.split(/\s+/).length < 2) return fail(t('auth.validation.personNameTwoWords'))
  return ok
}

export function validateHexColor(value: string): ValidationResult {
  if (!value) return ok
  return /^#[0-9a-fA-F]{6}$/.test(value) ? ok : fail(t('auth.validation.hexColorInvalid'))
}
