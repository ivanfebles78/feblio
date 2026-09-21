import { useState } from 'react'
import { ChevronDown, ChevronRight, RefreshCw, Unplug, PlugZap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ConnectionStatus, ConnectionTestResult } from '../../components/onboarding/ConnectionStatus'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { useOnboarding } from '../../lib/onboarding/OnboardingContext'
import { useIntegration } from '../../lib/integrations/useIntegration'
import { KIND_LABEL, adapterById } from '../../lib/integrations/adapters'
import type { IntegrationConnection, IntegrationKind } from '../../lib/onboarding/types'
import { STEP_REGISTRY } from '../../pages/onboarding/registry'
import type { OnboardingStepKey } from '../../lib/onboarding/types'
import { formatDateTime } from '../../lib/intl'

const KIND_TO_STEP: Partial<Record<IntegrationKind, OnboardingStepKey>> = {
  document_repository: 'repository',
  email: 'email',
  whatsapp: 'whatsapp',
  sms: 'sms',
  voice: 'voice',
  payments: 'billing',
}

function fmt(iso: string | null) {
  return iso ? formatDateTime(iso) : '—'
}

/** Panel permanente: Configuración → Canales e integraciones. */
export function IntegrationsSettings() {
  const { t } = useTranslation()
  const ctx = useOnboarding()
  const [open, setOpen] = useState<IntegrationKind | null>(null)
  if (!ctx.snapshot) return null
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">{t('settings.integrations.intro')}</p>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">{t('settings.integrations.columns.channel')}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t('settings.integrations.columns.status')}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t('settings.integrations.columns.account')}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t('settings.integrations.columns.lastActivity')}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t('settings.integrations.columns.lastTest')}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t('settings.integrations.columns.lastError')}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t('settings.integrations.columns.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {ctx.snapshot.integrations.map((c) => (
              <IntegrationRow key={c.kind} connection={c} open={open === c.kind} onToggle={() => setOpen(open === c.kind ? null : c.kind)} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function IntegrationRow({ connection: c, open, onToggle }: { connection: IntegrationConnection; open: boolean; onToggle: () => void }) {
  const { t } = useTranslation()
  const ctx = useOnboarding()
  const actions = useIntegration(c.kind)
  const adapter = adapterById(c.provider)
  const [confirm, setConfirm] = useState(false)
  const stepKey = KIND_TO_STEP[c.kind]
  const entry = stepKey ? STEP_REGISTRY[stepKey] : null
  const canTest = ['connected', 'degraded', 'expired', 'error'].includes(c.status)
  const canDisconnect = !['not_configured', 'disconnected'].includes(c.status)
  const canReconnect = ['disconnected', 'expired', 'error', 'pending_credentials'].includes(c.status) && adapter?.mode === 'oauth'

  return (
    <>
      <tr>
        <th scope="row" className="px-3 py-2.5 text-left font-medium text-slate-800">
          {KIND_LABEL[c.kind]}
          {adapter && <span className="block text-[11px] font-normal text-slate-400">{adapter.label}</span>}
        </th>
        <td className="px-3 py-2.5"><ConnectionStatus status={c.status} /></td>
        <td className="max-w-[160px] truncate px-3 py-2.5 text-xs text-slate-600" title={c.account_identifier ?? undefined}>{c.account_identifier ?? '—'}</td>
        <td className="px-3 py-2.5 text-xs text-slate-600">{fmt(c.last_activity_at)}</td>
        <td className="px-3 py-2.5 text-xs text-slate-600">
          {fmt(c.last_test_at)}
          {c.last_test_ok === false && <span className="ml-1 text-red-600">{t('settings.integrations.testFailed')}</span>}
        </td>
        <td className="max-w-[180px] truncate px-3 py-2.5 text-xs text-red-700" title={c.last_error ?? undefined}>{c.last_error ?? '—'}</td>
        <td className="px-3 py-2.5">
          <div className="flex flex-wrap gap-1">
            <button type="button" onClick={onToggle} aria-expanded={open} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
              {open ? <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />} {t('settings.integrations.manage')}
            </button>
            {canTest && (
              <button type="button" onClick={() => actions.test()} disabled={actions.busy !== null} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                <RefreshCw className={`h-3.5 w-3.5 ${actions.busy === 'test' ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" /> {t('settings.integrations.test')}
              </button>
            )}
            {canReconnect && c.provider && (
              <button type="button" onClick={() => actions.connectOAuth(c.provider!, c.settings, '/empresa?settings=integrations')} disabled={actions.busy !== null} className="inline-flex items-center gap-1 rounded-lg border border-brand-200 bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100">
                <PlugZap className="h-3.5 w-3.5" aria-hidden="true" /> {t('settings.integrations.reconnect')}
              </button>
            )}
            {canDisconnect && (
              <button type="button" onClick={() => setConfirm(true)} disabled={actions.busy !== null} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50">
                <Unplug className="h-3.5 w-3.5" aria-hidden="true" /> {t('settings.integrations.disconnect')}
              </button>
            )}
          </div>
          <ConnectionTestResult result={actions.result} />
        </td>
      </tr>
      {open && entry && (
        <tr>
          <td colSpan={7} className="bg-slate-50/60 px-4 py-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="mb-3 text-xs text-slate-500">{t('settings.integrations.fullConfig')}</p>
              <entry.Component mode="settings" errors={entry.validate(ctx)} showErrors={false} />
            </div>
          </td>
        </tr>
      )}
      <ConfirmDialog open={confirm} title={t('settings.integrations.disconnectTitle', { channel: KIND_LABEL[c.kind] })} tone="danger" confirmLabel={t('settings.integrations.disconnect')} onConfirm={async () => { setConfirm(false); await actions.disconnect() }} onCancel={() => setConfirm(false)}>
        {t('settings.integrations.disconnectBody')}
      </ConfirmDialog>
    </>
  )
}
