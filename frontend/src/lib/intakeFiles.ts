/**
 * Adjuntos del formulario público (bucket privado `intake-files`).
 * Los enlaces se generan bajo demanda como URLs firmadas con caducidad corta.
 * Solo la empresa dueña del formulario (o admin) supera la política RLS del bucket.
 */
import { supabase } from './supabase'

export const INTAKE_BUCKET = 'intake-files'
export const SIGNED_URL_TTL_SECONDS = 600

export interface IntakeFileRef {
  name: string
  /** Ruta dentro del bucket (formato actual) */
  path?: string
  /** URL pública heredada de cuando el bucket era público */
  url?: string
}

/** Extrae la ruta de una URL pública heredada de `intake-files`. */
export function legacyPublicUrlToPath(url: string): string | null {
  const m = url.match(/\/storage\/v1\/object\/public\/intake-files\/(.+)$/)
  return m ? decodeURIComponent(m[1]) : null
}

export function intakeFilePath(f: IntakeFileRef): string | null {
  if (f.path) return f.path
  if (f.url) return legacyPublicUrlToPath(f.url)
  return null
}

export async function createIntakeSignedUrl(path: string, ttl = SIGNED_URL_TTL_SECONDS): Promise<{ url: string | null; error: string | null }> {
  const { data, error } = await supabase.storage.from(INTAKE_BUCKET).createSignedUrl(path, ttl)
  if (error) return { url: null, error: error.message }
  return { url: data.signedUrl, error: null }
}
