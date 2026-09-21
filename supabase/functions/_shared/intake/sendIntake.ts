// Feblio · lógica de `send-intake-email` separada de Deno.serve para poder probarla sin red.
//
// Modelo de seguridad:
//   1. JWT de Supabase obligatorio (verify_jwt en el gateway) y sesión validada en servidor
//      (`auth.getUser(jwt)`): la clave anon pública ya no basta para enviar correos.
//   2. La empresa del remitente sale de `profiles` (service role), nunca del payload.
//   3. El formulario (`client_intake`) se busca por id/token y debe pertenecer a ESA empresa; un
//      formulario de otra empresa o inexistente responde igual (404 neutro): sin acceso cruzado.
//   4. Destinatario (`client_intake.client_email`), nombre de empresa, idioma (`empresas.language`) y
//      URL (origen permitido + token de la fila) se obtienen de la base de datos, no del cliente.
//   5. Errores neutros con `code` estable; nunca se devuelven mensajes del proveedor ni excepciones.
import { companyLocale, type Locale } from '../i18n/locale.ts'
import { escapeHtml, serverT, serverTHtml } from '../i18n/messages.ts'

export const ALLOWED_METHODS = 'POST, OPTIONS'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
/** Orígenes públicos de la aplicación desde los que puede llamarse la función (además de APP_URL). */
export const PUBLIC_APP_ORIGINS = ['https://feblio.com', 'https://www.feblio.com']
const DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173']
const MAX_BODY_BYTES = 4096

export type SendIntakeCode =
  | 'method_not_allowed'
  | 'unauthorized'
  | 'forbidden'
  | 'invalid_payload'
  | 'not_found'
  | 'no_recipient'
  | 'form_closed'
  | 'not_configured'
  | 'send_failed'
  | 'error'

export interface IntakeRow {
  id: string
  empresa_id: string
  token: string
  status: string | null
  client_email: string | null
  expires_at: string | null
}

export interface EmpresaRow {
  id: string
  name: string | null
  trade_name?: string | null
  language?: unknown
}

export interface ProfileRow {
  empresa_id: string | null
  role: string | null
}

/** Dependencias inyectables (en producción, supabase-js con service role y Resend). */
export interface SendIntakeDeps {
  /** Valida el JWT en servidor y devuelve el id del usuario, o null si no es válido. */
  getUserId(jwt: string): Promise<string | null>
  getProfile(userId: string): Promise<ProfileRow | null>
  findIntakeById(id: string): Promise<IntakeRow | null>
  findIntakeByToken(token: string): Promise<IntakeRow | null>
  getEmpresa(empresaId: string): Promise<EmpresaRow | null>
  /** Envía el correo; devuelve el id del proveedor. Debe lanzar si falla. */
  sendMail(mail: { from: string; to: string; subject: string; html: string; text: string }): Promise<string | null>
  env(name: string): string | undefined
  /** Registro de errores sin datos personales (opcional). */
  log?(event: string, ctx: Record<string, unknown>): void
}

export interface SendIntakePayload {
  intake_id?: string
  token?: string
}

/** Payload aceptado: `{ intake_id }` (preferido) o `{ token }` / `{ link }` (compatibilidad con clientes antiguos). Nada más. */
export function parsePayload(body: unknown): SendIntakePayload | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const b = body as Record<string, unknown>
  if (typeof b.intake_id === 'string' && UUID_RE.test(b.intake_id)) return { intake_id: b.intake_id.toLowerCase() }
  if (typeof b.token === 'string' && UUID_RE.test(b.token)) return { token: b.token.toLowerCase() }
  if (typeof b.link === 'string' && b.link.length <= 512) {
    const m = /\/form\/([0-9a-f-]{36})(?:[?#]|$)/i.exec(b.link)
    if (m && UUID_RE.test(m[1])) return { token: m[1].toLowerCase() }
  }
  return null
}

/** Origen permitido para CORS y para construir el enlace público del formulario. */
export function allowedOrigin(origin: string | null, appUrl: string | undefined): string | null {
  if (!origin) return null
  const allowed = new Set<string>([...PUBLIC_APP_ORIGINS, ...DEV_ORIGINS])
  try {
    if (appUrl) allowed.add(new URL(appUrl).origin)
  } catch {
    /* APP_URL mal formada: se ignora */
  }
  return allowed.has(origin) ? origin : null
}

/** Base pública del enlace: origen de la petición si está permitido; si no, APP_URL o feblio.com. */
export function publicBase(origin: string | null, appUrl: string | undefined): string {
  const fromRequest = allowedOrigin(origin, appUrl)
  if (fromRequest) return fromRequest
  try {
    if (appUrl) return new URL(appUrl).origin
  } catch {
    /* APP_URL mal formada */
  }
  return PUBLIC_APP_ORIGINS[0]
}

export function corsHeaders(origin: string | null, appUrl: string | undefined): Record<string, string> {
  const o = allowedOrigin(origin, appUrl)
  return {
    ...(o ? { 'Access-Control-Allow-Origin': o, Vary: 'Origin' } : {}),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': ALLOWED_METHODS,
    'Cache-Control': 'no-store',
  }
}

/** HTML del correo (valores dinámicos escapados) y alternativa en texto plano. */
export function buildIntakeEmail(locale: Locale, company: string, link: string): { subject: string; html: string; text: string } {
  const safeLink = escapeHtml(link)
  const html = `
      <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
        <h2 style="color:#2563eb;margin-bottom:4px">${escapeHtml(company)}</h2>
        <p>${serverTHtml(locale, 'intake.greeting')}</p>
        <p>${serverT(locale, 'intake.body', { company: `<strong>${escapeHtml(company)}</strong>` })}</p>
        <p style="margin:24px 0">
          <a href="${safeLink}" style="background:#2563eb;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;display:inline-block">
            ${serverTHtml(locale, 'intake.cta')}
          </a>
        </p>
        <p style="font-size:12px;color:#64748b">${serverTHtml(locale, 'intake.fallbackLink', { link })}</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0" />
        <p style="font-size:11px;color:#94a3b8">${serverTHtml(locale, 'intake.footer')}</p>
      </div>`
  return { subject: serverT(locale, 'intake.subject', { company }), html, text: serverT(locale, 'intake.text', { company, link }) }
}

export interface SendIntakeResult {
  status: number
  body: { ok: boolean; code?: SendIntakeCode; locale?: Locale; link?: string; to?: string; id?: string | null }
}

const fail = (status: number, code: SendIntakeCode): SendIntakeResult => ({ status, body: { ok: false, code } })

function bearer(req: Request): string | null {
  const h = req.headers.get('Authorization') ?? ''
  const m = /^Bearer\s+(.+)$/i.exec(h)
  return m ? m[1].trim() : null
}

function isExpired(row: IntakeRow, now = Date.now()): boolean {
  if (!row.expires_at) return false
  const t = Date.parse(row.expires_at)
  return Number.isFinite(t) && t < now
}

/**
 * Procesa una petición POST. Orden: método → JWT/sesión → payload → perfil → formulario propio →
 * destinatario → configuración → envío. Cualquier fallo devuelve un `code` neutro.
 */
export async function handleSendIntake(req: Request, deps: SendIntakeDeps): Promise<SendIntakeResult> {
  if (req.method !== 'POST') return fail(405, 'method_not_allowed')

  const jwt = bearer(req)
  if (!jwt) return fail(401, 'unauthorized')
  const userId = await deps.getUserId(jwt).catch(() => null)
  if (!userId) return fail(401, 'unauthorized')

  const raw = await req.text().catch(() => '')
  if (raw.length > MAX_BODY_BYTES) return fail(400, 'invalid_payload')
  let parsedBody: unknown
  try {
    parsedBody = JSON.parse(raw)
  } catch {
    return fail(400, 'invalid_payload')
  }
  const payload = parsePayload(parsedBody)
  if (!payload) return fail(400, 'invalid_payload')

  const profile = await deps.getProfile(userId)
  // Solo cuentas de empresa (o administradores adscritos a una empresa); nunca clientes ni cuentas sin empresa
  if (!profile?.empresa_id || profile.role === 'cliente') return fail(403, 'forbidden')

  const row = payload.intake_id ? await deps.findIntakeById(payload.intake_id) : await deps.findIntakeByToken(payload.token!)
  // Inexistente y de otra empresa se responden igual: no se revela si el recurso existe
  if (!row || row.empresa_id !== profile.empresa_id) return fail(404, 'not_found')
  if (row.status === 'completado' || isExpired(row)) return fail(409, 'form_closed')
  const to = (row.client_email ?? '').trim()
  if (!EMAIL_RE.test(to)) return fail(400, 'no_recipient')

  const empresa = await deps.getEmpresa(profile.empresa_id)
  if (!empresa) return fail(404, 'not_found')
  const company = (empresa.trade_name ?? '').trim() || (empresa.name ?? '').trim() || 'Feblio'
  const locale = companyLocale(empresa)
  const link = `${publicBase(req.headers.get('Origin'), deps.env('APP_URL'))}/form/${row.token}`

  const key = deps.env('RESEND_API_KEY')
  if (!key) return fail(500, 'not_configured')
  const from = deps.env('INTAKE_FROM_EMAIL') ?? 'Feblio <onboarding@resend.dev>'
  const mail = buildIntakeEmail(locale, company, link)
  try {
    const id = await deps.sendMail({ from, to, subject: mail.subject, html: mail.html, text: mail.text })
    return { status: 200, body: { ok: true, locale, link, to, id } }
  } catch (e) {
    deps.log?.('send-intake-email: fallo del proveedor', { intake: row.id, reason: e instanceof Error ? e.name : 'unknown' })
    return fail(502, 'send_failed')
  }
}
