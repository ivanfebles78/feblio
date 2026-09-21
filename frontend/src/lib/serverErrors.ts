// Feblio · traduce respuestas `{ ok: false, code, error }` de RPC/Edge Functions por su código estable.
// El servidor devuelve `code` (p. ej. `otp_expired`) y un `error` en español por compatibilidad; aquí se
// muestra la traducción del código en el idioma de la interfaz y, si el código no está en el catálogo,
// el mensaje del servidor o el texto de respaldo. Nunca se muestra la clave técnica.
import i18n, { t } from '../i18n'

export interface ServerResult {
  ok?: boolean
  code?: string
  error?: string
}

const CODE_RE = /^[a-z_]{3,40}$/

/** Mensaje localizado para una respuesta de error del servidor bajo el prefijo de catálogo indicado. */
export function serverErrorMessage(res: ServerResult | null | undefined, prefix: string, fallback: string): string {
  const code = typeof res?.code === 'string' && CODE_RE.test(res.code) ? res.code : null
  if (code && i18n.exists(`${prefix}.${code}`)) return t(`${prefix}.${code}`)
  return (typeof res?.error === 'string' && res.error.trim()) || fallback
}
