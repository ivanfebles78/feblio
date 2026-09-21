/**
 * Parámetros de autenticación que Supabase añade a la URL al volver de un enlace
 * (confirmación, recuperación de contraseña, cambio de email). Se capturan ANTES de
 * crear el cliente de Supabase, porque supabase-js los procesa y limpia la URL.
 *
 * Formatos posibles:
 *   #access_token=…&type=recovery                      (flujo implícito, éxito)
 *   #error=access_denied&error_code=otp_expired&error_description=…  (enlace caducado)
 *   ?error=…&error_code=…                             (algunas variantes PKCE)
 */
import { t } from '../i18n'

export interface UrlAuthParams {
  type: string | null
  error: string | null
  errorCode: string | null
  errorDescription: string | null
}

export function parseAuthParams(url: { hash: string; search: string }): UrlAuthParams {
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
  const query = new URLSearchParams(url.search)
  const get = (k: string) => hash.get(k) ?? query.get(k)
  return {
    type: get('type'),
    error: get('error'),
    errorCode: get('error_code'),
    errorDescription: get('error_description'),
  }
}

/** Mensaje (en el idioma de la interfaz) para un enlace de autenticación fallido. */
export function describeAuthLinkError(p: Pick<UrlAuthParams, 'error' | 'errorCode' | 'errorDescription'>): string | null {
  if (!p.error && !p.errorCode) return null
  const code = (p.errorCode ?? '').toLowerCase()
  const desc = (p.errorDescription ?? '').toLowerCase()
  if (code === 'otp_expired' || desc.includes('expired')) return t('auth.linkErrors.expired')
  if (code === 'access_denied' || (p.error ?? '').toLowerCase() === 'access_denied' || desc.includes('invalid')) return t('auth.linkErrors.invalid')
  return t('auth.linkErrors.generic')
}

export const INITIAL_AUTH_PARAMS: UrlAuthParams =
  typeof window !== 'undefined' ? parseAuthParams(window.location) : { type: null, error: null, errorCode: null, errorDescription: null }
