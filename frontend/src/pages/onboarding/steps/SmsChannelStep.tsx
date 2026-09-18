import { useMemo, useState } from 'react'
import { Send } from 'lucide-react'
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
import type { StepProps } from './types'

type Data = SmsStepData & Record<string, unknown>
const defaults = defaultSmsData as () => Data

export function SmsChannelStep({ errors, showErrors, mode }: StepProps) {
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
        legend="Proveedor de SMS"
        name="sms_provider"
        value={data.provider}
        onChange={choose}
        options={[
          { value: 'twilio', label: 'Twilio SMS', description: 'Envío de formularios y recordatorios; respuestas por webhook.' },
          { value: 'later', label: 'Configurar más adelante', description: 'Puedes omitir este paso.' },
        ]}
      />

      {adapter && (
        <IntegrationCard adapter={adapter} actions={integration} settings={settings} returnTo={returnTo}>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Número remitente" type="tel" required value={data.sender_number} onChange={(e) => set({ sender_number: e.target.value }, e.target.value)} error={err('sender_number')} placeholder="+34 600 000 000" />
              <TextField label="Número para respuestas" type="tel" value={data.reply_number} onChange={(e) => set({ reply_number: e.target.value })} error={err('reply_number')} hint="Si es distinto del remitente." />
            </div>
            <CredentialsForm adapter={adapter} busy={integration.busy === 'credentials'} onSubmit={(creds) => integration.storeCredentials('twilio', creds, settings)} />
            <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Webhook de respuestas: <code>{import.meta.env.VITE_SUPABASE_URL}/functions/v1/sms-webhook</code> · Estado: {(connection?.settings?.webhook_verified as boolean | undefined) ? 'Verificado' : 'Pendiente'}
            </p>
          </div>
        </IntegrationCard>
      )}

      {data.provider !== 'later' && (
        <>
          <section aria-labelledby="sec-sms-limits" className="grid gap-4 sm:grid-cols-2">
            <h2 id="sec-sms-limits" className="text-sm font-semibold text-slate-800 sm:col-span-2">
              Límites y países
            </h2>
            <ChipsField label="Países permitidos (ISO)" values={data.allowed_countries} onChange={(v) => set({ allowed_countries: v.map((c) => c.toUpperCase()) })} error={err('allowed_countries')} suggestions={['ES', 'PT', 'FR', 'IT', 'DE', 'GB']} />
            <TextField label="Límite mensual de SMS" type="number" inputMode="numeric" min={0} max={100000} value={data.monthly_limit} onChange={(e) => set({ monthly_limit: Number(e.target.value) })} error={err('monthly_limit')} hint="Evita costes inesperados." />
          </section>

          <section aria-labelledby="sec-sms-msgs" className="space-y-4">
            <h2 id="sec-sms-msgs" className="text-sm font-semibold text-slate-800">
              Mensajes
            </h2>
            <TextareaField label="Plantilla de envío del formulario" rows={2} required value={data.form_message_template} onChange={(e) => set({ form_message_template: e.target.value })} error={err('form_message_template')} hint="Debe incluir {url}. Máx. 160 caracteres por segmento." />
            <ToggleField label="Recordatorios" description="Reenvía el enlace si el cliente no completa el formulario." checked={data.reminders_enabled} onChange={(c) => set({ reminders_enabled: c })} />
            {data.reminders_enabled && (
              <ChipsField label="Días de recordatorio" values={data.reminder_days.map(String)} onChange={(v) => set({ reminder_days: v.map(Number).filter((n) => Number.isInteger(n) && n > 0) })} hint="Días tras el envío (p. ej. 3, 7)." />
            )}
            <TextField label="Palabra de baja" required value={data.opt_out_keyword} onChange={(e) => set({ opt_out_keyword: e.target.value.toUpperCase() })} error={err('opt_out_keyword')} hint="Al recibirla se deja de enviar SMS a ese número." />
          </section>

          <section aria-labelledby="sec-sms-test" className="rounded-xl border border-slate-200 p-4">
            <h2 id="sec-sms-test" className="text-sm font-semibold text-slate-800">
              Prueba de envío
            </h2>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
              <TextField label="Número de prueba" type="tel" value={testTo} onChange={(e) => setTestTo(e.target.value)} error={testErr} className="flex-1" />
              <button type="button" onClick={sendTest} disabled={!isConnected || integration.busy !== null} className="btn-primary !py-2.5 text-sm disabled:opacity-50">
                <Send className="h-4 w-4" aria-hidden="true" /> {integration.busy === 'send_test' ? 'Enviando…' : 'Enviar prueba'}
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
