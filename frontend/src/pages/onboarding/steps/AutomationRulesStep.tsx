import { useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ChipsField, RadioCards, ToggleField } from '../../../components/forms/Field'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { useOnboarding } from '../../../lib/onboarding/OnboardingContext'
import { logAudit, saveAutomation } from '../../../lib/onboarding/api'
import type { AutomationLevel, AutomationSettings } from '../../../lib/onboarding/types'
import type { StepProps } from './types'

const LEVEL3_SCOPES = ['enviar_formulario', 'solicitar_documentacion', 'enviar_recordatorios', 'enviar_presupuesto', 'programar_llamada']

/** Interruptores por clave: las etiquetas viven en onboarding.automation.toggles.<key>. */
const TOGGLES: { key: keyof AutomationSettings; minLevel: AutomationLevel }[] = [
  { key: 'auto_create_request', minLevel: 1 },
  { key: 'auto_create_project', minLevel: 2 },
  { key: 'auto_send_form', minLevel: 2 },
  { key: 'auto_request_missing_docs', minLevel: 2 },
  { key: 'auto_schedule_call', minLevel: 2 },
  { key: 'auto_draft_quote', minLevel: 1 },
  { key: 'auto_send_quote', minLevel: 3 },
  { key: 'auto_reminders', minLevel: 2 },
  { key: 'pause_outside_hours', minLevel: 1 },
]

export function AutomationRulesStep({ errors, showErrors }: StepProps) {
  const { t } = useTranslation()
  const ctx = useOnboarding()
  const a = ctx.snapshot?.automation
  const empresaId = ctx.snapshot?.empresa.id ?? ''
  const [confirmL3, setConfirmL3] = useState(false)
  const err = (k: string) => (showErrors ? errors[k] : undefined)
  if (!a) return null

  function patch(p: Partial<AutomationSettings>) {
    const next = { ...a!, ...p }
    ctx.patchSnapshot((s) => ({ ...s, automation: next }))
    ctx.scheduleSave('automation', async () => {
      await saveAutomation(empresaId, p)
    })
  }

  function setLevel(level: AutomationLevel) {
    if (level === 3) {
      setConfirmL3(true)
      return
    }
    applyLevel(level)
  }

  function applyLevel(level: AutomationLevel) {
    const p: Partial<AutomationSettings> = { level, require_human_approval: level < 3 ? true : a!.require_human_approval }
    if (level === 1) {
      p.auto_send_form = false
      p.auto_send_quote = false
    }
    if (level < 3) p.auto_send_quote = false
    patch(p)
    ctx.scheduleSave('automation:audit', () => logAudit('automation.level_changed', 'automation_settings', undefined, 'ok', { level }).then(() => undefined))
  }

  return (
    <div className="space-y-8">
      <RadioCards<'1' | '2' | '3'>
        legend={t('onboarding.automation.legend')}
        name="automation_level"
        value={String(a.level) as '1' | '2' | '3'}
        onChange={(v) => setLevel(Number(v) as AutomationLevel)}
        columns={3}
        error={err('level')}
        options={[
          { value: '1', label: t('onboarding.automation.level1'), description: t('onboarding.automation.level1Description'), badge: <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">{t('onboarding.automation.default')}</span> },
          { value: '2', label: t('onboarding.automation.level2'), description: t('onboarding.automation.level2Description') },
          { value: '3', label: t('onboarding.automation.level3'), description: t('onboarding.automation.level3Description') },
        ]}
      />

      {a.level === 3 && (
        <div className="space-y-3 rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900" role="note">
          <p className="flex items-start gap-2 font-semibold">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {t('onboarding.automation.level3Active')}
          </p>
          <ChipsField label={t('onboarding.automation.scopes')} values={a.level3_scopes} onChange={(v) => patch({ level3_scopes: v })} error={err('level3_scopes')} suggestions={LEVEL3_SCOPES} hint={t('onboarding.automation.scopesHint')} />
        </div>
      )}

      <section aria-labelledby="sec-auto-rules" className="divide-y divide-slate-100">
        <h2 id="sec-auto-rules" className="pb-2 text-sm font-semibold text-slate-800">
          {t('onboarding.automation.rulesTitle')}
        </h2>
        <ToggleField
          label={t('onboarding.automation.requireApproval')}
          description={t('onboarding.automation.requireApprovalDescription')}
          checked={a.require_human_approval}
          disabled={a.level < 3}
          onChange={(c) => patch({ require_human_approval: c })}
          error={err('require_human_approval')}
        />
        {TOGGLES.map((tg) => {
          const locked = a.level < tg.minLevel
          const description = t(`onboarding.automation.toggles.${tg.key}.description`)
          return (
            <ToggleField
              key={tg.key}
              label={t(`onboarding.automation.toggles.${tg.key}.label`)}
              description={locked ? t('onboarding.automation.lockedSuffix', { description, level: tg.minLevel }) : description}
              checked={Boolean(a[tg.key])}
              disabled={locked}
              onChange={(c) => patch({ [tg.key]: c } as Partial<AutomationSettings>)}
            />
          )
        })}
      </section>

      <ConfirmDialog open={confirmL3} title={t('onboarding.automation.confirmTitle')} tone="warning" confirmLabel={t('onboarding.automation.confirmLabel')} onConfirm={() => { setConfirmL3(false); applyLevel(3) }} onCancel={() => setConfirmL3(false)}>
        <p>
          {t('onboarding.automation.confirmBefore')} <strong>{t('onboarding.automation.confirmStrong')}</strong>
          {t('onboarding.automation.confirmAfter')}
        </p>
      </ConfirmDialog>
    </div>
  )
}
