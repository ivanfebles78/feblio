import { supabase } from '../supabase'

/**
 * Archivos de solicitudes en el bucket privado `intake-files`.
 *   · cliente (por token):  sol/{access_id}/{uuid}.{ext}
 *   · empresa:              emp/{empresa_id}/{solicitud_id}/{uuid}.{ext}
 * El nombre físico nunca lo elige el usuario; el original se guarda como metadato.
 * Límites (también validados en servidor por sol_validar_archivo). Antivirus: mejora posterior.
 */
export const SOLICITUD_FILES_BUCKET = 'intake-files'
export const MAX_FILE_BYTES = 10 * 1024 * 1024
export const ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'png', 'jpg', 'jpeg'] as const
export const ALLOWED_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
}
export const ACCEPT_ATTR = '.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg'

export function fileExtension(name: string): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(name)
  return m ? m[1].toLowerCase() : ''
}

export interface FileCheck {
  ok: boolean
  message?: string
  ext: string
  mime: string
}

/** Valida extensión, MIME (declarado por el navegador; se normaliza al de la extensión) y tamaño. */
export function checkFile(file: { name: string; size: number; type: string }): FileCheck {
  const ext = fileExtension(file.name)
  const expectedMime = ALLOWED_MIME[ext]
  if (!expectedMime) return { ok: false, message: 'Tipo de archivo no permitido. Usa PDF, Word, Excel, PNG o JPG.', ext, mime: file.type }
  const declared = (file.type || '').toLowerCase()
  if (declared && declared !== expectedMime && !(ext === 'jpg' && declared === 'image/jpg')) {
    return { ok: false, message: 'El contenido del archivo no coincide con su extensión.', ext, mime: declared }
  }
  if (file.size <= 0) return { ok: false, message: 'El archivo está vacío.', ext, mime: expectedMime }
  if (file.size > MAX_FILE_BYTES) return { ok: false, message: 'El archivo supera el tamaño máximo (10 MB).', ext, mime: expectedMime }
  return { ok: true, ext, mime: expectedMime }
}

export function randomStorageName(ext: string): string {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `${id}.${ext}`
}

export const clientObjectPath = (accessId: string, ext: string) => `sol/${accessId}/${randomStorageName(ext)}`
export const empresaObjectPath = (empresaId: string, solicitudId: string, ext: string) => `emp/${empresaId}/${solicitudId}/${randomStorageName(ext)}`

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** Sube el archivo al bucket privado. Devuelve la ruta almacenada. */
export async function uploadSolicitudFile(path: string, file: File, mime: string): Promise<string> {
  const { error } = await supabase.storage.from(SOLICITUD_FILES_BUCKET).upload(path, file, { contentType: mime, upsert: false })
  if (error) throw new Error(/row-level security|permission|policy/i.test(error.message) ? 'No tienes permiso para subir este archivo.' : error.message)
  return path
}

/** URL firmada de corta duración (solo usuarios autenticados con acceso al objeto). */
export async function signedUrl(path: string, seconds = 300): Promise<string> {
  const { data, error } = await supabase.storage.from(SOLICITUD_FILES_BUCKET).createSignedUrl(path, seconds)
  if (error || !data?.signedUrl) throw new Error('No se pudo generar el enlace de descarga.')
  return data.signedUrl
}
