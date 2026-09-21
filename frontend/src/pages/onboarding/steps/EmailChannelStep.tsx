import { useMemo, useState } from 'react'
import { Send } from 'lucide-react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
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
        legend={t('onboarding.email.legend')}
        name="email_provider"
        value={data.provider}
        onChange={choose}
        options={[
          { value: 'gmail', label: t('onboarding.email.gmail'), description: t('onboarding.email.gmailDescription') },
          { value: 'm365', label: t('onboarding.email.m365'), description: t('onboarding.email.m365Description') },
          { value: 'feblio_inbox', label: t('onboarding.email.inbox'), description: t('onboarding.email.inboxDescription') },
          { value: 'imap', label: t('onboarding.email.imap'), description: t('onboarding.email.imapDescription') },
          { value: 'later', label: t('onboarding.email.later'), description: t('onboarding.email.laterDescription') },
        ]}
      />

      {adapter && (
        <IntegrationCard adapter={adapter} actions={integration} settings={settings} returnTo={returnTo}>
          {data.provider === 'feblio_inbox' && (
            <p className="rounded-xl bg-brand-50 px-3 py-2 text-xs text-brand-900">
              {t('onboarding.email.inboundBefore')} <code className="font-semibold">{inboundAddress}</code>
              {t('onboarding.email.inboundAfter')}
            </p>
          )}
          {data.provider === 'imap' && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField label={t('onboarding.email.imapHost')} required value={data.imap_host ?? ''} onChange={(e) => set({ imap_host: e.target.value })} error={err('imap_host')} placeholder="imap.tudominio.com" spellCheck={false} />
                <TextField label={t('onboarding.email.imapPort')} type="number" inputMode="numeric" value={data.imap_port ?? 993} onChange={(e) => set({ imap_port: Number(e.target.value) })} error={err('imap_port')} />
                <TextField label={t('onboarding.email.smtpHost')} required value={data.smtp_host ?? ''} onChange={(e) => set({ smtp_host: e.target.value })} error={err('smtp_host')} placeholder="smtp.tudominio.com" spellCheck={false} />
                <TextField label={t('onboarding.email.smtpPort')} type="number" inputMode="numeric" value={data.smtp_port ?? 587} onChange={(e) => set({ smtp_port: Number(e.target.value) })} error={err('smtp_port')} />
              </div>
              <CredentialsForm adapter={adapter} busy={integration.busy === 'credentials'} onSubmit={(creds) => integration.storeCredentials('imap', creds, settings)} />
            </div>
          )}
        </IntegrationCard>
      )}

      {data.provider !== 'later' && (
        <section aria-labelledby="sec-email-cfg" className="space-y-4">
          <h2 id="sec-email-cfg" className="text-sm font-semibold text-slate-800">
            {t('onboarding.email.accountsTitle')}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label={t('onboarding.email.inboundAccount')}
              type="email"
              autoComplete="email"
              required={data.provider !== 'feblio_inbox'}
              readOnly={data.provider === 'feblio_inbox'}
              value={data.inbound_address}
              onChange={(e) => set({ inbound_address: e.target.value }, e.target.value)}
              error={err('inbound_address')}
              hint={t('onboarding.email.inboundAccountHint')}
            />
            <TextField label={t('onboarding.email.senderAccount')} type="email" autoComplete="email" value={data.sender_address} onChange={(e) => set({ sender_address: e.target.value })} error={err('sender_address')} hint={t('onboarding.email.senderAccountHint')} />
            <TextField label={t('onboarding.email.senderName')} value={data.sender_name} onChange={(e) => set({ sender_name: e.target.value })} placeholder={ctx.snapshot?.empresa.name} />
            <TextareaField label={t('onboarding.email.signature')} rows={3} value={data.signature} onChange={(e) => set({ signature: e.target.value })} className="sm:col-span-2" />
          </div>
          <RadioCards<'all' | 'labeled'>
            legend={t('onboarding.email.scopeLegend')}
            name="email_scope"
            value={data.scope}
            onChange={(v) => set({ scope: v })}
            options={[
              { value: 'labeled', label: t('onboarding.email.scopeLabeled'), description: t('onboarding.email.scopeLabeledDescription') },
              { value: 'all', label: t('onboarding.email.scopeAll'), description: t('onboarding.email.scopeAllDescription') },
            ]}
          />
          {data.scope === 'labeled' && <ChipsField label={t('onboarding.email.labels')} values={data.labels} onChange={(v) => set({ labels: v })} error={err('labels')} suggestions={['Feblio', 'Clientes', 'Solicitudes']} />}
        </section>
      )}

      {data.provider !== 'later' && (
        <section aria-labelledby="sec-email-auto" className="space-y-1 divide-y divide-slate-100">
          <h2 id="sec-email-auto" className="pb-2 text-sm font-semibold text-slate-800">
            {t('onboarding.email.behaviourTitle')}
          </h2>
          <ToggleField label={t('onboarding.email.autoCreate')} description={t('onboarding.email.autoCreateDescription')} checked={data.auto_create_requests} onChange={(c) => set({ auto_create_requests: c })} />
          <ToggleField label={t('onboarding.email.prepareDrafts')} description={t('onboarding.email.prepareDraftsDescription')} checked={data.prepare_drafts} onChange={(c) => set({ prepare_drafts: c })} />
          <ToggleField label={t('onboarding.email.requireApproval')} description={t('onboarding.email.requireApprovalDescription')} checked={data.require_approval} onChange={(c) => set({ require_approval: c, auto_send: c ? false : data.auto_send })} />
          <ToggleField
            label={t('onboarding.email.autoSend')}
            description={t('onboarding.email.autoSendDescription')}
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
            {t('onboarding.email.testTitle')}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {isConnected ? t('onboarding.email.testConnected') : t('onboarding.email.testNotConnected')}
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
            <TextField label={t('onboarding.email.sendTo')} type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} error={testErr} className="flex-1" />
            <button type="button" onClick={sendTest} disabled={!isConnected || integration.busy !== null} className="btn-primary !py-2.5 text-sm disabled:opacity-50">
              <Send className="h-4 w-4" aria-hidden="true" /> {integration.busy === 'send_test' ? t('onboarding.email.sending') : t('onboarding.email.sendTest')}
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
