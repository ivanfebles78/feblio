// Feblio · Acceso a datos desde la Edge Function (service_role). Aísla tenant en
// cada operación: toda consulta filtra por empresa_id resuelto del JWT del usuario.
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { decryptJson, encryptJson } from './crypto.ts'

export type Kind = 'document_repository' | 'email' | 'whatsapp' | 'sms' | 'voice' | 'payments'
export type Status = 'not_configured' | 'pending_credentials' | 'connecting' | 'connected' | 'degraded' | 'expired' | 'error' | 'disconnected'

export interface Connection {
  id: string
  empresa_id: string
  kind: Kind
  provider: string | null
  status: Status
  settings: Record<string, unknown>
  account_identifier: string | null
  token_expires_at: string | null
  [k: string]: unknown
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string = 'invalid',
  ) {
    super(message)
  }
}

export function admin(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })
}

export interface Actor {
  userId: string
  empresaId: string
  role: string
}

/** Resuelve el usuario y su empresa a partir del JWT. Solo cuentas 'empresa' (o admin con empresa_id explícito). */
export async function resolveActor(db: SupabaseClient, authHeader: string | null, explicitEmpresa?: string): Promise<Actor> {
  if (!authHeader?.startsWith('Bearer ')) throw new HttpError(401, 'No autenticado', 'unauthorized')
  const { data, error } = await db.auth.getUser(authHeader.slice(7))
  if (error || !data.user) throw new HttpError(401, 'Sesión no válida', 'unauthorized')
  const { data: prof } = await db.from('profiles').select('role, empresa_id').eq('id', data.user.id).single()
  if (!prof) throw new HttpError(403, 'Perfil no encontrado', 'unauthorized')
  if (prof.role === 'admin' && explicitEmpresa) return { userId: data.user.id, empresaId: explicitEmpresa, role: 'admin' }
  if (prof.role !== 'empresa' || !prof.empresa_id) throw new HttpError(403, 'Solo las cuentas de empresa gestionan integraciones', 'unauthorized')
  if (explicitEmpresa && explicitEmpresa !== prof.empresa_id) throw new HttpError(403, 'No puedes acceder a otra empresa', 'unauthorized')
  return { userId: data.user.id, empresaId: prof.empresa_id, role: 'empresa' }
}

export async function getConnection(db: SupabaseClient, empresaId: string, kind: Kind): Promise<Connection> {
  const { data, error } = await db.from('integration_connections').select('*').eq('empresa_id', empresaId).eq('kind', kind).maybeSingle()
  if (error) throw new HttpError(500, error.message, 'provider_error')
  if (!data) {
    const ins = await db.from('integration_connections').insert({ empresa_id: empresaId, kind, status: 'not_configured' }).select('*').single()
    if (ins.error) throw new HttpError(500, ins.error.message, 'provider_error')
    return ins.data as Connection
  }
  return data as Connection
}

export async function updateConnection(db: SupabaseClient, id: string, empresaId: string, patch: Record<string, unknown>): Promise<Connection> {
  const { data, error } = await db.from('integration_connections').update(patch).eq('id', id).eq('empresa_id', empresaId).select('*').single()
  if (error) throw new HttpError(500, error.message, 'provider_error')
  return data as Connection
}

export async function saveCredentials(db: SupabaseClient, conn: Connection, provider: string, payload: object, expiresAt?: string | null) {
  const { ciphertext, iv } = await encryptJson(payload)
  await db.from('integration_credentials').delete().eq('connection_id', conn.id)
  const { error } = await db.from('integration_credentials').insert({
    empresa_id: conn.empresa_id,
    connection_id: conn.id,
    provider,
    ciphertext,
    iv,
    expires_at: expiresAt ?? null,
  })
  if (error) throw new HttpError(500, error.message, 'provider_error')
}

export async function loadCredentials<T = Record<string, unknown>>(db: SupabaseClient, conn: Connection): Promise<T | null> {
  const { data } = await db.from('integration_credentials').select('ciphertext, iv').eq('connection_id', conn.id).eq('empresa_id', conn.empresa_id).maybeSingle()
  if (!data) return null
  return decryptJson<T>(data.ciphertext, data.iv)
}

export async function deleteCredentials(db: SupabaseClient, conn: Connection) {
  await db.from('integration_credentials').delete().eq('connection_id', conn.id).eq('empresa_id', conn.empresa_id)
}

export async function recordHealth(db: SupabaseClient, conn: Connection, actor: Actor | null, checkType: string, ok: boolean, result: Record<string, unknown>) {
  await db.from('integration_health_checks').insert({
    empresa_id: conn.empresa_id,
    connection_id: conn.id,
    kind: conn.kind,
    check_type: checkType,
    ok,
    result: stripSecrets(result),
    checked_by: actor?.userId ?? null,
  })
}

export async function audit(db: SupabaseClient, empresaId: string, userId: string | null, action: string, entityId: string | null, result: 'ok' | 'error' | 'blocked', metadata: Record<string, unknown>, req?: Request) {
  const ip = req?.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
  await db.from('audit_events').insert({
    empresa_id: empresaId,
    user_id: userId,
    action,
    entity_type: 'integration_connections',
    entity_id: entityId,
    result,
    metadata: stripSecrets(metadata),
    ip: ip && /^[0-9a-f.:]+$/i.test(ip) ? ip : null,
    user_agent: req?.headers.get('user-agent')?.slice(0, 512) ?? null,
  })
}

const SECRET_RE = /(token|secret|password|passwd|api[_-]?key|private|authorization|cookie)/i

export function stripSecrets(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj ?? {}).filter(([k]) => !SECRET_RE.test(k)))
}

/** Marca conexión tras una prueba (connected/error) y registra salud + auditoría. */
export async function applyTestResult(db: SupabaseClient, conn: Connection, actor: Actor | null, checkType: string, ok: boolean, result: Record<string, unknown>, req?: Request, extra: Record<string, unknown> = {}) {
  await recordHealth(db, conn, actor, checkType, ok, result)
  const updated = await updateConnection(db, conn.id, conn.empresa_id, {
    status: ok ? 'connected' : 'error',
    last_test_at: new Date().toISOString(),
    last_test_ok: ok,
    last_error: ok ? null : String(result.error ?? result.message ?? 'Prueba fallida').slice(0, 500),
    connected_at: ok ? conn.connected_at ?? new Date().toISOString() : conn.connected_at,
    ...extra,
  })
  await audit(db, conn.empresa_id, actor?.userId ?? null, 'integration.tested', conn.id, ok ? 'ok' : 'error', { kind: conn.kind, provider: conn.provider, check: checkType, ok }, req)
  return updated
}

export function env(name: string): string | undefined {
  const v = Deno.env.get(name)
  return v && v.trim() ? v : undefined
}

export function requireEnv(names: string[]): Record<string, string> {
  const missing = names.filter((n) => !env(n))
  if (missing.length) throw new MissingEnv(missing)
  return Object.fromEntries(names.map((n) => [n, env(n)!]))
}

export class MissingEnv extends Error {
  constructor(public readonly missing: string[]) {
    super(`Requiere configuración del administrador de Feblio: ${missing.join(', ')}`)
  }
}

/** fetch con timeout y sin seguir redirecciones inesperadas. */
export async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 12_000): Promise<Response> {
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: c.signal, redirect: 'manual' })
  } finally {
    clearTimeout(t)
  }
}
