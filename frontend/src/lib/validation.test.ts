import { describe, expect, it } from 'vitest'
import { setUserLanguage } from '../i18n'
import {
  normalizeIban,
  normalizeTaxId,
  passwordRequirements,
  validateBusinessHours,
  validateEmail,
  validateIban,
  validatePassword,
  validatePasswordConfirmation,
  validatePercentage,
  validatePersonName,
  validatePhone,
  validateSeries,
  validateTaxId,
  validateTimezone,
  validateUrl,
  businessDayLabel,
} from './validation'

describe('NIF fiscal', () => {
  it('normaliza mayúsculas y elimina espacios, guiones y puntos', () => {
    expect(normalizeTaxId(' b-12.345 678 ')).toBe('B12345678')
  })
  it('acepta un NIF de persona física con letra correcta', () => {
    expect(validateTaxId('12345678Z')).toMatchObject({ ok: true, kind: 'NIF' })
  })
  it('rechaza un NIF con letra de control incorrecta explicando el motivo', () => {
    const r = validateTaxId('12345678A')
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/letra de control/i)
  })
  it('acepta un NIE válido', () => {
    expect(validateTaxId('X1234567L')).toMatchObject({ ok: true, kind: 'NIE' })
  })
  it('acepta un CIF válido', () => {
    expect(validateTaxId('B12345674')).toMatchObject({ ok: true, kind: 'CIF' })
    expect(validateTaxId('A58818501')).toMatchObject({ ok: true, kind: 'CIF' })
  })
  it('acepta identificadores extranjeros con prefijo de país sin bloquear', () => {
    expect(validateTaxId('PT123456789')).toMatchObject({ ok: true, kind: 'foreign' })
  })
  it('explica el formato esperado cuando no reconoce el valor', () => {
    const r = validateTaxId('12')
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/NIF, NIE o CIF/)
  })
})

describe('email, teléfono y URL', () => {
  it('valida emails razonables', () => {
    expect(validateEmail('ana@empresa.es').ok).toBe(true)
    expect(validateEmail('ana@empresa').ok).toBe(false)
    expect(validateEmail('').ok).toBe(false)
  })
  it('valida teléfonos con o sin prefijo', () => {
    expect(validatePhone('+34 600 000 000').ok).toBe(true)
    expect(validatePhone('600000000').ok).toBe(true)
    expect(validatePhone('abc').ok).toBe(false)
    expect(validatePhone('', { required: true }).ok).toBe(false)
    expect(validatePhone('').ok).toBe(true)
  })
  it('valida URLs con o sin protocolo', () => {
    expect(validateUrl('www.empresa.com').ok).toBe(true)
    expect(validateUrl('https://empresa.com/x').ok).toBe(true)
    expect(validateUrl('no url').ok).toBe(false)
  })
})

describe('IBAN', () => {
  it('acepta un IBAN válido (mod 97) y lo normaliza', () => {
    expect(normalizeIban('gb82 west 1234 5698 7654 32')).toBe('GB82WEST12345698765432')
    expect(validateIban('GB82 WEST 1234 5698 7654 32').ok).toBe(true)
    expect(validateIban('ES91 2100 0418 4502 0005 1332').ok).toBe(true)
  })
  it('rechaza un IBAN con dígitos de control incorrectos', () => {
    expect(validateIban('ES91 2100 0418 4502 0005 1333').ok).toBe(false)
  })
  it('permite vacío si no es obligatorio', () => {
    expect(validateIban('').ok).toBe(true)
    expect(validateIban('', { required: true }).ok).toBe(false)
  })
})

describe('contraseña', () => {
  it('exige longitud, mayúscula, minúscula y número', () => {
    expect(validatePassword('corta').ok).toBe(false)
    expect(validatePassword('Segura123').ok).toBe(true)
    expect(passwordRequirements('Segura123').every((r) => r.met)).toBe(true)
  })
  it('la confirmación debe coincidir', () => {
    expect(validatePasswordConfirmation('Segura123', 'Segura123').ok).toBe(true)
    expect(validatePasswordConfirmation('Segura123', 'Segura124').ok).toBe(false)
  })
})

describe('otros', () => {
  it('nombre de persona requiere nombre y apellido', () => {
    expect(validatePersonName('Ana').ok).toBe(false)
    expect(validatePersonName('Ana Pérez').ok).toBe(true)
  })
  it('zona horaria válida', () => {
    expect(validateTimezone('Atlantic/Canary').ok).toBe(true)
    expect(validateTimezone('Marte/Base').ok).toBe(false)
  })
  it('porcentaje entre 0 y 100', () => {
    expect(validatePercentage(50).ok).toBe(true)
    expect(validatePercentage(101).ok).toBe(false)
    expect(validatePercentage('-1').ok).toBe(false)
  })
  it('series no duplicadas', () => {
    expect(validateSeries('P', 'F', 'A').ok).toBe(true)
    expect(validateSeries('F', 'F', 'A').ok).toBe(false)
    expect(validateSeries('', 'F', 'A').ok).toBe(false)
  })
  it('horarios coherentes', () => {
    expect(validateBusinessHours({ lunes: { enabled: true, from: '09:00', to: '18:00' } }).ok).toBe(true)
    expect(validateBusinessHours({ lunes: { enabled: true, from: '19:00', to: '18:00' } }).ok).toBe(false)
    expect(validateBusinessHours({ lunes: { enabled: false, from: '19:00', to: '18:00' } }).ok).toBe(true)
  })
})

describe('mensajes en inglés (idioma de la interfaz)', () => {
  it('traduce los mensajes de validación al cambiar de idioma', () => {
    setUserLanguage('en')
    expect(validateEmail('').message).toBe('Enter an email address.')
    expect(validateEmail('ana@empresa').message).toBe('The email address is not valid.')
    expect(validateTaxId('12345678A').message).toMatch(/NIF check letter/)
    expect(validatePassword('corta').message).toBe('The password must have: at least 8 characters, one uppercase letter, one number.')
    expect(validatePasswordConfirmation('Segura123', 'Segura124').message).toBe('The passwords do not match.')
    expect(validatePersonName('Ana').message).toBe('Enter your first name and at least one surname.')
    expect(validatePercentage('abc').message).toBe('The percentage must be a number.')
    expect(validateBusinessHours({ lunes: { enabled: true, from: '19:00', to: '18:00' } }).message).toBe('On Monday the start time must be before the end time.')
    expect(passwordRequirements('').map((r) => r.label)).toEqual(['At least 8 characters', 'One uppercase letter', 'One lowercase letter', 'One number'])
  })
  it('las etiquetas de requisitos y los días se evalúan en el momento de la llamada', () => {
    expect(passwordRequirements('')[0].label).toBe('Al menos 8 caracteres')
    expect(businessDayLabel('miércoles')).toBe('miércoles')
    expect(businessDayLabel('desconocido')).toBe('desconocido')
    setUserLanguage('en')
    expect(passwordRequirements('')[0].label).toBe('At least 8 characters')
    expect(businessDayLabel('miércoles')).toBe('Wednesday')
    expect(validatePercentage(101).message).toBe('The percentage must be between 0 and 100.')
  })
})
