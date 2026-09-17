import { useMemo, useState } from 'react'
import { MessageCircle, Send } from 'lucide-react'
import { ChipsField, RadioCards, SelectField, TextField, TextareaField, ToggleField } from '../../../components/forms/Field'
import { BusinessHoursEditor } from '../../../components/forms/BusinessHoursEditor'
import { IntegrationCard } from '../../../components/onboarding/IntegrationCard'
import { CredentialsForm } from '../../../components/onboarding/CredentialsForm'
import { useIntegration } from '../../../lib/integrations/useIntegration'
import { adapterById } from '../../../lib/integrations/adapters'
import { defaultWhatsAppData } from '../../../lib/onboarding/steps'
import { onboardingStepPath } from '../../../lib/routing'
import { validatePhone } from '../../../lib/validation'
import type { WhatsAppProvider, WhatsAppStepData } from '../../../lib/onboarding/types'
import { useChannelStep } from './useChannelStep'
import type { StepProps } from './types'

type Data = WhatsAppStepData & Record<string, unknown>
const defaults = defaultWhatsAppData as () => Data

export function WhatsAppChannelStep({ errors, showErrors, mode }: StepProps) {
  const { data, set, connection } = useChannelStep<Data>('whatsapp', 'whatsapp', defaults)
  const integration = useIntegration('whatsapp')
  const [testTo, setTestTo] = useState('')
  const [testErr, setTestErr] = useState<string | undefined>()
  const err = (k: string) => (showErrors ? errors[k] : undefined)
  const returnTo = mode === 'wizard' ? onboardingStepPath('whatsapp') : '/empresa?settings=integrations'
  const settings = useMemo(() => data as Record<string, unknown>, [data])
  const adapter = data.provider === 'meta' ? adapterById('meta') : undefined
  const isConnected = connection?.provider === 'meta' && connection.status === 'connected'
  const webhookStatus = (connection?.settings?.webhook_verified as boolean | undefined) ? 'Verificado' : 'Pendiente de verificación por Meta'

  async function choose(provider: WhatsAppProvider) {
    set({ provider })
    if (provider === 'later') await integration.configure(connection?.provider ?? 'meta', 'not_configured', {})
    else if (connection?.provider !== provider) await integration.configure('meta', 'not_configured', settings)
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
      <RadioCards<WhatsAppProvider>
        legend="Proveedor de WhatsApp"
        name="whatsapp_provider"
        value={data.provider}
        onChange={choose}
        options={[
          { value: 'meta', label: 'WhatsApp Business Platform (Meta)', description: 'API oficial. Necesitas una cuenta de WhatsApp Business y un número verificado.' },
          { value: 'later', label: 'Configurar más adelante', description: 'Podrás activarlo desde Configuración.' },
        ]}
      />

      {adapter && (
        <IntegrationCard adapter={adapter} actions={integration} settings={settings} returnTo={returnTo}>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <TextField label="Número empresarial" type="tel" required value={data.phone_number} onChange={(e) => set({ phone_number: e.target.value }, e.target.value)} error={err('phone_number')} placeholder="+34 600 000 000" />
              <TextField label="Business Account ID" required inputMode="numeric" value={data.business_account_id} onChange={(e) => set({ business_account_id: e.target.value })} error={err('business_account_id')} spellCheck={false} />
              <TextField label="Phone Number ID" required inputMode="numeric" value={data.phone_number_id} onChange={(e) => set({ phone_number_id: e.target.value })} error={err('phone_number_id')} spellCheck={false} />
            </div>
            <CredentialsForm adapter={adapter} busy={integration.busy === 'credentials'} onSubmit={(creds) => integration.storeCredentials('meta', creds, settings)} />
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-xl bg-slate-50 px-3 py-2 text-xs">
              <dt className="font-medium text-slate-500">Webhook</dt>
              <dd className="text-slate-700">{webhookStatus}</dd>
              <dt className="font-medium text-slate-500">URL</dt>
              <dd className="truncate text-slate-700">
                <code>{import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook</code>
              </dd>
            </dl>
          </div>
        </IntegrationCard>
      )}

      {data.provider !== 'later' && (
        <>
          <section aria-labelledby="sec-wa-msgs" className="space-y-4">
            <h2 id="sec-wa-msgs" className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <MessageCircle className="h-4 w-4 text-brand-600" aria-hidden="true" /> Mensajes
            </h2>
            <TextareaField label="Mensaje de bienvenida" rows={2} value={data.welcome_message} onChange={(e) => set({ welcome_message: e.target.value })} hint="Variables: {empresa}, {nombre}." />
            <TextareaField label="Mensaje fuera de horario" rows={2} value={data.off_hours_message} onChange={(e) => set({ off_hours_message: e.target.value })} />
            <TextareaField label="Plantilla para enviar el formulario" rows={2} required value={data.form_message_template} onChange={(e) => set({ form_message_template: e.target.value })} error={err('form_message_template')} hint="Debe incluir {url}. Las plantillas de WhatsApp requieren aprobación de Meta." />
            <TextareaField label="Texto de consentimiento" rows={2} required value={data.consent_text} onChange={(e) => set({ consent_text: e.target.value })} error={err('consent_text')} />
          </section>

          <section aria-labelledby="sec-wa-rules" className="space-y-4">
            <h2 id="sec-wa-rules" className="text-sm font-semibold text-slate-800">
              Horario, idiomas y reglas
            </h2>
            <BusinessHoursEditor value={data.hours} onChange={(v) => set({ hours: v })} error={err('hours')} />
            <ChipsField label="Idiomas" values={data.languages} onChange={(v) => set({ languages: v })} suggestions={['es', 'en', 'pt', 'ca']} />
            <SelectField
              label="Cuándo crear una solicitud"
              value={data.create_request_rule}
              onChange={(e) => set({ create_request_rule: e.target.value as Data['create_request_rule'] })}
              options={[
                { value: 'manual', label: 'Solo cuando una persona lo decida' },
                { value: 'keyword', label: 'Cuando el mensaje contenga palabras clave (presupuesto, solicitud…)' },
                { value: 'always', label: 'Con cada conversación nueva' },
              ]}
            />
            <ToggleField label="Escalar a una persona" description="Si el cliente lo pide o Feblio no entiende el mensaje." checked={data.escalate_to_human} onChange={(c) => set({ escalate_to_human: c })} />
            {data.escalate_to_human && <TextField label="Palabras clave de escalado" value={data.escalation_keywords} onChange={(e) => set({ escalation_keywords: e.target.value })} hint="Separadas por comas." />}
          </section>

          <section aria-labelledby="sec-wa-test" className="rounded-xl border border-slate-200 p-4">
            <h2 id="sec-wa-test" className="text-sm font-semibold text-slate-800">
              Prueba controlada
            </h2>
            <p className="mt-1 text-xs text-slate-500">{isConnected ? 'Envía la plantilla del formulario a un número de prueba.' : 'Conecta y verifica la cuenta antes de enviar una prueba.'}</p>
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
