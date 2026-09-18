import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, CreditCard, FileText, PlugZap, RotateCcw, Workflow, type LucideIcon } from 'lucide-react'
import { SectionCard } from '../../components/ui'
import { AutoSaveStatus } from '../../components/onboarding/AutoSaveStatus'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { LoadingScreen, ErrorScreen } from '../../components/LoadingScreen'
import { OnboardingProvider, useOnboarding } from '../../lib/onboarding/OnboardingContext'
import { reopenOnboarding } from '../../lib/onboarding/api'
import { STEP_REGISTRY } from '../../pages/onboarding/registry'
import { IntegrationsSettings } from './IntegrationsSettings'
import { ONBOARDING_BASE } from '../../lib/routing'

import { type SettingsTab } from './settingsTabs'

const TABS: { key: SettingsTab; label: string; icon: LucideIcon }[] = [
  { key: 'empresa', label: 'Datos de empresa', icon: Building2 },
  { key: 'integrations', label: 'Canales e integraciones', icon: PlugZap },
  { key: 'billing', label: 'Facturación y pagos', icon: CreditCard },
  { key: 'automation', label: 'Automatizaciones', icon: Workflow },
  { key: 'forms', label: 'Formularios', icon: FileText },
  { key: 'reopen', label: 'Reabrir configuración inicial', icon: RotateCcw },
]

/** Configuración permanente del dashboard de empresa (reutiliza los pasos del wizard en modo "settings"). */
export default function SettingsSection({ initialTab = 'empresa' }: { initialTab?: SettingsTab }) {
  const [tab, setTab] = useState<SettingsTab>(initialTab)
  return (
    <OnboardingProvider>
      <div className="space-y-6">
        <div className="surface flex flex-wrap gap-2 p-2" role="tablist" aria-label="Secciones de configuración">
          {TABS.map((t) => {
            const on = t.key === tab
            return (
              <button
                key={t.key}
                role="tab"
                id={`settings-tab-${t.key}`}
                aria-selected={on}
                aria-controls={`settings-panel-${t.key}`}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
                  on ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <t.icon className="h-4 w-4" aria-hidden="true" />
                {t.label}
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
  const ctx = useOnboarding()
  const navigate = useNavigate()
  const [confirmReopen, setConfirmReopen] = useState(false)
  const [busy, setBusy] = useState(false)

  if (ctx.loading) return <LoadingScreen text="Cargando configuración…" />
  if (ctx.error || !ctx.snapshot) return <ErrorScreen message={ctx.error ?? 'Sin datos.'} onRetry={ctx.reload} />

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
      <SectionCard title="Reabrir configuración inicial">
        <p className="text-sm text-slate-600">
          Vuelve al asistente paso a paso con tu configuración actual ya cargada. Mientras esté abierto, el dashboard no estará disponible hasta que vuelvas a activar
          Feblio desde el último paso. No se pierde ningún dato.
        </p>
        <button type="button" onClick={() => setConfirmReopen(true)} disabled={busy} className="btn-primary mt-4 !py-2.5 text-sm">
          <RotateCcw className="h-4 w-4" aria-hidden="true" /> Reabrir asistente
        </button>
        <ConfirmDialog open={confirmReopen} title="¿Reabrir la configuración inicial?" confirmLabel="Reabrir" busy={busy} onConfirm={reopen} onCancel={() => setConfirmReopen(false)}>
          Volverás al asistente. Para regresar al dashboard tendrás que pulsar «Activar Feblio» en el último paso.
        </ConfirmDialog>
      </SectionCard>
    )
  }

  if (tab === 'integrations') {
    return (
      <SectionCard title="Canales e integraciones" action={status}>
        <IntegrationsSettings />
      </SectionCard>
    )
  }

  const map = { empresa: 'company', billing: 'billing', automation: 'automation', forms: 'forms' } as const
  const entry = STEP_REGISTRY[map[tab]]
  const title = TABS.find((t) => t.key === tab)?.label ?? ''
  return (
    <SectionCard title={title} action={status}>
      <entry.Component mode="settings" errors={entry.validate(ctx)} showErrors />
    </SectionCard>
  )
}
