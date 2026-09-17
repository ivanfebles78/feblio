import { useMemo, useState } from 'react'
import { Send } from 'lucide-react'
import { ChipsField, RadioCards, TextField, TextareaField, ToggleField } from '../../../components/forms/Field'
import { IntegrationCard } from '../../../components/onboarding/IntegrationCard'
import { CredentialsForm } from '../../../components/onboarding/CredentialsForm'
import { useIntegration } from '../../../lib/integrations/useIntegration'
import { adapterById } from '../../../lib/integrations/adapters'
import { defaultEmailData } from '../../../lib/onboarding/steps'
import { onboardingStepPath } from '../../../lib/routing'
import { validateEmail } from '../../../lib/validation'
import type { EmailProvider, EmailStepData } from '../../../lib/onboarding/types'
import { useChannelStep } from './useChannelStep'
import type { StepProps } from './types'

type Data = EmailStepData & Record<string, unknown>
const defaults = defaultEmailData as () => Data

export function EmailChannelStep({ errors, showErrors, mode }: StepProps) {
  const { ctx, data, set, connection } = useChannelStep<Data>('email', 'email', defaults)
  const integration = useIntegration('email')
  const [testTo, setTestTo] = useState(ctx.snapshot?.owner?.email ?? '')
  const [testErr, setTestErr] = useState<string | undefined>()
  const err = (k: string) => (showErrors ? errors[k] : undefined)
  const returnTo = mode === 'wizard' ? onboardingStepPath('email') : '/empresa?settings=integrations'
  const empresaShort = (ctx.snapshot?.empresa.id ?? '').slice(0, 8)
  const inboundAddress = `empresa-${empresaShort}@inbound.feblio.app`

  const settings = useMemo(() => {
    const { ...rest } = data
    return rest as Record<string, unknown>
  }, [data])

  async function choose(provider: EmailProvider) {
    const patch: Partial<Data> = { provider }
    if (provider === 'feblio_inbox') patch.inbound_address = inboundAddress
    set(patch, provider === 'feblio_inbox' ? inboundAddress : data.inbound_address || undefined)
    if (provider === 'later') {
      await integration.configure(connection?.provider ?? 'feblio_inbox', 'not_configured', {})
    } else if (connection?.provider !== provider) {
      await integration.configure(provider, 'not_configured', { ...settings, ...patch })
    }
  }

  async function sendTest() {
    const v = validateEmail(testTo)
    if (!v.ok) {
      setTestErr(v.message)
      return
    }
    setTestErr(undefined)
    await integration.sendTest({ to: testTo.trim(), sender_name: data.sender_name, signature: data.signature })
  }

  const adapter = data.provider !== 'later' ? adapterById(data.provider) : undefined
  const isConnected = connection?.provider === data.provider && connection?.status === 'connected'

  return (
    <div className="space-y-8">
      <RadioCards<EmailProvider>
        legend="¿Cómo quieres que Feblio reciba y envíe correos?"
        name="email_provider"
        value={data.provider}
        onChange={choose}
        options={[
          { value: 'gmail', label: 'Google Workspace / Gmail', description: 'Lee etiquetas concretas y prepara borradores en tu cuenta.' },
          { value: 'm365', label: 'Microsoft 365 / Outlook', description: 'Lee carpetas concretas y prepara borradores en tu buzón.' },
          { value: 'feblio_inbox', label: 'Dirección de entrada de Feblio', description: 'Reenvía correos a una dirección propia de Feblio. Sin OAuth.' },
          { value: 'imap', label: 'IMAP / SMTP', description: 'Cualquier proveedor. Credenciales cifradas en el servidor.' },
          { value: 'later', label: 'Configurar más adelante', description: 'Podrás activarlo desde Configuración.' },
        ]}
      />

      {adapter && (
        <IntegrationCard adapter={adapter} actions={integration} settings={settings} returnTo={returnTo}>
          {data.provider === 'feblio_inbox' && (
            <p className="rounded-xl bg-brand-50 px-3 py-2 text-xs text-brand-900">
              Tu dirección de entrada: <code className="font-semibold">{inboundAddress}</code>. Configura en tu correo una regla de reenvío hacia ella. El
              dominio de entrada debe estar configurado por el administrador de Feblio (ver docs/integraciones.md).
            </p>
          )}
          {data.provider === 'imap' && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField label="Servidor IMAP" required value={data.imap_host ?? ''} onChange={(e) => set({ imap_host: e.target.value })} error={err('imap_host')} placeholder="imap.tudominio.com" spellCheck={false} />
                <TextField label="Puerto IMAP" type="number" inputMode="numeric" value={data.imap_port ?? 993} onChange={(e) => set({ imap_port: Number(e.target.value) })} error={err('imap_port')} />
                <TextField label="Servidor SMTP" required value={data.smtp_host ?? ''} onChange={(e) => set({ smtp_host: e.target.value })} error={err('smtp_host')} placeholder="smtp.tudominio.com" spellCheck={false} />
                <TextField label="Puerto SMTP" type="number" inputMode="numeric" value={data.smtp_port ?? 587} onChange={(e) => set({ smtp_port: Number(e.target.value) })} error={err('smtp_port')} />
              </div>
              <CredentialsForm adapter={adapter} busy={integration.busy === 'credentials'} onSubmit={(creds) => integration.storeCredentials('imap', creds, settings)} />
            </div>
          )}
        </IntegrationCard>
      )}

      {data.provider !== 'later' && (
        <section aria-labelledby="sec-email-cfg" className="space-y-4">
          <h2 id="sec-email-cfg" className="text-sm font-semibold text-slate-800">
            Cuentas, firma y ámbito
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Cuenta de recepción"
              type="email"
              autoComplete="email"
              required={data.provider !== 'feblio_inbox'}
              readOnly={data.provider === 'feblio_inbox'}
              value={data.inbound_address}
              onChange={(e) => set({ inbound_address: e.target.value }, e.target.value)}
              error={err('inbound_address')}
              hint="Buzón que Feblio analizará."
            />
            <TextField label="Cuenta remitente" type="email" autoComplete="email" value={data.sender_address} onChange={(e) => set({ sender_address: e.target.value })} error={err('sender_address')} hint="Desde la que se enviarán los correos. Necesaria para el envío automático." />
            <TextField label="Nombre del remitente" value={data.sender_name} onChange={(e) => set({ sender_name: e.target.value })} placeholder={ctx.snapshot?.empresa.name} />
            <TextareaField label="Firma" rows={3} value={data.signature} onChange={(e) => set({ signature: e.target.value })} className="sm:col-span-2" />
          </div>
          <RadioCards<'all' | 'labeled'>
            legend="Qué mensajes puede analizar Feblio"
            name="email_scope"
            value={data.scope}
            onChange={(v) => set({ scope: v })}
            options={[
              { value: 'labeled', label: 'Solo mensajes etiquetados', description: 'Recomendado. Solo procesa las carpetas o etiquetas que indiques.' },
              { value: 'all', label: 'Todos los mensajes', description: 'Procesa toda la bandeja de entrada.' },
            ]}
          />
          {data.scope === 'labeled' && <ChipsField label="Carpetas o etiquetas" values={data.labels} onChange={(v) => set({ labels: v })} error={err('labels')} suggestions={['Feblio', 'Clientes', 'Solicitudes']} />}
        </section>
      )}

      {data.provider !== 'later' && (
        <section aria-labelledby="sec-email-auto" className="space-y-1 divide-y divide-slate-100">
          <h2 id="sec-email-auto" className="pb-2 text-sm font-semibold text-slate-800">
            Comportamiento
          </h2>
          <ToggleField label="Crear solicitudes automáticamente" description="Cuando llegue un correo de un cliente, Feblio crea una solicitud en tu bandeja." checked={data.auto_create_requests} onChange={(c) => set({ auto_create_requests: c })} />
          <ToggleField label="Preparar borradores de respuesta" description="Feblio redacta una respuesta que tú revisas." checked={data.prepare_drafts} onChange={(c) => set({ prepare_drafts: c })} />
          <ToggleField label="Requerir aprobación humana" description="Ningún correo sale sin que alguien lo apruebe. Recomendado." checked={data.require_approval} onChange={(c) => set({ require_approval: c, auto_send: c ? false : data.auto_send })} />
          <ToggleField
            label="Enviar automáticamente"
            description="Solo si hay cuenta remitente y no se requiere aprobación."
            checked={data.auto_send}
            disabled={data.require_approval || !data.sender_address.trim()}
            onChange={(c) => set({ auto_send: c })}
            error={err('auto_send')}
          />
        </section>
      )}

      {data.provider !== 'later' && (
        <section aria-labelledby="sec-email-test" className="rounded-xl border border-slate-200 p-4">
          <h2 id="sec-email-test" className="text-sm font-semibold text-slate-800">
            Correo de prueba
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {isConnected ? 'Envía un correo de prueba desde la cuenta conectada.' : 'Conecta y prueba la cuenta antes de enviar un correo de prueba.'}
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
            <TextField label="Enviar a" type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} error={testErr} className="flex-1" />
            <button type="button" onClick={sendTest} disabled={!isConnected || integration.busy !== null} className="btn-primary !py-2.5 text-sm disabled:opacity-50">
              <Send className="h-4 w-4" aria-hidden="true" /> {integration.busy === 'send_test' ? 'Enviando…' : 'Enviar prueba'}
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
