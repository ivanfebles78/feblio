/**
 * Acciones de una integración (por kind) con estado de UI: ocupado, resultado
 * de la última prueba, y actualización del snapshot del onboarding.
 */
import { useCallback, useMemo, useState } from 'react'
import { useOnboarding } from '../onboarding/OnboardingContext'
import * as onboardingApi from '../onboarding/api'
import * as api from './api'
import { adapterById } from './adapters'
import type { HealthCheckResult, IntegrationConnection, IntegrationKind } from '../onboarding/types'
import { rememberOAuthReturn } from '../../pages/OAuthCallback'

function toResult(res: api.IntegrationResponse, fallbackOk: string, fallbackErr: string): HealthCheckResult {
  return {
    ok: res.ok,
    message: res.message ?? (res.ok ? fallbackOk : fallbackErr),
    details: res.details,
    checkedAt: new Date().toISOString(),
  }
}

export function useIntegration(kind: IntegrationKind) {
  const { snapshot, runAction, patchSnapshot } = useOnboarding()
  const [busy, setBusy] = useState<string | null>(null)
  const [result, setResult] = useState<HealthCheckResult | null>(null)

  const connection = useMemo(() => snapshot?.integrations.find((i) => i.kind === kind) ?? null, [snapshot, kind])
  const adapter = adapterById(connection?.provider)
  const empresaId = snapshot?.empresa.id ?? ''

  const applyConnection = useCallback(
    (c?: IntegrationConnection) => {
      if (!c) return
      patchSnapshot((s) => ({ ...s, integrations: s.integrations.map((i) => (i.kind === kind ? c : i)) }))
    },
    [patchSnapshot, kind],
  )

  /** Guarda proveedor + ajustes sin conexión externa (estado limitado por el servidor). */
  const configure = useCallback(
    async (provider: string, status: 'not_configured' | 'pending_credentials' | 'disconnected' | 'connected', settings: Record<string, unknown>, accountIdentifier?: string, displayName?: string) => {
      setBusy('configure')
      const ok = await runAction(() => onboardingApi.upsertIntegration(kind, provider, status, settings, accountIdentifier, displayName))
      setBusy(null)
      return ok
    },
    [kind, runAction],
  )

  /** Inicia OAuth: la Edge Function devuelve la URL o pending_credentials si faltan variables. */
  const connectOAuth = useCallback(
    async (provider: string, settings: Record<string, unknown>, returnTo: string) => {
      setBusy('oauth')
      setResult(null)
      await onboardingApi.upsertIntegration(kind, provider, 'not_configured', settings).catch(() => undefined)
      const res = await api.startOAuth(kind, provider, returnTo)
      if (res.ok && res.url) {
        rememberOAuthReturn(returnTo)
        window.location.assign(res.url)
        return true
      }
      if (res.ok) {
        // Proveedores sin redirección (p. ej. Stripe con cuenta de plataforma): ya verificado en servidor
        applyConnection(res.connection)
        await runAction(async () => undefined)
        setResult(toResult(res, 'Conexión verificada.', 'No se pudo conectar.'))
        setBusy(null)
        return true
      }
      if (res.code === 'pending_credentials') {
        await runAction(() => onboardingApi.upsertIntegration(kind, provider, 'pending_credentials', settings))
        setResult({ ok: false, message: res.message ?? 'Requiere configuración del administrador de Feblio.', details: res.missing ? { faltan: res.missing.join(', ') } : undefined, checkedAt: new Date().toISOString() })
      } else {
        setResult(toResult(res, 'Redirigiendo…', 'No se pudo iniciar la conexión.'))
      }
      setBusy(null)
      return false
    },
    [kind, runAction, applyConnection],
  )

  /** Envía credenciales al servidor (se cifran allí) y ejecuta una prueba real. */
  const storeCredentials = useCallback(
    async (provider: string, credentials: Record<string, string>, settings: Record<string, unknown>) => {
      setBusy('credentials')
      setResult(null)
      await onboardingApi.upsertIntegration(kind, provider, 'not_configured', settings).catch(() => undefined)
      const res = await api.storeCredentials(kind, provider, credentials, settings)
      if (res.code === 'pending_credentials') {
        await runAction(() => onboardingApi.upsertIntegration(kind, provider, 'pending_credentials', settings))
      } else {
        applyConnection(res.connection)
        await runAction(async () => undefined)
      }
      setResult(toResult(res, 'Credenciales guardadas y conexión verificada.', 'No se pudieron verificar las credenciales.'))
      setBusy(null)
      return res.ok
    },
    [kind, runAction, applyConnection],
  )

  /** Prueba real. Proveedores internos se prueban en cliente (Storage) o vía RPC; externos en Edge Function. */
  const test = useCallback(async (providerOverride?: string) => {
    setBusy('test')
    setResult(null)
    // El proveedor puede acabar de cambiar (configure → test en el mismo manejador): admite override
    const provider = providerOverride ?? connection?.provider ?? null
    let r: HealthCheckResult
    if (provider === 'feblio_storage') {
      const t = await onboardingApi.testInternalStorage(empresaId)
      await runAction(() => onboardingApi.recordInternalHealthCheck(kind, t.ok, t.ok ? { bucket: onboardingApi.INTERNAL_BUCKET } : { error: t.error }))
      r = { ok: t.ok, message: t.ok ? 'Lectura y escritura verificadas en el almacenamiento interno.' : `Fallo de almacenamiento: ${t.error}`, checkedAt: new Date().toISOString() }
    } else if (provider === 'manual_log' || provider === 'manual') {
      await runAction(() => onboardingApi.recordInternalHealthCheck(kind, true, { provider }))
      r = { ok: true, message: 'Registro manual verificado: no requiere conexión externa.', checkedAt: new Date().toISOString() }
    } else {
      // Proveedores externos y la dirección de entrada de Feblio (requiere RESEND_API_KEY) se prueban en el servidor
      const res = await api.testIntegration(kind)
      applyConnection(res.connection)
      await runAction(async () => undefined)
      r = toResult(res, 'Conexión verificada.', 'La prueba de conexión falló.')
      if (res.code === 'pending_credentials' && res.missing) r.details = { faltan: res.missing.join(', ') }
    }
    setResult(r)
    setBusy(null)
    return r.ok
  }, [connection, empresaId, kind, runAction, applyConnection])

  const disconnect = useCallback(async () => {
    setBusy('disconnect')
    setResult(null)
    const provider = connection?.provider ?? ''
    if (adapter?.mode === 'oauth' || adapter?.mode === 'credentials') {
      const res = await api.disconnectIntegration(kind)
      if (!res.ok && res.code !== 'unsupported' && res.code !== 'not_connected') {
        setResult(toResult(res, 'Desconectado.', 'No se pudo desconectar en el proveedor; la conexión se marcará como desconectada.'))
      }
    }
    const ok = await runAction(() => onboardingApi.upsertIntegration(kind, provider, 'disconnected', connection?.settings ?? {}))
    setBusy(null)
    return ok
  }, [adapter, connection, kind, runAction])

  const sendTest = useCallback(
    async (payload: Record<string, unknown>) => {
      setBusy('send_test')
      setResult(null)
      const res = await api.sendTestMessage(kind, payload)
      const r = toResult(res, 'Mensaje de prueba enviado.', 'No se pudo enviar el mensaje de prueba.')
      setResult(r)
      await runAction(async () => undefined)
      setBusy(null)
      return r.ok
    },
    [kind, runAction],
  )

  return { connection, adapter, busy, result, setResult, configure, connectOAuth, storeCredentials, test, disconnect, sendTest }
}

export type IntegrationActions = ReturnType<typeof useIntegration>
