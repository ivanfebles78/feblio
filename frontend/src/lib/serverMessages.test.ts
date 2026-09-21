// Feblio · mensajes generados por el servidor: códigos estables → texto en el idioma de la interfaz,
// plantillas de canal por idioma de la empresa y sincronización del idioma del usuario (metadatos).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sb = vi.hoisted(() => ({
  rpc: vi.fn(),
  functions: { invoke: vi.fn() },
  from: vi.fn(),
  auth: { getSession: vi.fn(), updateUser: vi.fn() },
}))
vi.mock('./supabase', () => ({ supabase: sb }))

import i18n, { resetLanguageForTests, setUserLanguage } from '../i18n'
import { serverErrorMessage } from './serverErrors'
import { cambiarEstado, clienteDescargarDocumento, clienteEnviar, serverErrorCode } from './solicitudes/api'
import { CHANNEL_DEFAULTS, channelDefault, templateVariables } from './onboarding/channelDefaults'
import { defaultSmsData, defaultVoiceData, defaultWhatsAppData } from './onboarding/steps'
import { notificationBody } from '../components/v2/NotificationsBell'
import { syncUserLanguageMetadata } from './userLanguage'

const pgError = (message: string, details: string, code = '22023') => ({ message, details, code, hint: null, name: 'PostgrestError' })

describe('errores de negocio de RPC: código estable en `details` (migración 0016)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    resetLanguageForTests()
  })

  it('con interfaz en español se muestra el texto español del código', async () => {
    sb.rpc.mockResolvedValue({ data: null, error: pgError('La solicitud está cerrada', 'request_closed') })
    await expect(clienteEnviar('t'.repeat(43), {})).rejects.toMatchObject({ message: 'La solicitud está cerrada', code: 'request_closed' })
  })

  it('con interfaz en inglés el mismo código se traduce al inglés aunque el servidor hable español', async () => {
    setUserLanguage('en')
    sb.rpc.mockResolvedValue({ data: null, error: pgError('La solicitud está cerrada', 'request_closed') })
    await expect(clienteEnviar('t'.repeat(43), {})).rejects.toMatchObject({ message: 'This request is closed', code: 'request_closed' })
    sb.rpc.mockResolvedValue({ data: null, error: pgError('Transición no permitida: nueva → cerrada', 'invalid_transition') })
    await expect(cambiarEstado('id', 'closed')).rejects.toThrow('State transition not allowed')
  })

  it('código desconocido o ausente: se muestra el mensaje del servidor, nunca una clave técnica', async () => {
    setUserLanguage('en')
    sb.rpc.mockResolvedValue({ data: null, error: pgError('Mensaje libre del servidor', 'codigo_que_no_existe') })
    await expect(clienteEnviar('t'.repeat(43), {})).rejects.toThrow('Mensaje libre del servidor')
    sb.rpc.mockResolvedValue({ data: null, error: pgError('Otro mensaje', '') })
    await expect(clienteEnviar('t'.repeat(43), {})).rejects.toThrow('Otro mensaje')
    expect(serverErrorCode({ details: 'requests.serverErrors.x' })).toBeNull()
    expect(serverErrorCode({ details: 'request_closed' })).toBe('request_closed')
    expect(serverErrorCode(null)).toBeNull()
  })

  it('los errores de permisos siguen siendo neutros (no revelan si la fila existe)', async () => {
    sb.rpc.mockResolvedValue({ data: null, error: pgError('Enlace no válido', 'invalid_link', '42501') })
    await expect(clienteEnviar('t'.repeat(43), {})).rejects.toMatchObject({ code: '42501' })
  })
})

describe('descarga anónima: código estable de la Edge Function', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    resetLanguageForTests()
  })

  it('`download_rate_limited` en el cuerpo → mensaje de límite; `download_invalid` → neutro', async () => {
    setUserLanguage('en')
    const limited = new Response(JSON.stringify({ code: 'download_rate_limited', error: 'Demasiadas solicitudes. Inténtalo en unos minutos.' }), { status: 429 })
    sb.functions.invoke.mockResolvedValue({ data: null, error: Object.assign(new Error('x'), { context: limited }) })
    await expect(clienteDescargarDocumento('t'.repeat(43), 'doc')).rejects.toMatchObject({ code: 'download_rate_limited', message: expect.stringMatching(/too many downloads/i) })

    const invalid = new Response(JSON.stringify({ code: 'download_invalid', error: 'Enlace no válido' }), { status: 404 })
    sb.functions.invoke.mockResolvedValue({ data: null, error: Object.assign(new Error('x'), { context: invalid }) })
    await expect(clienteDescargarDocumento('t'.repeat(43), 'doc')).rejects.toMatchObject({ code: 'download_invalid', message: expect.stringMatching(/not available/i) })
  })

  it('sin código en la respuesta se mantiene el respaldo por estado HTTP', async () => {
    sb.functions.invoke.mockResolvedValue({ data: null, error: Object.assign(new Error('x'), { context: { status: 429 } }) })
    await expect(clienteDescargarDocumento('t'.repeat(43), 'doc')).rejects.toThrow(/demasiadas descargas/i)
  })
})

describe('respuestas {ok:false, code} de RPC/Edge (OTP, formulario público)', () => {
  beforeEach(() => {
    localStorage.clear()
    resetLanguageForTests()
  })

  it('traduce por código en es/en y cae al mensaje del servidor o al respaldo', () => {
    expect(serverErrorMessage({ ok: false, code: 'otp_expired', error: 'El código ha caducado. Reenvíalo.' }, 'auth.verify.serverErrors', 'x')).toBe('El código ha caducado. Reenvíalo.')
    setUserLanguage('en')
    expect(serverErrorMessage({ ok: false, code: 'otp_expired', error: 'El código ha caducado. Reenvíalo.' }, 'auth.verify.serverErrors', 'x')).toBe('The code has expired. Please resend it.')
    expect(serverErrorMessage({ ok: false, code: 'link_expired' }, 'intake.submit.serverErrors', 'x')).toBe('This link has expired. Please request a new one.')
    expect(serverErrorMessage({ ok: false, code: 'nope', error: 'Servidor dice' }, 'auth.verify.serverErrors', 'x')).toBe('Servidor dice')
    expect(serverErrorMessage({ ok: false }, 'auth.verify.serverErrors', 'Respaldo')).toBe('Respaldo')
    expect(serverErrorMessage(null, 'auth.verify.serverErrors', 'Respaldo')).toBe('Respaldo')
    // nunca la clave técnica
    expect(serverErrorMessage({ ok: false, code: 'otp_expired' }, 'auth.verify.serverErrors', 'x')).not.toMatch(/serverErrors/)
  })

  it('los catálogos de códigos tienen las mismas claves en es y en', () => {
    for (const path of ['requests.serverErrors', 'auth.verify.serverErrors', 'intake.submit.serverErrors']) {
      const es = i18n.getResource('es', 'translation', path) as Record<string, string>
      const en = i18n.getResource('en', 'translation', path) as Record<string, string>
      expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort())
      expect(Object.keys(es).length).toBeGreaterThan(0)
    }
  })
})

describe('plantillas por defecto de canal según el idioma de la empresa', () => {
  it('es → español, en → inglés, ausente/no válido → español', () => {
    expect(defaultWhatsAppData('es').welcome_message).toMatch(/gracias por escribir/i)
    expect(defaultWhatsAppData('en').welcome_message).toMatch(/thanks for contacting/i)
    expect(defaultWhatsAppData(null).welcome_message).toMatch(/gracias por escribir/i)
    expect(defaultWhatsAppData('pt').consent_text).toMatch(/aceptas/i)
    expect(defaultSmsData('en').form_message_template).toMatch(/complete your details/i)
    expect(defaultSmsData('en').opt_out_keyword).toBe('STOP')
    expect(defaultSmsData(undefined).opt_out_keyword).toBe('BAJA')
    expect(defaultVoiceData('Europe/Madrid', 'en').welcome_message).toMatch(/thank you for calling/i)
    expect(defaultVoiceData('Europe/Madrid', 'en').languages).toEqual(['en'])
    expect(defaultVoiceData().welcome_message).toMatch(/gracias por llamar/i)
  })

  it('las variables {empresa}, {nombre}, {url} son idénticas en ambos idiomas', () => {
    for (const [key, entry] of Object.entries(CHANNEL_DEFAULTS)) {
      expect(templateVariables(entry.en), key).toEqual(templateVariables(entry.es))
      expect(entry.es.trim().length, key).toBeGreaterThan(0)
      expect(entry.en.trim().length, key).toBeGreaterThan(0)
    }
    expect(templateVariables(channelDefault('form_message', 'en'))).toEqual(['empresa', 'nombre', 'url'])
  })

  it('una plantilla personalizada guardada no se traduce ni se reescribe al cambiar el idioma', () => {
    // Mismo mecanismo que OnboardingContext.getStepData: lo guardado pisa a los valores por defecto
    const saved = { welcome_message: 'Texto propio de la empresa {empresa}', form_message_template: 'Mi plantilla {url}' }
    const before = { ...defaultWhatsAppData('es'), ...saved }
    const after = { ...defaultWhatsAppData('en'), ...saved }
    expect(after.welcome_message).toBe('Texto propio de la empresa {empresa}')
    expect(after.form_message_template).toBe('Mi plantilla {url}')
    expect(before.welcome_message).toBe(after.welcome_message)
    // y los campos no guardados sí toman el idioma de la empresa
    expect(after.off_hours_message).toMatch(/business day/i)
  })
})

describe('notificaciones persistidas: cuerpo generado por el servidor en es o en', () => {
  const t = ((key: string, opts?: Record<string, unknown>) => (key === 'dashboard.notifications.submittedBody' ? `${String(opts?.name)}|${String(opts?.percent)}` : key)) as never
  it('reconoce ambos formatos y deja intacto el texto de usuario', () => {
    expect(notificationBody({ type: 'solicitud.submitted', body: 'Ana ha enviado el formulario (88% completo).' }, t)).toBe('Ana|88')
    expect(notificationBody({ type: 'solicitud.submitted', body: 'Ana has submitted the form (88% complete).' }, t)).toBe('Ana|88')
    expect(notificationBody({ type: 'solicitud.message', body: 'Ana has submitted the form (88% complete).' }, t)).toBe('Ana has submitted the form (88% complete).')
    expect(notificationBody({ type: 'solicitud.client_document', body: 'dni.pdf' }, t)).toBe('dni.pdf')
  })
})

describe('selector de idioma: sincronización de auth.user_metadata.language', () => {
  // El setup global restaura los espías tras cada prueba: se crea en beforeEach
  let warn: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    resetLanguageForTests()
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => warn.mockRestore())

  it('con sesión actualiza los metadatos del usuario y nunca toca empresas.language', async () => {
    sb.auth.getSession.mockResolvedValue({ data: { session: { user: { user_metadata: { language: 'es' } } } } })
    sb.auth.updateUser.mockResolvedValue({ data: {}, error: null })
    await expect(syncUserLanguageMetadata('en')).resolves.toBe('synced')
    expect(sb.auth.updateUser).toHaveBeenCalledWith({ data: { language: 'en' } })
    expect(sb.from).not.toHaveBeenCalled()
    expect(sb.rpc).not.toHaveBeenCalled()
  })

  it('sin sesión no escribe nada; si ya coincide tampoco', async () => {
    sb.auth.getSession.mockResolvedValue({ data: { session: null } })
    await expect(syncUserLanguageMetadata('en')).resolves.toBe('skipped')
    sb.auth.getSession.mockResolvedValue({ data: { session: { user: { user_metadata: { language: 'en' } } } } })
    await expect(syncUserLanguageMetadata('en')).resolves.toBe('skipped')
    expect(sb.auth.updateUser).not.toHaveBeenCalled()
  })

  it('si la sincronización falla, la interfaz ya ha cambiado y solo se registra un aviso sin datos', async () => {
    sb.auth.getSession.mockResolvedValue({ data: { session: { user: { user_metadata: {} } } } })
    sb.auth.updateUser.mockResolvedValue({ data: null, error: { status: 500, message: 'secret token abc' } })
    setUserLanguage('en')
    await expect(syncUserLanguageMetadata('en')).resolves.toBe('failed')
    expect(i18n.language).toBe('en')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(warn.mock.calls[0])).not.toMatch(/secret token/)
    sb.auth.getSession.mockRejectedValue(new Error('network'))
    await expect(syncUserLanguageMetadata('es')).resolves.toBe('failed')
  })
})
