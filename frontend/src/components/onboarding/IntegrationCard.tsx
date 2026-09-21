import { useState, type ReactNode } from 'react'
import { Link2, PlugZap, RefreshCw, ShieldAlert, Unplug } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatDateTime } from '../../lib/intl'
import { ConnectionStatus, ConnectionTestResult } from './ConnectionStatus'
import { ConfirmDialog } from '../ConfirmDialog'
import type { AdapterDescriptor } from '../../lib/integrations/adapters'
import type { IntegrationActions } from '../../lib/integrations/useIntegration'

interface IntegrationCardProps {
  adapter: AdapterDescriptor
  actions: IntegrationActions
  /** Ajustes que se guardan junto con la conexión (sin secretos) */
  settings: Record<string, unknown>
  /** Ruta a la que volver tras OAuth */
  returnTo: string
  /** Contenido adicional (campos de credenciales, selección de carpeta…) */
  children?: ReactNode
  /** Se llama cuando la conexión cambia (para completar pasos, etc.) */
  onChanged?: () => void
}

function fmt(iso: string | null | undefined) {
  return iso ? formatDateTime(iso) : '—'
}

/**
 * Tarjeta de integración: estado, cuenta, última prueba, último error y
 * acciones (conectar / probar / desconectar / reconectar).
 * Nunca muestra "Conectado" sin una prueba real registrada por el servidor.
 */
export function IntegrationCard({ adapter, actions, settings, returnTo, children, onChanged }: IntegrationCardProps) {
  const { t } = useTranslation()
  const { connection, busy, result } = actions
  const isThisProvider = connection?.provider === adapter.id
  const status = isThisProvider ? connection!.status : 'not_configured'
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)

  async function connect() {
    if (adapter.mode === 'oauth') {
      await actions.connectOAuth(adapter.id, settings, returnTo)
    } else if (adapter.mode === 'internal' || adapter.mode === 'manual') {
      // Solo el almacenamiento interno y el registro manual pueden marcarse conectados sin servidor;
      // la dirección de entrada de Feblio se verifica en la Edge Function (necesita RESEND_API_KEY).
      const direct = adapter.id === 'feblio_storage' || adapter.mode === 'manual'
      const ok = await actions.configure(adapter.id, direct ? 'connected' : 'not_configured', settings)
      if (ok) {
        await actions.test(adapter.id)
        onChanged?.()
      }
    }
  }

  async function disconnect() {
    setConfirmDisconnect(false)
    await actions.disconnect()
    onChanged?.()
  }

  const showConnect = !isThisProvider || status === 'not_configured' || status === 'disconnected' || status === 'pending_credentials'
  const canTest = isThisProvider && ['connected', 'degraded', 'expired', 'error'].includes(status)
  const canDisconnect = isThisProvider && status !== 'not_configured' && status !== 'disconnected'

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-labelledby={`int-${adapter.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id={`int-${adapter.id}`} className="text-sm font-semibold text-slate-800">
            {adapter.label}
          </h3>
          <p className="text-xs text-slate-500">{adapter.description}</p>
        </div>
        <ConnectionStatus status={status} />
      </div>

      {isThisProvider && (
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-500 sm:grid-cols-4">
          <div>
            <dt className="font-medium text-slate-400">{t('onboarding.integrationCard.account')}</dt>
            <dd className="truncate text-slate-700">{connection?.account_identifier ?? '—'}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-400">{t('onboarding.integrationCard.lastActivity')}</dt>
            <dd className="text-slate-700">{fmt(connection?.last_activity_at)}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-400">{t('onboarding.integrationCard.lastTest')}</dt>
            <dd className="text-slate-700">
              {fmt(connection?.last_test_at)}
              {connection?.last_test_ok === false && t('onboarding.integrationCard.failedSuffix')}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate-400">{t('onboarding.integrationCard.lastError')}</dt>
            <dd className="truncate text-slate-700" title={connection?.last_error ?? undefined}>
              {connection?.last_error ?? '—'}
            </dd>
          </div>
        </dl>
      )}

      {status === 'pending_credentials' && (
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800" role="note">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">{t('onboarding.integrationCard.adminRequired')}</p>
            <p>
              {t('onboarding.integrationCard.missingVarsBefore')} <code className="rounded bg-white/70 px-1">{adapter.requiredEnv.join(', ')}</code>
              {t('onboarding.integrationCard.missingVarsAfter')}
            </p>
          </div>
        </div>
      )}

      {children && <div className="mt-3">{children}</div>}

      <div className="mt-3 flex flex-wrap gap-2">
        {showConnect && adapter.mode !== 'credentials' && (
          <button type="button" onClick={connect} disabled={busy !== null} className="btn-primary !px-3 !py-2 text-xs">
            {busy === 'oauth' || busy === 'configure' ? (
              t('common.actions.oneMoment')
            ) : (
              <>
                <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                {status === 'disconnected' ? t('onboarding.integrationCard.reconnect') : status === 'pending_credentials' ? t('onboarding.integrationCard.retryConnection') : t('onboarding.integrationCard.connect')}
              </>
            )}
          </button>
        )}
        {canTest && (
          <button
            type="button"
            onClick={async () => {
              await actions.test()
              onChanged?.()
            }}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${busy === 'test' ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
            {busy === 'test' ? t('onboarding.integrationCard.testing') : t('onboarding.integrationCard.testConnection')}
          </button>
        )}
        {isThisProvider && (status === 'expired' || status === 'error' || status === 'degraded') && adapter.mode === 'oauth' && (
          <button type="button" onClick={connect} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-100">
            <PlugZap className="h-3.5 w-3.5" aria-hidden="true" /> {t('onboarding.integrationCard.reconnect')}
          </button>
        )}
        {canDisconnect && (
          <button
            type="button"
            onClick={() => setConfirmDisconnect(true)}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:opacity-60"
          >
            <Unplug className="h-3.5 w-3.5" aria-hidden="true" /> {t('onboarding.integrationCard.disconnect')}
          </button>
        )}
      </div>

      {isThisProvider && <ConnectionTestResult result={result} />}

      <ConfirmDialog
        open={confirmDisconnect}
        title={t('onboarding.integrationCard.disconnectTitle', { adapter: adapter.label })}
        tone="danger"
        confirmLabel={t('onboarding.integrationCard.disconnect')}
        onConfirm={disconnect}
        onCancel={() => setConfirmDisconnect(false)}
      >
        {t('onboarding.integrationCard.disconnectBody')}
      </ConfirmDialog>
    </section>
  )
}
