// Feblio · Adaptadores de mensajería y pagos: WhatsApp (Meta), SMS (Twilio), Stripe,
// dirección de entrada de Feblio (Resend) y telefonía (proveedor genérico).
import { fetchWithTimeout, env, requireEnv } from '../db.ts'
import { b64encode } from '../crypto.ts'

/* ------------------------------ WhatsApp ------------------------------ */

const GRAPH = 'https://graph.facebook.com/v20.0'

export interface WhatsAppCreds {
  access_token: string
}

/** Verifica que el token da acceso al Phone Number ID indicado (lectura real). */
export async function whatsappTest(creds: WhatsAppCreds, phoneNumberId: string, businessAccountId: string): Promise<Record<string, unknown>> {
  requireEnv(['WHATSAPP_APP_ID', 'WHATSAPP_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN'])
  if (!/^\d{6,20}$/.test(phoneNumberId)) throw new Error('Phone Number ID no válido')
  const r = await fetchWithTimeout(`${GRAPH}/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`, {
    headers: { Authorization: `Bearer ${creds.access_token}` },
  })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error?.message ?? `HTTP ${r.status}`)
  const details: Record<string, unknown> = { numero: j.display_phone_number, nombre_verificado: j.verified_name, calidad: j.quality_rating }
  if (/^\d{6,20}$/.test(businessAccountId)) {
    const w = await fetchWithTimeout(`${GRAPH}/${businessAccountId}?fields=name`, { headers: { Authorization: `Bearer ${creds.access_token}` } })
    const wj = await w.json()
    if (w.ok) details.cuenta_business = wj.name
  }
  return details
}

export async function whatsappSendTemplate(creds: WhatsAppCreds, phoneNumberId: string, to: string, templateName: string, lang = 'es'): Promise<Record<string, unknown>> {
  const r = await fetchWithTimeout(`${GRAPH}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${creds.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: to.replace(/[^\d+]/g, ''), type: 'template', template: { name: templateName, language: { code: lang } } }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error?.message ?? `HTTP ${r.status}`)
  return { message_id: j.messages?.[0]?.id }
}

/* -------------------------------- SMS --------------------------------- */

export interface TwilioCreds {
  account_sid: string
  auth_token: string
}

function twilioAuth(c: TwilioCreds) {
  return `Basic ${b64encode(`${c.account_sid}:${c.auth_token}`)}`
}

export async function twilioTest(creds: TwilioCreds, senderNumber: string): Promise<Record<string, unknown>> {
  const provider = env('SMS_PROVIDER')
  if (!provider) throw new MissingProvider(['SMS_PROVIDER'])
  if (provider !== 'twilio') throw new Error(`Proveedor SMS no soportado: ${provider}`)
  if (!/^AC[0-9a-f]{32}$/i.test(creds.account_sid)) throw new Error('Account SID no válido')
  const r = await fetchWithTimeout(`https://api.twilio.com/2010-04-01/Accounts/${creds.account_sid}.json`, { headers: { Authorization: twilioAuth(creds) } })
  const j = await r.json()
  if (!r.ok) throw new Error(j.message ?? `HTTP ${r.status}`)
  const details: Record<string, unknown> = { cuenta: j.friendly_name, estado: j.status }
  if (senderNumber) {
    const n = await fetchWithTimeout(`https://api.twilio.com/2010-04-01/Accounts/${creds.account_sid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(senderNumber.replace(/\s/g, ''))}`, { headers: { Authorization: twilioAuth(creds) } })
    const nj = await n.json()
    details.numero_remitente = n.ok && nj.incoming_phone_numbers?.length ? 'verificado en la cuenta' : 'no encontrado en la cuenta'
  }
  return details
}

export async function twilioSend(creds: TwilioCreds, from: string, to: string, body: string): Promise<Record<string, unknown>> {
  const r = await fetchWithTimeout(`https://api.twilio.com/2010-04-01/Accounts/${creds.account_sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: twilioAuth(creds), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ From: from.replace(/\s/g, ''), To: to.replace(/\s/g, ''), Body: body }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(j.message ?? `HTTP ${r.status}`)
  return { sid: j.sid, estado: j.status }
}

/* ------------------------------- Stripe ------------------------------- */

export async function stripeTest(): Promise<Record<string, unknown>> {
  const { STRIPE_SECRET_KEY } = requireEnv(['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'])
  const r = await fetchWithTimeout('https://api.stripe.com/v1/account', { headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` } })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error?.message ?? `HTTP ${r.status}`)
  return { cuenta: j.id, pais: j.country, cobros_activos: j.charges_enabled }
}

/* --------------------------- Feblio inbox ---------------------------- */

export async function resendSend(to: string, subject: string, text: string, fromName?: string): Promise<Record<string, unknown>> {
  const { RESEND_API_KEY } = requireEnv(['RESEND_API_KEY'])
  const fromBase = env('INTAKE_FROM_EMAIL') ?? 'onboarding@resend.dev'
  const from = fromName && !/</.test(fromBase) ? `${fromName} <${fromBase}>` : fromBase
  const r = await fetchWithTimeout('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, text }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(j.message ?? `HTTP ${r.status}`)
  return { id: j.id }
}

/** Comprobación de la clave de Resend sin enviar nada (lista dominios). */
export async function resendTest(): Promise<Record<string, unknown>> {
  const { RESEND_API_KEY } = requireEnv(['RESEND_API_KEY'])
  const r = await fetchWithTimeout('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${RESEND_API_KEY}` } })
  const j = await r.json()
  if (!r.ok) throw new Error(j.message ?? `HTTP ${r.status}`)
  const verified = (j.data ?? []).filter((d: { status: string }) => d.status === 'verified').map((d: { name: string }) => d.name)
  return { dominios_verificados: verified.length ? verified.join(', ') : 'ninguno (se usará el remitente de pruebas de Resend)' }
}

/* -------------------------------- Voz --------------------------------- */

export async function voiceTest(): Promise<Record<string, unknown>> {
  const { VOICE_PROVIDER } = requireEnv(['VOICE_PROVIDER', 'VOICE_API_KEY'])
  throw new Error(`El proveedor de voz "${VOICE_PROVIDER}" todavía no tiene adaptador implementado. Contacta con el administrador de Feblio.`)
}

export class MissingProvider extends Error {
  constructor(public readonly missing: string[]) {
    super(`Requiere configuración del administrador de Feblio: ${missing.join(', ')}`)
  }
}
