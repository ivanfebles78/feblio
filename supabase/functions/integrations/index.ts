// Feblio · Edge Function `integrations`
//
// Único punto de contacto con proveedores externos (Google, Microsoft, Meta,
// Twilio, Stripe, Resend, IMAP/SMTP). Reglas:
//   - Nunca devuelve tokens ni secretos al navegador.
//   - Nunca marca "connected" sin una prueba real contra el proveedor.
//   - Si faltan variables de entorno responde { ok:false, code:'pending_credentials', missing:[...] }
//     y deja la conexión en estado pending_credentials.
//   - Aísla tenant: la empresa se resuelve del JWT; el admin puede indicar empresa_id.
//
// Esta función SOLO expone operaciones privadas (POST con JWT de usuario). Se despliega con
// la verificación de JWT del gateway activada (sin --no-verify-jwt) y, además, valida el JWT
// internamente con auth.getUser (defensa en profundidad).
//   supabase functions deploy integrations
// El callback OAuth (GET público, sin JWT) vive en la función separada
// `integrations-oauth-callback` (ver ese directorio).
// Secrets: ver docs/integraciones.md (APP_ENCRYPTION_KEY, APP_URL, GOOGLE_*, MICROSOFT_*, ...).
import {
  admin,
  applyTestResult,
  audit,
  deleteCredentials,
  getConnection,
  HttpError,
  loadCredentials,
  MissingEnv,
  resolveActor,
  saveCredentials,
  stripSecrets,
  updateConnection,
  type Actor,
  type Connection,
  type Kind,
} from '../_shared/integrations/db.ts'
import { MissingEnvError, signState } from '../_shared/integrations/crypto.ts'
import * as google from '../_shared/integrations/providers/google.ts'
import * as ms from '../_shared/integrations/providers/microsoft.ts'
import * as msg from '../_shared/integrations/providers/messaging.ts'
import * as imap from '../_shared/integrations/providers/imap.ts'
import { labelsOf, rootOf } from '../_shared/integrations/settings.ts'
import { companyLocale, companyLocaleById } from '../_shared/i18n/locale.ts'
import { serverT } from '../_shared/i18n/messages.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

const KINDS: Kind[] = ['document_repository', 'email', 'whatsapp', 'sms', 'voice', 'payments']
const OAUTH_PROVIDERS: Record<string, Kind> = { google_drive: 'document_repository', gmail: 'email', onedrive: 'document_repository', m365: 'email' }

interface Body {
  action: string
  kind: Kind
  provider?: string
  credentials?: Record<string, string>
  payload?: Record<string, unknown>
  returnTo?: string
  empresa_id?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ ok: false, code: 'invalid', message: 'Método no permitido' }, 405)

  const db = admin()
  let body: Body
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, code: 'invalid', message: 'Cuerpo no válido' }, 400)
  }
  if (!KINDS.includes(body.kind)) return json({ ok: false, code: 'invalid', message: 'Canal desconocido' }, 400)

  let actor: Actor
  try {
    actor = await resolveActor(db, req.headers.get('Authorization'), body.empresa_id)
  } catch (e) {
    return e instanceof HttpError ? json({ ok: false, code: e.code, message: e.message }, e.status) : json({ ok: false, code: 'unauthorized', message: 'No autenticado' }, 401)
  }

  const conn = await getConnection(db, actor.empresaId, body.kind)
  try {
    switch (body.action) {
      case 'start_oauth':
        return json(await startOAuth(db, actor, conn, body, req))
      case 'test':
      case 'health':
        return json(await testConnection(db, actor, conn, body.action, req))
      case 'disconnect':
        return json(await disconnect(db, actor, conn, req))
      case 'store_credentials':
        return json(await storeCredentials(db, actor, conn, body, req))
      case 'send_test':
        return json(await sendTest(db, actor, conn, body.payload ?? {}, req))
      case 'list_folders':
        return json(await listFolders(db, conn, body.payload ?? {}))
      case 'create_folder':
        return json(await createFolder(db, actor, conn, body.payload ?? {}, req))
      default:
        return json({ ok: false, code: 'invalid', message: 'Acción desconocida' }, 400)
    }
  } catch (e) {
    return json(await handleError(db, actor, conn, e, req))
  }
})

/* ------------------------------------------------------------------------ */
/* Errores                                                                   */
/* ------------------------------------------------------------------------ */

async function handleError(db: ReturnType<typeof admin>, actor: Actor, conn: Connection, e: unknown, req: Request) {
  if (e instanceof MissingEnv || e instanceof MissingEnvError || e instanceof msg.MissingProvider) {
    await updateConnection(db, conn.id, conn.empresa_id, { status: 'pending_credentials', last_error: `Faltan variables: ${e.missing.join(', ')}` })
    await audit(db, actor.empresaId, actor.userId, 'integration.pending_credentials', conn.id, 'blocked', { kind: conn.kind, provider: conn.provider, missing: e.missing }, req)
    return { ok: false, code: 'pending_credentials', missing: e.missing, message: 'Requiere configuración del administrador de Feblio.' }
  }
  if (e instanceof HttpError) return { ok: false, code: e.code, message: e.message }
  const message = e instanceof Error ? e.message : 'Error desconocido'
  if (message === 'not_connected') return { ok: false, code: 'not_connected', message: 'Esta integración no está conectada.' }
  if (message === 'expired') {
    await updateConnection(db, conn.id, conn.empresa_id, { status: 'expired', last_error: 'El acceso ha caducado; vuelve a conectar.' })
    return { ok: false, code: 'provider_error', message: 'El acceso al proveedor ha caducado. Vuelve a conectar.' }
  }
  if (/Tiempo de espera|aborted/i.test(message)) return { ok: false, code: 'timeout', message: 'El proveedor no respondió a tiempo.' }
  return { ok: false, code: 'provider_error', message: message.slice(0, 300) }
}

/* ------------------------------------------------------------------------ */
/* OAuth                                                                     */
/* ------------------------------------------------------------------------ */

async function startOAuth(db: ReturnType<typeof admin>, actor: Actor, conn: Connection, body: Body, req: Request) {
  const provider = body.provider ?? conn.provider ?? ''
  if (provider === 'stripe') {
    // Stripe usa la cuenta de plataforma (STRIPE_SECRET_KEY); no hay redirección
    const details = await msg.stripeTest()
    const updated = await applyTestResult(db, { ...conn, provider: 'stripe' }, actor, 'test', true, details, req, { provider: 'stripe', account_identifier: String(details.cuenta ?? '') })
    return { ok: true, connection: updated, details, message: 'Stripe verificado con la cuenta de la plataforma.' }
  }
  const kind = OAUTH_PROVIDERS[provider]
  if (!kind || kind !== conn.kind) throw new HttpError(400, 'Proveedor OAuth no válido para este canal', 'unsupported')
  const returnTo = typeof body.returnTo === 'string' && body.returnTo.startsWith('/') ? body.returnTo : '/onboarding'
  const state = await signState({ e: actor.empresaId, u: actor.userId, k: kind, p: provider, r: returnTo })
  const url = provider.startsWith('google') || provider === 'gmail' ? google.googleAuthUrl(provider, state) : ms.microsoftAuthUrl(provider, state)
  await updateConnection(db, conn.id, conn.empresa_id, { provider, status: 'connecting', last_error: null, settings: { ...conn.settings, ...stripSecrets(body.payload ?? {}) } })
  await audit(db, actor.empresaId, actor.userId, 'integration.oauth_started', conn.id, 'ok', { kind, provider }, req)
  return { ok: true, url }
}


/* ------------------------------------------------------------------------ */
/* Pruebas de conexión                                                       */
/* ------------------------------------------------------------------------ */

async function testConnection(db: ReturnType<typeof admin>, actor: Actor, conn: Connection, checkType: string, req: Request) {
  const provider = conn.provider ?? ''
  const write = checkType === 'test'
  let details: Record<string, unknown>
  try {
    switch (provider) {
      case 'google_drive':
        details = await google.driveTest(await google.googleAccessToken(db, conn), rootOf(conn), write)
        break
      case 'gmail':
        details = await google.gmailTest(await google.googleAccessToken(db, conn), labelsOf(conn))
        break
      case 'onedrive':
        details = await ms.onedriveTest(await ms.microsoftAccessToken(db, conn), rootOf(conn), write)
        break
      case 'm365':
        details = await ms.outlookTest(await ms.microsoftAccessToken(db, conn), labelsOf(conn))
        break
      case 'feblio_inbox':
        details = await msg.resendTest()
        break
      case 'imap': {
        const creds = await loadCredentials<imap.ImapCreds>(db, conn)
        if (!creds) throw new Error('not_connected')
        const s = conn.settings ?? {}
        const a = await imap.imapTest(String(s.imap_host ?? ''), Number(s.imap_port ?? 993), creds)
        const b = await imap.smtpTest(String(s.smtp_host ?? ''), Number(s.smtp_port ?? 587), creds)
        details = { ...a, ...b }
        break
      }
      case 'meta': {
        const creds = await loadCredentials<msg.WhatsAppCreds>(db, conn)
        if (!creds) throw new Error('not_connected')
        details = await msg.whatsappTest(creds, String(conn.settings?.phone_number_id ?? ''), String(conn.settings?.business_account_id ?? ''))
        break
      }
      case 'twilio': {
        const creds = await loadCredentials<msg.TwilioCreds>(db, conn)
        if (!creds) throw new Error('not_connected')
        details = await msg.twilioTest(creds, String(conn.settings?.sender_number ?? ''))
        break
      }
      case 'stripe':
        details = await msg.stripeTest()
        break
      case 'voice_provider':
        details = await msg.voiceTest()
        break
      case 'feblio_storage':
      case 'manual_log':
      case 'manual':
        throw new HttpError(400, 'Este proveedor se prueba desde la aplicación (RPC record_internal_health_check).', 'unsupported')
      default:
        throw new HttpError(400, 'Sin proveedor configurado.', 'not_connected')
    }
  } catch (e) {
    if (e instanceof MissingEnv || e instanceof MissingEnvError || e instanceof msg.MissingProvider || e instanceof HttpError) throw e
    const message = e instanceof Error ? e.message : 'Error'
    if (message === 'not_connected' || message === 'expired') throw e
    const updated = await applyTestResult(db, conn, actor, checkType, false, { error: message }, req)
    return { ok: false, code: 'provider_error', message: `La prueba falló: ${message}`, connection: updated }
  }
  const updated = await applyTestResult(db, conn, actor, checkType, true, details, req, { last_activity_at: new Date().toISOString() })
  const locale = await companyLocaleById(db, conn.empresa_id)
  return { ok: true, code: 'verified', message: serverT(locale, 'api.integrations.testVerified'), details, connection: updated }
}

/* ------------------------------------------------------------------------ */
/* Desconexión                                                               */
/* ------------------------------------------------------------------------ */

async function disconnect(db: ReturnType<typeof admin>, actor: Actor, conn: Connection, req: Request) {
  if (conn.provider === 'google_drive' || conn.provider === 'gmail') await google.googleRevoke(db, conn)
  await deleteCredentials(db, conn)
  const updated = await updateConnection(db, conn.id, conn.empresa_id, { status: 'disconnected', disconnected_at: new Date().toISOString(), token_expires_at: null, last_error: null })
  await audit(db, actor.empresaId, actor.userId, 'integration.disconnected', conn.id, 'ok', { kind: conn.kind, provider: conn.provider }, req)
  return { ok: true, message: 'Desconectado.', connection: updated }
}

/* ------------------------------------------------------------------------ */
/* Credenciales introducidas por la empresa                                  */
/* ------------------------------------------------------------------------ */

async function storeCredentials(db: ReturnType<typeof admin>, actor: Actor, conn: Connection, body: Body, req: Request) {
  const provider = body.provider ?? conn.provider ?? ''
  const creds = body.credentials ?? {}
  const required: Record<string, string[]> = { imap: ['username', 'password'], meta: ['access_token'], twilio: ['account_sid', 'auth_token'] }
  if (!required[provider]) throw new HttpError(400, 'Este proveedor no admite credenciales manuales', 'unsupported')
  const missing = required[provider].filter((k) => !creds[k]?.trim())
  if (missing.length) throw new HttpError(400, `Faltan campos: ${missing.join(', ')}`, 'invalid')
  const settings = { ...conn.settings, ...stripSecrets(body.payload ?? {}) }
  const updatedConn = await updateConnection(db, conn.id, conn.empresa_id, { provider, settings, status: 'connecting', last_error: null })
  await saveCredentials(db, updatedConn, provider, Object.fromEntries(Object.entries(creds).map(([k, v]) => [k, v.trim()])))
  await audit(db, actor.empresaId, actor.userId, 'integration.credentials_stored', conn.id, 'ok', { kind: conn.kind, provider }, req)
  return testConnection(db, actor, updatedConn, 'test', req)
}

/* ------------------------------------------------------------------------ */
/* Mensajes de prueba                                                        */
/* ------------------------------------------------------------------------ */

async function sendTest(db: ReturnType<typeof admin>, actor: Actor, conn: Connection, payload: Record<string, unknown>, req: Request) {
  if (conn.status !== 'connected') throw new HttpError(400, 'Conecta y prueba el canal antes de enviar un mensaje de prueba.', 'not_connected')
  const to = String(payload.to ?? '').trim()
  if (!to) throw new HttpError(400, 'Falta el destinatario', 'invalid')
  // Comunicación empresarial: idioma de la empresa (empresas.language), nunca el del navegador
  const empresa = await db.from('empresas').select('name, language').eq('id', conn.empresa_id).single()
  const empresaName = (empresa.data?.name as string) ?? 'Feblio'
  const locale = companyLocale(empresa.data as { language?: unknown } | null)
  const subject = serverT(locale, 'test.email.subject', { company: empresaName })
  const text = `${serverT(locale, 'test.email.text', { company: empresaName })}\n\n${String(payload.signature ?? '')}`
  let details: Record<string, unknown> = {}
  switch (conn.provider) {
    case 'gmail':
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) throw new HttpError(400, 'Email no válido', 'invalid')
      await google.gmailSend(await google.googleAccessToken(db, conn), to, subject, text, String(payload.sender_name ?? '') || undefined)
      break
    case 'm365':
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) throw new HttpError(400, 'Email no válido', 'invalid')
      await ms.outlookSend(await ms.microsoftAccessToken(db, conn), to, subject, text)
      break
    case 'feblio_inbox':
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) throw new HttpError(400, 'Email no válido', 'invalid')
      details = await msg.resendSend(to, subject, text, String(payload.sender_name ?? '') || empresaName)
      break
    case 'imap': {
      const creds = await loadCredentials<imap.ImapCreds>(db, conn)
      if (!creds) throw new Error('not_connected')
      const s = conn.settings ?? {}
      await imap.smtpSend(String(s.smtp_host ?? ''), Number(s.smtp_port ?? 587), creds, String(s.sender_address ?? creds.username), to, subject, text)
      break
    }
    case 'meta': {
      const creds = await loadCredentials<msg.WhatsAppCreds>(db, conn)
      if (!creds) throw new Error('not_connected')
      details = await msg.whatsappSendTemplate(creds, String(conn.settings?.phone_number_id ?? ''), to, String(payload.template_name ?? 'hello_world'), String(payload.lang ?? 'es'))
      break
    }
    case 'twilio': {
      const creds = await loadCredentials<msg.TwilioCreds>(db, conn)
      if (!creds) throw new Error('not_connected')
      // Plantilla personalizada por la empresa tal cual; solo la de defecto de Feblio se traduce
      const tpl = String(payload.template ?? serverT(locale, 'test.sms.template'))
      details = await msg.twilioSend(creds, String(conn.settings?.sender_number ?? ''), to, tpl.replace('{empresa}', empresaName).replace('{url}', 'https://example.invalid/form/prueba').replace('{nombre}', serverT(locale, 'test.sms.clientName')))
      break
    }
    default:
      throw new HttpError(400, 'Este canal no admite mensajes de prueba', 'unsupported')
  }
  await updateConnection(db, conn.id, conn.empresa_id, { last_activity_at: new Date().toISOString() })
  await audit(db, actor.empresaId, actor.userId, 'integration.test_message_sent', conn.id, 'ok', { kind: conn.kind, provider: conn.provider, to_domain: to.split('@')[1] ?? 'tel' }, req)
  return { ok: true, message: 'Mensaje de prueba enviado.', details }
}

/* ------------------------------------------------------------------------ */
/* Carpetas en repositorios externos                                          */
/* ------------------------------------------------------------------------ */

async function listFolders(db: ReturnType<typeof admin>, conn: Connection, payload: Record<string, unknown>) {
  const parent = typeof payload.parent === 'string' ? payload.parent : undefined
  if (conn.provider === 'google_drive') return { ok: true, folders: await google.driveListFolders(await google.googleAccessToken(db, conn), parent ?? 'root') }
  if (conn.provider === 'onedrive') return { ok: true, folders: await ms.onedriveListFolders(await ms.microsoftAccessToken(db, conn), parent) }
  throw new HttpError(400, 'Este repositorio no admite listar carpetas', 'unsupported')
}

async function createFolder(db: ReturnType<typeof admin>, actor: Actor, conn: Connection, payload: Record<string, unknown>, req: Request) {
  const path = Array.isArray(payload.path) ? (payload.path as unknown[]).map(String).filter((p) => /^[\w\-. ]{1,80}$/.test(p)) : []
  if (!path.length) throw new HttpError(400, 'Ruta no válida', 'invalid')
  const parent = rootOf(conn)
  let id: string
  if (conn.provider === 'google_drive') id = await google.driveCreatePath(await google.googleAccessToken(db, conn), path, parent)
  else if (conn.provider === 'onedrive') id = await ms.onedriveCreatePath(await ms.microsoftAccessToken(db, conn), path, parent)
  else throw new HttpError(400, 'Este repositorio no admite crear carpetas desde el servidor', 'unsupported')
  await updateConnection(db, conn.id, conn.empresa_id, { last_activity_at: new Date().toISOString() })
  await audit(db, actor.empresaId, actor.userId, 'repository.folder_created', conn.id, 'ok', { provider: conn.provider, path: path.join('/') }, req)
  return { ok: true, details: { id, path: path.join('/') } }
}
