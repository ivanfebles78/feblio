import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ChipsField, RadioCards, SelectField, TextField, TextareaField, ToggleField } from '../../../components/forms/Field'
import { BusinessHoursEditor } from '../../../components/forms/BusinessHoursEditor'
import { IntegrationCard } from '../../../components/onboarding/IntegrationCard'
import { CreateRequestFromCall } from '../../../components/onboarding/CreateRequestFromCall'
import { useIntegration } from '../../../lib/integrations/useIntegration'
import { adapterById } from '../../../lib/integrations/adapters'
import { TIMEZONES, defaultVoiceData } from '../../../lib/onboarding/steps'
import { onboardingStepPath } from '../../../lib/routing'
import type { VoiceMode, VoiceStepData } from '../../../lib/onboarding/types'
import { useChannelStep } from './useChannelStep'
import type { StepProps } from './types'

type Data = VoiceStepData & Record<string, unknown>

export function VoiceChannelStep({ errors, showErrors, mode }: StepProps) {
  const { t } = useTranslation()
  const integration = useIntegration('voice')
  const tz = integration.connection?.settings?.timezone as string | undefined
  const defaults = useCallback(() => defaultVoiceData(tz ?? 'Europe/Madrid') as Data, [tz])
  const { ctx, data, set, connection } = useChannelStep<Data>('voice', 'voice', defaults)
  const err = (k: string) => (showErrors ? errors[k] : undefined)
  const returnTo = mode === 'wizard' ? onboardingStepPath('voice') : '/empresa?settings=integrations'
  const settings = useMemo(() => data as Record<string, unknown>, [data])
  const automated = data.mode === 'agent' || data.mode === 'integrated' || data.mode === 'forward'
  const adapter = data.mode === 'manual' ? adapterById('manual_log') : automated ? adapterById('voice_provider') : undefined
  const empresaTz = ctx.snapshot?.empresa.timezone ?? 'Europe/Madrid'

  // «Registro manual» es el valor inicial y no requiere clic: si la conexión aún no refleja ese modo,
  // se configura una vez al montar para que cuente como método de creación de solicitudes.
  const autoConfigured = useRef(false)
  useEffect(() => {
    if (autoConfigured.current || !connection || integration.busy) return
    const needsSetup = data.mode === 'manual' && (connection.provider !== 'manual_log' || connection.status !== 'connected')
    if (!needsSetup) return
    autoConfigured.current = true
    void (async () => {
      const ok = await integration.configure('manual_log', 'connected', { ...settings, mode: 'manual' }, undefined, 'Registro manual')
      if (ok) await integration.test('manual_log')
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection?.provider, connection?.status, data.mode])

  async function choose(m: VoiceMode) {
    set({ mode: m, timezone: data.timezone || empresaTz })
    if (m === 'later') {
      await integration.configure(connection?.provider ?? 'manual_log', 'not_configured', {})
    } else if (m === 'manual') {
      const ok = await integration.configure('manual_log', 'connected', { ...settings, mode: 'manual' }, undefined, 'Registro manual')
      if (ok) await integration.test('manual_log')
    } else if (connection?.provider !== 'voice_provider') {
      await integration.configure('voice_provider', 'not_configured', { ...settings, mode: m })
    }
  }

  function setExt(i: number, patch: Partial<{ name: string; number: string }>) {
    set({ extensions: data.extensions.map((e, idx) => (idx === i ? { ...e, ...patch } : e)) })
  }

  return (
    <div className="space-y-8">
      <RadioCards<VoiceMode>
        legend={t('onboarding.voice.legend')}
        name="voice_mode"
        value={data.mode}
        onChange={choose}
        options={[
          { value: 'manual', label: t('onboarding.voice.manual'), description: t('onboarding.voice.manualDescription'), badge: <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">{t('onboarding.voice.ready')}</span> },
          { value: 'integrated', label: t('onboarding.voice.integrated'), description: t('onboarding.voice.integratedDescription') },
          { value: 'agent', label: t('onboarding.voice.agent'), description: t('onboarding.voice.agentDescription') },
          { value: 'forward', label: t('onboarding.voice.forward'), description: t('onboarding.voice.forwardDescription') },
          { value: 'later', label: t('onboarding.voice.later'), description: t('onboarding.voice.laterDescription') },
        ]}
      />

      {adapter && <IntegrationCard adapter={adapter} actions={integration} settings={settings} returnTo={returnTo} />}

      {data.mode === 'manual' && (
        <CreateRequestFromCall templates={ctx.snapshot?.form_templates ?? []} isTest={mode === 'wizard'} />
      )}

      {automated && (
        <>
          <section aria-labelledby="sec-voice-basic" className="grid gap-4 sm:grid-cols-2">
            <h2 id="sec-voice-basic" className="text-sm font-semibold text-slate-800 sm:col-span-2">
              {t('onboarding.voice.basicTitle')}
            </h2>
            <TextField label={t('onboarding.voice.mainNumber')} type="tel" required value={data.main_number} onChange={(e) => set({ main_number: e.target.value }, e.target.value)} error={err('main_number')} />
            <SelectField label={t('onboarding.voice.timezone')} required value={data.timezone} onChange={(e) => set({ timezone: e.target.value })} error={err('timezone')} options={TIMEZONES.map((tz) => ({ value: tz, label: tz }))} />
            <div className="sm:col-span-2">
              <BusinessHoursEditor value={data.hours} onChange={(v) => set({ hours: v })} error={err('hours')} />
            </div>
            <TextField label={t('onboarding.voice.overflowNumber')} type="tel" value={data.overflow_number} onChange={(e) => set({ overflow_number: e.target.value })} error={err('overflow_number')} hint={t('onboarding.voice.overflowNumberHint')} />
            <ChipsField label={t('onboarding.voice.languages')} values={data.languages} onChange={(v) => set({ languages: v })} suggestions={['es', 'en', 'pt', 'ca']} />
          </section>

          <section aria-labelledby="sec-voice-notices" className="space-y-1 divide-y divide-slate-100">
            <h2 id="sec-voice-notices" className="pb-2 text-sm font-semibold text-slate-800">
              {t('onboarding.voice.noticesTitle')}
            </h2>
            <TextareaField label={t('onboarding.voice.welcomeMessage')} rows={2} value={data.welcome_message} onChange={(e) => set({ welcome_message: e.target.value })} />
            <ToggleField label={t('onboarding.voice.recordingNotice')} description={t('onboarding.voice.recordingNoticeDescription')} checked={data.recording_notice} onChange={(c) => set({ recording_notice: c })} error={err('recording_notice')} />
            <ToggleField label={t('onboarding.voice.transcriptionNotice')} description={t('onboarding.voice.transcriptionNoticeDescription')} checked={data.transcription_notice} onChange={(c) => set({ transcription_notice: c })} error={err('transcription_notice')} />
            <ToggleField label={t('onboarding.voice.consentRequired')} description={t('onboarding.voice.consentRequiredDescription')} checked={data.consent_required} onChange={(c) => set({ consent_required: c })} error={err('consent_required')} />
          </section>

          <section aria-labelledby="sec-voice-flow" className="space-y-4">
            <h2 id="sec-voice-flow" className="text-sm font-semibold text-slate-800">
              {t('onboarding.voice.flowTitle')}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label={t('onboarding.voice.maxWait')} type="number" inputMode="numeric" value={data.max_wait_seconds} onChange={(e) => set({ max_wait_seconds: Number(e.target.value) })} error={err('max_wait_seconds')} />
              <TextField label={t('onboarding.voice.maxDuration')} type="number" inputMode="numeric" value={data.max_duration_minutes} onChange={(e) => set({ max_duration_minutes: Number(e.target.value) })} error={err('max_duration_minutes')} />
              <SelectField
                label={t('onboarding.voice.sendFormVia')}
                value={data.send_form_via}
                onChange={(e) => set({ send_form_via: e.target.value as Data['send_form_via'] })}
                options={[
                  { value: 'sms', label: 'SMS' },
                  { value: 'whatsapp', label: 'WhatsApp' },
                  { value: 'email', label: 'Email' },
                  { value: 'none', label: t('onboarding.voice.sendFormNone') },
                ]}
              />
            </div>
            <ToggleField label={t('onboarding.voice.transfer')} description={t('onboarding.voice.transferDescription')} checked={data.transfer_to_employee} onChange={(c) => set({ transfer_to_employee: c })} />
            <ToggleField label={t('onboarding.voice.scheduling')} description={t('onboarding.voice.schedulingDescription')} checked={data.scheduling_enabled} onChange={(c) => set({ scheduling_enabled: c })} />

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium text-slate-600">{t('onboarding.voice.extensions')}</p>
                <button type="button" onClick={() => set({ extensions: [...data.extensions, { name: '', number: '' }] })} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" /> {t('onboarding.voice.add')}
                </button>
              </div>
              {data.extensions.length === 0 && <p className="text-xs text-slate-400">{t('onboarding.voice.noExtensions')}</p>}
              <ul className="space-y-2">
                {data.extensions.map((ext, i) => (
                  <li key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                    <TextField label={t('onboarding.voice.extensionName', { n: i + 1 })} value={ext.name} onChange={(e) => setExt(i, { name: e.target.value })} error={err(`extensions.${i}`)} />
                    <TextField label={t('onboarding.voice.extensionNumber')} type="tel" value={ext.number} onChange={(e) => setExt(i, { number: e.target.value })} />
                    <button type="button" onClick={() => set({ extensions: data.extensions.filter((_, idx) => idx !== i) })} className="mb-[2px] rounded-xl border border-slate-200 p-2.5 text-slate-400 hover:text-red-500" aria-label={t('onboarding.voice.removeExtension', { n: i + 1 })}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
