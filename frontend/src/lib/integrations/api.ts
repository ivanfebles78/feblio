/**
 * Cliente de la Edge Function `integrations`. Todas las operaciones que tocan
 * proveedores externos (OAuth, pruebas, envíos, desconexión) pasan por aquí.
 *
 * La función nunca devuelve tokens ni secretos; el frontend solo recibe
 * estados y resultados. Cuando faltan variables de entorno en el servidor, la
 * respuesta es `{ ok: false, code: 'pending_credentials', missing: [...] }`.
 */
import { supabase } from '../supabase'
import type { IntegrationConnection, IntegrationKind } from '../onboarding/types'

export type IntegrationAction =
  | 'start_oauth'
  | 'test'
  | 'health'
  | 'disconnect'
  | 'send_test'
  | 'store_credentials'
  | 'create_folder'
  | 'list_folders'

export interface IntegrationResponse {
  ok: boolean
  code?: 'pending_credentials' | 'not_connected' | 'provider_error' | 'invalid' | 'unauthorized' | 'unsupported' | 'timeout' | 'rate_limited'
  message?: string
  missing?: string[]
  url?: string
  connection?: IntegrationConnection
  details?: Record<string, unknown>
  folders?: { id: string; name: string }[]
}

export interface IntegrationRequest {
  action: IntegrationAction
  kind: IntegrationKind
  provider?: string
  /** Credenciales introducidas por la empresa; viajan por HTTPS y se cifran en el servidor. */
  credentials?: Record<string, string>
  payload?: Record<string, unknown>
  /** Vuelta tras OAuth (ruta interna de la app) */
  returnTo?: string
}

const TIMEOUT_MS = 25_000

export async function callIntegrations(req: IntegrationRequest): Promise<IntegrationResponse> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const { data, error } = await supabase.functions.invoke<IntegrationResponse>('integrations', {
      body: req,
      signal: controller.signal,
    })
    if (error) {
      // FunctionsHttpError incluye el body JSON con el motivo real cuando el status no es 2xx
      const ctx = (error as { context?: Response }).context
      if (ctx && typeof ctx.json === 'function') {
        try {
          const body = (await ctx.json()) as IntegrationResponse
          if (body && typeof body.ok === 'boolean') return body
        } catch {
          /* body no JSON: cae al mensaje genérico */
        }
      }
      if (/not found|404/i.test(error.message)) {
        return {
          ok: false,
          code: 'unsupported',
          message: 'La Edge Function "integrations" no está desplegada. Consulta DEPLOY.md.',
        }
      }
      return { ok: false, code: 'provider_error', message: error.message }
    }
    return data ?? { ok: false, code: 'provider_error', message: 'Respuesta vacía del servidor.' }
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return { ok: false, code: 'timeout', message: 'La operación tardó demasiado. Inténtalo de nuevo.' }
    }
    return { ok: false, code: 'provider_error', message: e instanceof Error ? e.message : 'Error desconocido.' }
  } finally {
    clearTimeout(timer)
  }
}

export const startOAuth = (kind: IntegrationKind, provider: string, returnTo: string) =>
  callIntegrations({ action: 'start_oauth', kind, provider, returnTo })

export const testIntegration = (kind: IntegrationKind) => callIntegrations({ action: 'test', kind })

export const checkHealth = (kind: IntegrationKind) => callIntegrations({ action: 'health', kind })

export const disconnectIntegration = (kind: IntegrationKind) => callIntegrations({ action: 'disconnect', kind })

export const sendTestMessage = (kind: IntegrationKind, payload: Record<string, unknown>) =>
  callIntegrations({ action: 'send_test', kind, payload })

export const storeCredentials = (kind: IntegrationKind, provider: string, credentials: Record<string, string>, payload?: Record<string, unknown>) =>
  callIntegrations({ action: 'store_credentials', kind, provider, credentials, payload })

export const createRemoteFolder = (kind: IntegrationKind, payload: { path: string[]; parent?: string }) =>
  callIntegrations({ action: 'create_folder', kind, payload })

export const listRemoteFolders = (kind: IntegrationKind, parent?: string) =>
  callIntegrations({ action: 'list_folders', kind, payload: { parent } })
