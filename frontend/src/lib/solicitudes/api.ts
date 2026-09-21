import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '../supabase'
import i18n, { t } from '../../i18n'
import type {
  ClienteVista,
  Notificacion,
  NuevaSolicitudInput,
  Solicitud,
  SolicitudAcceso,
  SolicitudAnalisis,
  SolicitudDocumento,
  SolicitudEvento,
  SolicitudMensaje,
  SolicitudRequisito,
  SolicitudResumen,
  SolicitudStatus,
} from './types'

export class SolicitudesApiError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message)
    this.name = 'SolicitudesApiError'
  }
}

function friendly(error: PostgrestError | Error | null | undefined, fallback: string): SolicitudesApiError {
  if (!error) return new SolicitudesApiError(fallback)
  const msg = error.message ?? ''
  const code = 'code' in error ? (error as PostgrestError).code : undefined
  if (code === '42501' || /permission denied|row-level security/i.test(msg)) return new SolicitudesApiError(t('common.errors.permission'), code)
  if (code === 'PGRST202') return new SolicitudesApiError(t('requests.api.migrationMissing'), code)
  // .single() sin fila: no existe o no pertenece a esta empresa (RLS); no se distingue a propósito
  if (code === 'PGRST116' || /coerce the result to a single/i.test(msg)) return new SolicitudesApiError(t('requests.api.notFound'), code)
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return new SolicitudesApiError(t('common.errors.network'), 'network')
  // Errores de negocio del servidor (22023 / P0002 / 53400): traen un código estable en `details`
  // (migración 0016) que se traduce aquí; sin código conocido se muestra el mensaje (español) tal cual
  const serverCode = serverErrorCode(error as { details?: unknown })
  if (serverCode) return new SolicitudesApiError(t(`requests.serverErrors.${serverCode}`, { defaultValue: msg || fallback }), serverCode)
  return new SolicitudesApiError(msg || fallback, code)
}

/** Código estable de error de negocio (`pg_exception_detail`, p. ej. `request_closed`) si existe en el catálogo. */
export function serverErrorCode(error: { details?: unknown } | null | undefined): string | null {
  const details = typeof error?.details === 'string' ? error.details.trim() : ''
  if (!/^[a-z_]{3,40}$/.test(details)) return null
  return i18n.exists(`requests.serverErrors.${details}`) ? details : null
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}, fallback?: string): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw friendly(error, fallback ?? t('common.errors.generic'))
  return data as T
}

/** Lee el `code` del cuerpo de error de la Edge Function (Response clonada) o del propio `data`. */
async function downloadErrorCode(error: unknown, data: { code?: string } | null): Promise<string | null> {
  if (data?.code && /^download_[a-z_]+$/.test(data.code)) return data.code
  const res = (error as { context?: unknown } | null)?.context
  if (!(res instanceof Response)) return null
  try {
    const body = (await res.clone().json()) as { code?: unknown }
    return typeof body?.code === 'string' && /^download_[a-z_]+$/.test(body.code) ? body.code : null
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ */
/* Empresa                                                              */
/* ------------------------------------------------------------------ */

export interface InboxFilters {
  q?: string
  status?: SolicitudStatus | 'all' | 'pending'
  channel?: string
}

/** Bandeja: solicitudes de la empresa (RLS) + no leídos por solicitud. */
export async function listSolicitudes(): Promise<SolicitudResumen[]> {
  const [sols, unread, clientes] = await Promise.all([
    supabase.from('solicitudes').select('*').order('last_activity_at', { ascending: false }),
    supabase.from('solicitud_mensajes').select('solicitud_id').neq('author_kind', 'empresa').is('read_by_empresa_at', null),
    supabase.from('clientes').select('id, name'),
  ])
  if (sols.error) throw friendly(sols.error, t('requests.api.loadList'))
  const counts = new Map<string, number>()
  for (const r of (unread.data ?? []) as { solicitud_id: string }[]) counts.set(r.solicitud_id, (counts.get(r.solicitud_id) ?? 0) + 1)
  const names = new Map<string, string>()
  for (const c of (clientes.data ?? []) as { id: string; name: string }[]) names.set(c.id, c.name)
  return ((sols.data ?? []) as Solicitud[]).map((s) => ({ ...s, unread_count: counts.get(s.id) ?? 0, cliente_name: s.cliente_id ? (names.get(s.cliente_id) ?? null) : null }))
}

export interface SolicitudDetalle {
  solicitud: Solicitud
  cliente: { id: string; name: string; email: string | null; phone: string | null } | null
  accesos: SolicitudAcceso[]
  mensajes: SolicitudMensaje[]
  documentos: SolicitudDocumento[]
  requisitos: SolicitudRequisito[]
  analisis: SolicitudAnalisis[]
  eventos: SolicitudEvento[]
  template: { fields: { key: string; label: string; type: string; required: boolean }[]; required_documents: { key: string; label: string; required: boolean }[] } | null
}

export async function getSolicitud(id: string): Promise<SolicitudDetalle> {
  const sol = await supabase.from('solicitudes').select('*').eq('id', id).single()
  if (sol.error) throw friendly(sol.error, t('requests.api.loadOne'))
  const s = sol.data as Solicitud
  const [acc, msg, docs, reqs, ana, ev, cli, tpl] = await Promise.all([
    supabase.from('solicitud_accesos').select('id, solicitud_id, expires_at, revoked_at, last_used_at, created_at').eq('solicitud_id', id).order('created_at', { ascending: false }),
    supabase.from('solicitud_mensajes').select('*').eq('solicitud_id', id).order('created_at'),
    supabase.from('solicitud_documentos').select('*').eq('solicitud_id', id).is('deleted_at', null).order('created_at'),
    supabase.from('solicitud_requisitos').select('*').eq('solicitud_id', id).order('requested_at'),
    supabase.from('solicitud_analisis').select('*').eq('solicitud_id', id).order('version', { ascending: false }),
    supabase
      .from('audit_events')
      .select('id, action, result, metadata, user_id, created_at')
      .or(`entity_id.eq.${id},metadata->>solicitud_id.eq.${id}`)
      .order('created_at', { ascending: false })
      .limit(100),
    s.cliente_id ? supabase.from('clientes').select('id, name, email, phone').eq('id', s.cliente_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    s.form_template_id ? supabase.from('intake_form_templates').select('fields, required_documents').eq('id', s.form_template_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ])
  for (const r of [acc, msg, docs, reqs, ana]) if (r.error) throw friendly(r.error, t('requests.api.loadOne'))
  return {
    solicitud: s,
    cliente: (cli.data as SolicitudDetalle['cliente']) ?? null,
    accesos: (acc.data ?? []) as SolicitudAcceso[],
    mensajes: (msg.data ?? []) as SolicitudMensaje[],
    documentos: (docs.data ?? []) as SolicitudDocumento[],
    requisitos: (reqs.data ?? []) as SolicitudRequisito[],
    analisis: (ana.data ?? []) as SolicitudAnalisis[],
    eventos: ((ev.data ?? []) as SolicitudEvento[]).filter((e) => e.action.startsWith('solicitud.')),
    template: (tpl.data as SolicitudDetalle['template']) ?? null,
  }
}

export const crearSolicitud = (input: NuevaSolicitudInput) => rpc<string>('solicitud_crear', { p: input }, t('requests.api.create'))
export const generarEnlace = (id: string, days = 30) => rpc<{ token: string; expires_at: string; access_id: string }>('solicitud_generar_enlace', { p_solicitud: id, p_days: days }, t('requests.api.generateLink'))
export const revocarEnlaces = (id: string) => rpc<number>('solicitud_revocar_enlaces', { p_solicitud: id }, t('requests.api.revokeLinks'))
export const cambiarEstado = (id: string, estado: SolicitudStatus, motivo?: string) => rpc<Solicitud>('solicitud_cambiar_estado', { p_solicitud: id, p_estado: estado, p_motivo: motivo ?? null }, t('requests.api.changeStatus'))
export const solicitarInformacion = (id: string, items: { kind: 'field' | 'document'; key?: string; label: string }[], mensaje?: string) =>
  rpc<string>('solicitud_solicitar_informacion', { p_solicitud: id, p_items: items, p_mensaje: mensaje ?? null }, t('requests.api.requestInfo'))
export const resolverRequisito = (requisitoId: string, estado: 'resolved' | 'waived' | 'pending' = 'resolved') => rpc<void>('solicitud_resolver_requisito', { p_requisito: requisitoId, p_estado: estado }, t('requests.api.updateRequisito'))
export const analizarSolicitud = (id: string) => rpc<SolicitudAnalisis>('solicitud_analizar', { p_solicitud: id }, t('requests.api.analyze'))
export const enviarMensaje = (id: string, body: string) => rpc<string>('solicitud_enviar_mensaje', { p_solicitud: id, p_body: body }, t('requests.api.sendMessage'))
export const marcarLeida = (id: string) => rpc<void>('solicitud_marcar_leida', { p_solicitud: id }, t('requests.api.markRead'))
export const registrarDocumentoEmpresa = (id: string, path: string, name: string, mime: string, size: number, requisitoId?: string | null) =>
  rpc<string>('solicitud_registrar_documento', { p_solicitud: id, p_path: path, p_name: name, p_mime: mime, p_size: size, p_requisito: requisitoId ?? null }, t('requests.api.registerFile'))

export async function listClientes(): Promise<{ id: string; name: string; email: string | null }[]> {
  const { data, error } = await supabase.from('clientes').select('id, name, email').order('name')
  if (error) throw friendly(error, t('requests.api.loadClients'))
  return (data ?? []) as { id: string; name: string; email: string | null }[]
}

export async function listFormTemplates(): Promise<{ id: string; name: string; is_default: boolean }[]> {
  const { data, error } = await supabase.from('intake_form_templates').select('id, name, is_default').eq('is_active', true).order('is_default', { ascending: false })
  if (error) throw friendly(error, t('requests.api.loadTemplates'))
  return (data ?? []) as { id: string; name: string; is_default: boolean }[]
}

/* ------------------------------------------------------------------ */
/* Cliente por token                                                    */
/* ------------------------------------------------------------------ */

export const clienteObtener = (token: string) => rpc<ClienteVista>('solicitud_acceso_obtener', { p_token: token }, t('requests.api.invalidLink'))
export const clienteGuardar = (token: string, data: Record<string, unknown>) => rpc<ClienteVista>('solicitud_acceso_guardar', { p_token: token, p_data: data }, t('requests.api.saveDraft'))
export const clienteEnviar = (token: string, data: Record<string, unknown>) => rpc<ClienteVista>('solicitud_acceso_enviar', { p_token: token, p_data: data }, t('requests.api.submitForm'))
export const clienteMensaje = (token: string, body: string) => rpc<ClienteVista>('solicitud_acceso_mensaje', { p_token: token, p_body: body }, t('requests.api.sendMessage'))
export const clienteRegistrarDocumento = (token: string, path: string, name: string, mime: string, size: number, requisitoId?: string | null) =>
  rpc<ClienteVista>('solicitud_acceso_registrar_documento', { p_token: token, p_path: path, p_name: name, p_mime: mime, p_size: size, p_requisito: requisitoId ?? null }, t('requests.api.registerFile'))
export const clienteMarcarLeido = (token: string) => rpc<void>('solicitud_acceso_marcar_leido', { p_token: token })

/** Nombre de la Edge Function que valida el token en servidor y firma la URL (5 minutos). */
export const DOWNLOAD_FUNCTION = 'solicitud-descarga'

/**
 * Descarga de un documento por el cliente anónimo. La autorización (hash del token, caducidad,
 * revocación, pertenencia y visibilidad del documento) ocurre en servidor; el navegador solo recibe
 * una URL firmada de corta duración. Cualquier fallo devuelve un mensaje neutro.
 */
export async function clienteDescargarDocumento(token: string, documentId: string): Promise<{ url: string; name: string }> {
  const { data, error } = await supabase.functions.invoke<{ url?: string; name?: string; code?: string; error?: string }>(DOWNLOAD_FUNCTION, { body: { token, document_id: documentId } })
  if (error || !data?.url) {
    const status = (error as { context?: { status?: number } } | null)?.context?.status
    // La función responde con un código estable (`download_rate_limited`, `download_invalid`…); el estado HTTP es el respaldo
    const code = await downloadErrorCode(error, data)
    const rateLimited = code === 'download_rate_limited' || status === 429
    throw new SolicitudesApiError(rateLimited ? t('requests.api.downloadRateLimited') : t('requests.api.downloadUnavailable'), code ?? (status ? String(status) : undefined))
  }
  return { url: data.url, name: data.name ?? t('requests.api.defaultFileName') }
}

/* ------------------------------------------------------------------ */
/* Notificaciones                                                       */
/* ------------------------------------------------------------------ */

export async function listNotificaciones(limit = 30): Promise<Notificacion[]> {
  const { data, error } = await supabase.from('notificaciones').select('*').order('created_at', { ascending: false }).limit(limit)
  if (error) throw friendly(error, t('requests.api.loadNotifications'))
  return (data ?? []) as Notificacion[]
}
export const marcarNotificacion = (id: string) => rpc<void>('notificaciones_marcar', { p_id: id })
export const marcarTodasNotificaciones = () => rpc<number>('notificaciones_marcar_todas')

/** Suscripción Realtime a notificaciones nuevas de la empresa; devuelve la función de cancelación. */
export function subscribeNotificaciones(empresaId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`notificaciones:${empresaId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notificaciones', filter: `empresa_id=eq.${empresaId}` }, () => onChange())
    .subscribe()
  return () => {
    void supabase.removeChannel(channel)
  }
}

/**
 * Cambios en una solicitud concreta: cada acción del cliente genera una notificación interna
 * (misma tabla publicada en Realtime), así que basta con escuchar sus notificaciones.
 */
export function subscribeSolicitud(solicitudId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`solicitud:${solicitudId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificaciones', filter: `solicitud_id=eq.${solicitudId}` }, () => onChange())
    .subscribe()
  return () => {
    void supabase.removeChannel(channel)
  }
}
