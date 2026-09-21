import { useCallback, useMemo, useState } from 'react'
import { Send } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ChipsField, RadioCards, TextField, TextareaField, ToggleField } from '../../../components/forms/Field'
import { IntegrationCard } from '../../../components/onboarding/IntegrationCard'
import { CredentialsForm } from '../../../components/onboarding/CredentialsForm'
import { useIntegration } from '../../../lib/integrations/useIntegration'
import { adapterById } from '../../../lib/integrations/adapters'
import { defaultSmsData } from '../../../lib/onboarding/steps'
import { onboardingStepPath } from '../../../lib/routing'
import { validatePhone } from '../../../lib/validation'
import type { SmsProvider, SmsStepData } from '../../../lib/onboarding/types'
import { useChannelStep } from './useChannelStep'
import { useOnboarding } from '../../../lib/onboarding/OnboardingContext'
import type { StepProps } from './types'

type Data = SmsStepData & Record<string, unknown>

export function SmsChannelStep({ errors, showErrors, mode }: StepProps) {
  const { t } = useTranslation()
  // Plantillas por defecto en el idioma de la empresa (no el de la interfaz); lo guardado no se toca
  const companyLanguage = useOnboarding().snapshot?.empresa.language
  const defaults = useCallback(() => defaultSmsData(companyLanguage) as Data, [companyLanguage])
  const { data, set, connection } = useChannelStep<Data>('sms', 'sms', defaults)
  const integration = useIntegration('sms')
  const [testTo, setTestTo] = useState('')
  const [testErr, setTestErr] = useState<string | undefined>()
  const err = (k: string) => (showErrors ? errors[k] : undefined)
  const returnTo = mode === 'wizard' ? onboardingStepPath('sms') : '/empresa?settings=integrations'
  const settings = useMemo(() => data as Record<string, unknown>, [data])
  const adapter = data.provider === 'twilio' ? adapterById('twilio') : undefined
  const isConnected = connection?.provider === 'twilio' && connection.status === 'connected'

  async function choose(provider: SmsProvider) {
    set({ provider })
    if (provider === 'later') await integration.configure(connection?.provider ?? 'twilio', 'not_configured', {})
    else if (connection?.provider !== provider) await integration.configure('twilio', 'not_configured', settings)
  }

  async function sendTest() {
    const v = validatePhone(testTo, { required: true })
    if (!v.ok) {
      setTestErr(v.message)
      return
    }
    setTestErr(undefined)
    await integration.sendTest({ to: testTo.trim(), template: data.form_message_template })
  }

  return (
    <div className="space-y-8">
      <RadioCards<SmsProvider>
        legend={t('onboarding.sms.legend')}
        name="sms_provider"
        value={data.provider}
        onChange={choose}
        options={[
          { value: 'twilio', label: t('onboarding.sms.twilio'), description: t('onboarding.sms.twilioDescription') },
          { value: 'later', label: t('onboarding.sms.later'), description: t('onboarding.sms.laterDescription') },
        ]}
      />

      {adapter && (
        <IntegrationCard adapter={adapter} actions={integration} settings={settings} returnTo={returnTo}>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label={t('onboarding.sms.senderNumber')} type="tel" required value={data.sender_number} onChange={(e) => set({ sender_number: e.target.value }, e.target.value)} error={err('sender_number')} placeholder="+34 600 000 000" />
              <TextField label={t('onboarding.sms.replyNumber')} type="tel" value={data.reply_number} onChange={(e) => set({ reply_number: e.target.value })} error={err('reply_number')} hint={t('onboarding.sms.replyNumberHint')} />
            </div>
            <CredentialsForm adapter={adapter} busy={integration.busy === 'credentials'} onSubmit={(creds) => integration.storeCredentials('twilio', creds, settings)} />
            <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {t('onboarding.sms.webhookBefore')} <code>{import.meta.env.VITE_SUPABASE_URL}/functions/v1/sms-webhook</code>{' '}
              {t('onboarding.sms.webhookStatus', { status: (connection?.settings?.webhook_verified as boolean | undefined) ? t('onboarding.sms.webhookVerified') : t('onboarding.sms.webhookPending') })}
            </p>
          </div>
        </IntegrationCard>
      )}

      {data.provider !== 'later' && (
        <>
          <section aria-labelledby="sec-sms-limits" className="grid gap-4 sm:grid-cols-2">
            <h2 id="sec-sms-limits" className="text-sm font-semibold text-slate-800 sm:col-span-2">
              {t('onboarding.sms.limitsTitle')}
            </h2>
            <ChipsField label={t('onboarding.sms.allowedCountries')} values={data.allowed_countries} onChange={(v) => set({ allowed_countries: v.map((c) => c.toUpperCase()) })} error={err('allowed_countries')} suggestions={['ES', 'PT', 'FR', 'IT', 'DE', 'GB']} />
            <TextField label={t('onboarding.sms.monthlyLimit')} type="number" inputMode="numeric" min={0} max={100000} value={data.monthly_limit} onChange={(e) => set({ monthly_limit: Number(e.target.value) })} error={err('monthly_limit')} hint={t('onboarding.sms.monthlyLimitHint')} />
          </section>

          <section aria-labelledby="sec-sms-msgs" className="space-y-4">
            <h2 id="sec-sms-msgs" className="text-sm font-semibold text-slate-800">
              {t('onboarding.sms.messagesTitle')}
            </h2>
            <TextareaField label={t('onboarding.sms.formTemplate')} rows={2} required value={data.form_message_template} onChange={(e) => set({ form_message_template: e.target.value })} error={err('form_message_template')} hint={t('onboarding.sms.formTemplateHint')} />
            <ToggleField label={t('onboarding.sms.reminders')} description={t('onboarding.sms.remindersDescription')} checked={data.reminders_enabled} onChange={(c) => set({ reminders_enabled: c })} />
            {data.reminders_enabled && (
              <ChipsField label={t('onboarding.sms.reminderDays')} values={data.reminder_days.map(String)} onChange={(v) => set({ reminder_days: v.map(Number).filter((n) => Number.isInteger(n) && n > 0) })} hint={t('onboarding.sms.reminderDaysHint')} />
            )}
            <TextField label={t('onboarding.sms.optOutKeyword')} required value={data.opt_out_keyword} onChange={(e) => set({ opt_out_keyword: e.target.value.toUpperCase() })} error={err('opt_out_keyword')} hint={t('onboarding.sms.optOutKeywordHint')} />
          </section>

          <section aria-labelledby="sec-sms-test" className="rounded-xl border border-slate-200 p-4">
            <h2 id="sec-sms-test" className="text-sm font-semibold text-slate-800">
              {t('onboarding.sms.testTitle')}
            </h2>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
              <TextField label={t('onboarding.sms.testNumber')} type="tel" value={testTo} onChange={(e) => setTestTo(e.target.value)} error={testErr} className="flex-1" />
              <button type="button" onClick={sendTest} disabled={!isConnected || integration.busy !== null} className="btn-primary !py-2.5 text-sm disabled:opacity-50">
                <Send className="h-4 w-4" aria-hidden="true" /> {integration.busy === 'send_test' ? t('onboarding.sms.sending') : t('onboarding.sms.sendTest')}
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
