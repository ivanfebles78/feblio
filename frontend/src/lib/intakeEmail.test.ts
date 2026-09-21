import { beforeEach, describe, expect, it, vi } from 'vitest'

const sb = vi.hoisted(() => ({ functions: { invoke: vi.fn() } }))
vi.mock('./supabase', () => ({ supabase: sb }))

import { resetLanguageForTests, setUserLanguage } from '../i18n'
import { INTAKE_EMAIL_FUNCTION, sendIntakeEmail } from './intakeEmail'

const ID = '33333333-3333-4333-8333-333333333333'

describe('sendIntakeEmail (Edge Function send-intake-email)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    resetLanguageForTests()
  })

  it('solo envía el identificador del formulario: nunca destinatario, empresa, idioma ni enlace', async () => {
    sb.functions.invoke.mockResolvedValue({ data: { ok: true, locale: 'es', link: 'https://feblio.com/form/x' }, error: null })
    const r = await sendIntakeEmail(ID, 'cliente@example.com')
    expect(sb.functions.invoke).toHaveBeenCalledWith(INTAKE_EMAIL_FUNCTION, { body: { intake_id: ID } })
    expect(r).toEqual({ ok: true, message: 'Email enviado a cliente@example.com.' })
  })

  it('códigos neutros del servidor → mensaje traducido al idioma de la interfaz', async () => {
    sb.functions.invoke.mockResolvedValue({ data: { ok: false, code: 'not_found' }, error: null })
    expect((await sendIntakeEmail(ID, 'a@b.co')).message).toMatch(/no se encontró el formulario/i)
    setUserLanguage('en')
    sb.functions.invoke.mockResolvedValue({ data: { ok: false, code: 'form_closed' }, error: null })
    expect((await sendIntakeEmail(ID, 'a@b.co')).message).toMatch(/already completed or has expired/i)
  })

  it('error de transporte (Response 401/404/502) → se lee el código del cuerpo; sin cuerpo, texto de respaldo', async () => {
    sb.functions.invoke.mockResolvedValue({ data: null, error: Object.assign(new Error('non-2xx'), { context: new Response(JSON.stringify({ ok: false, code: 'unauthorized' }), { status: 401 }) }) })
    const r = await sendIntakeEmail(ID, 'a@b.co')
    expect(r.ok).toBe(false)
    expect(r.code).toBe('unauthorized')
    expect(r.message).toMatch(/sesión ha caducado/i)
    sb.functions.invoke.mockResolvedValue({ data: null, error: new Error('Failed to fetch') })
    expect((await sendIntakeEmail(ID, 'a@b.co')).message).toMatch(/no se pudo enviar el email/i)
  })

  it('nunca muestra una clave técnica ni el texto crudo de un error del servidor con código desconocido y sin mensaje', async () => {
    sb.functions.invoke.mockResolvedValue({ data: { ok: false, code: 'algo_raro' }, error: null })
    const r = await sendIntakeEmail(ID, 'a@b.co')
    expect(r.message).not.toMatch(/serverErrors|algo_raro/)
  })
})
