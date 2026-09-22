import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Building2, CreditCard, FileText, PlugZap, RotateCcw, Tags, Workflow, type LucideIcon } from 'lucide-react'
import { SectionCard } from '../../components/ui'
import { AutoSaveStatus } from '../../components/onboarding/AutoSaveStatus'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { LoadingScreen, ErrorScreen } from '../../components/LoadingScreen'
import { OnboardingProvider, useOnboarding } from '../../lib/onboarding/OnboardingContext'
import { reopenOnboarding } from '../../lib/onboarding/api'
import { STEP_REGISTRY } from '../../pages/onboarding/registry'
import { IntegrationsSettings } from './IntegrationsSettings'
import { ONBOARDING_BASE } from '../../lib/routing'

import { settingsTabLabelKey, type SettingsTab } from './settingsTabs'

/** Pestañas: el nombre se resuelve con t(settingsTabLabelKey(key)) al renderizar. */
const TABS: { key: SettingsTab; icon: LucideIcon }[] = [
  { key: 'empresa', icon: Building2 },
  { key: 'integrations', icon: PlugZap },
  { key: 'billing', icon: CreditCard },
  { key: 'automation', icon: Workflow },
  { key: 'forms', icon: FileText },
  { key: 'services', icon: Tags },
  { key: 'reopen', icon: RotateCcw },
]

/** Configuración permanente del dashboard de empresa (reutiliza los pasos del wizard en modo "settings"). */
export default function SettingsSection({ initialTab = 'empresa' }: { initialTab?: SettingsTab }) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<SettingsTab>(initialTab)
  return (
    <OnboardingProvider>
      <div className="space-y-6">
        <div className="surface flex flex-wrap gap-2 p-2" role="tablist" aria-label={t('settings.tablist')}>
          {TABS.map((item) => {
            const on = item.key === tab
            return (
              <button
                key={item.key}
                role="tab"
                id={`settings-tab-${item.key}`}
                aria-selected={on}
                aria-controls={`settings-panel-${item.key}`}
                onClick={() => setTab(item.key)}
                className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
                  on ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <item.icon className="h-4 w-4" aria-hidden="true" />
                {t(settingsTabLabelKey(item.key))}
              </button>
            )
          })}
        </div>
        <div role="tabpanel" id={`settings-panel-${tab}`} aria-labelledby={`settings-tab-${tab}`}>
          <SettingsPanel tab={tab} />
        </div>
      </div>
    </OnboardingProvider>
  )
}

function SettingsPanel({ tab }: { tab: SettingsTab }) {
  const { t } = useTranslation()
  const ctx = useOnboarding()
  const navigate = useNavigate()
  const [confirmReopen, setConfirmReopen] = useState(false)
  const [busy, setBusy] = useState(false)

  if (ctx.loading) return <LoadingScreen text={t('settings.loading')} />
  if (ctx.error || !ctx.snapshot) return <ErrorScreen message={ctx.error ?? t('settings.noData')} onRetry={ctx.reload} />

  const status = <AutoSaveStatus state={ctx.saveState} error={ctx.saveError} lastSavedAt={ctx.lastSavedAt} dirty={ctx.dirty} onRetry={ctx.retry} />

  async function reopen() {
    setConfirmReopen(false)
    setBusy(true)
    try {
      await ctx.flush()
      await reopenOnboarding()
      navigate(ONBOARDING_BASE)
    } finally {
      setBusy(false)
    }
  }

  if (tab === 'reopen') {
    return (
      <SectionCard title={t('settings.tabs.reopen')}>
        <p className="text-sm text-slate-600">{t('settings.reopen.body')}</p>
        <button type="button" onClick={() => setConfirmReopen(true)} disabled={busy} className="btn-primary mt-4 !py-2.5 text-sm">
          <RotateCcw className="h-4 w-4" aria-hidden="true" /> {t('settings.reopen.action')}
        </button>
        <ConfirmDialog open={confirmReopen} title={t('settings.reopen.confirmTitle')} confirmLabel={t('settings.reopen.confirmAction')} busy={busy} onConfirm={reopen} onCancel={() => setConfirmReopen(false)}>
          {t('settings.reopen.confirmBody')}
        </ConfirmDialog>
      </SectionCard>
    )
  }

  if (tab === 'integrations') {
    return (
      <SectionCard title={t('settings.tabs.integrations')} action={status}>
        <IntegrationsSettings />
      </SectionCard>
    )
  }

  const map = { empresa: 'company', billing: 'billing', automation: 'automation', forms: 'forms', services: 'services' } as const
  const entry = STEP_REGISTRY[map[tab]]
  return (
    <SectionCard title={t(settingsTabLabelKey(tab))} action={status}>
      <entry.Component mode="settings" errors={entry.validate(ctx)} showErrors />
    </SectionCard>
  )
}
