// Feblio · envío del enlace del formulario de alta por correo a través de la Edge Function
// `send-intake-email`. El cliente solo indica QUÉ formulario (`intake_id`); destinatario, empresa,
// idioma y enlace los resuelve el servidor y solo si el formulario pertenece a la empresa del usuario.
import { supabase } from './supabase'
import { t } from '../i18n'
import { serverErrorMessage, type ServerResult } from './serverErrors'

export const INTAKE_EMAIL_FUNCTION = 'send-intake-email'
const ERROR_PREFIX = 'dashboard.templates.form.serverErrors'

export interface SendIntakeEmailResult {
  ok: boolean
  /** Mensaje ya localizado para mostrar al usuario. */
  message: string
  code?: string
}

export async function sendIntakeEmail(intakeId: string, email: string): Promise<SendIntakeEmailResult> {
  const { data, error } = await supabase.functions.invoke<ServerResult & { locale?: string }>(INTAKE_EMAIL_FUNCTION, { body: { intake_id: intakeId } })
  if (!error && data?.ok) return { ok: true, message: t('dashboard.templates.form.emailSent', { email }) }
  // Con error de transporte el cuerpo llega en `error.context` (Response); se intenta leer el código
  const body = data ?? (await bodyFromError(error))
  return { ok: false, message: serverErrorMessage(body, ERROR_PREFIX, t('dashboard.templates.form.emailFailed')), code: body?.code }
}

async function bodyFromError(error: unknown): Promise<ServerResult | null> {
  const res = (error as { context?: unknown } | null)?.context
  if (!(res instanceof Response)) return null
  try {
    const parsed = (await res.clone().json()) as ServerResult
    return typeof parsed === 'object' && parsed ? parsed : null
  } catch {
    return null
  }
}
