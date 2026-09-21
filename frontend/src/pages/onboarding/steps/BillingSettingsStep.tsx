import { useMemo, useState } from 'react'
import { Eye, EyeOff, Lightbulb } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CheckboxField, SelectField, TextField, TextareaField, ToggleField } from '../../../components/forms/Field'
import { IntegrationCard } from '../../../components/onboarding/IntegrationCard'
import { useOnboarding } from '../../../lib/onboarding/OnboardingContext'
import { useIntegration } from '../../../lib/integrations/useIntegration'
import { adapterById } from '../../../lib/integrations/adapters'
import { saveBilling, updateEmpresa } from '../../../lib/onboarding/api'
import { CURRENCIES, isCanaryIslands } from '../../../lib/onboarding/steps'
import { onboardingStepPath } from '../../../lib/routing'
import { normalizeIban } from '../../../lib/validation'
import type { BillingSettings, DocumentReleasePolicy, TaxKind } from '../../../lib/onboarding/types'
import type { StepProps } from './types'

/** Códigos de método de cobro (valores persistidos); etiquetas en onboarding.billing.payment.<code>. */
const PAYMENT_METHOD_CODES = ['transferencia', 'tarjeta', 'bizum', 'efectivo', 'domiciliacion']

const TAX_OPTIONS: { value: TaxKind; suggested: number }[] = [
  { value: 'IGIC', suggested: 7 },
  { value: 'IVA', suggested: 21 },
  { value: 'IPSI', suggested: 10 },
  { value: 'EXENTO', suggested: 0 },
  { value: 'OTRO', suggested: 0 },
]

const FLOW_STEPS = ['quote', 'provision', 'advanceInvoice', 'finalInvoice', 'proof', 'paid']

/** Borrador del IBAN compartido con el registro del paso para validar sin persistirlo en JSONB. */
export const ibanDraftRef = { current: '' }

export function BillingSettingsStep({ errors, showErrors, mode }: StepProps) {
  const { t } = useTranslation()
  const ctx = useOnboarding()
  const b = ctx.snapshot?.billing
  const empresa = ctx.snapshot?.empresa
  const empresaId = empresa?.id ?? ''
  const payments = useIntegration('payments')
  // El IBAN nunca se guarda en onboarding_steps.data: solo en empresas.iban (y enmascarado al leer)
  const [ibanDraft, setIbanDraft] = useState('')
  const [showIban, setShowIban] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const err = (k: string) => (showErrors || touched[k] ? errors[k] : undefined)
  const touch = (k: string) => setTouched((t) => ({ ...t, [k]: true }))
  const returnTo = mode === 'wizard' ? onboardingStepPath('billing') : '/empresa?settings=billing'
  const stripe = adapterById('stripe')!
  const canary = useMemo(() => isCanaryIslands(empresa?.province, empresa?.postal_code), [empresa?.province, empresa?.postal_code])

  if (!b) return null

  function patch(p: Partial<BillingSettings>) {
    const next = { ...b!, ...p }
    ctx.patchSnapshot((s) => ({ ...s, billing: next }))
    ctx.scheduleSave('billing', async () => {
      await saveBilling(empresaId, p)
    })
  }

  function setIban(v: string) {
    setIbanDraft(v)
    ibanDraftRef.current = v
    ctx.scheduleSave('billing:iban', async () => {
      await updateEmpresa(empresaId, { iban: normalizeIban(v) || null })
      ctx.patchSnapshot((s) => ({ ...s, empresa: { ...s.empresa, iban_masked: v ? '•'.repeat(Math.max(normalizeIban(v).length - 4, 0)) + normalizeIban(v).slice(-4) : null } }))
    })
  }

  function togglePayment(m: string, on: boolean) {
    const set = new Set(b!.payment_methods)
    if (on) set.add(m)
    else set.delete(m)
    patch({ payment_methods: Array.from(set) })
  }

  const numberField = (label: string, key: keyof BillingSettings, opts: { min?: number; max?: number; hint?: string; errorKey?: string } = {}) => (
    <TextField
      label={label}
      type="number"
      inputMode="numeric"
      min={opts.min}
      max={opts.max}
      value={String(b[key] ?? '')}
      onChange={(e) => patch({ [key]: Number(e.target.value) } as Partial<BillingSettings>)}
      onBlur={() => touch(opts.errorKey ?? key)}
      error={err(opts.errorKey ?? key)}
      hint={opts.hint}
    />
  )

  return (
    <div className="space-y-8">
      {/* Flujo documental */}
      <ol className="grid gap-2 text-xs sm:grid-cols-6" aria-label={t('onboarding.billing.flowLabel')}>
        {FLOW_STEPS.map((s, i) => (
          <li key={s} className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-slate-700">
            <span className="mr-1 font-bold text-brand-600">{i + 1}.</span>
            {t(`onboarding.billing.flow.${s}`)}
          </li>
        ))}
      </ol>
      <p className="-mt-4 text-xs text-slate-500">{t('onboarding.billing.flowNote')}</p>

      {/* Series */}
      <section aria-labelledby="sec-series" className="space-y-3">
        <h2 id="sec-series" className="text-sm font-semibold text-slate-800">
          {t('onboarding.billing.seriesTitle')}
        </h2>
        {err('series') && <p className="text-xs text-red-600" role="alert">{errors.series}</p>}
        {err('numbers') && <p className="text-xs text-red-600" role="alert">{errors.numbers}</p>}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="grid grid-cols-[1fr_100px] gap-2">
            <TextField label={t('onboarding.billing.quoteSeries')} required value={b.quote_series} onChange={(e) => patch({ quote_series: e.target.value.toUpperCase() })} onBlur={() => touch('series')} spellCheck={false} />
            {numberField(t('onboarding.billing.nextNumber'), 'quote_next_number', { min: 1, errorKey: 'numbers' })}
          </div>
          <div className="grid grid-cols-[1fr_100px] gap-2">
            <TextField label={t('onboarding.billing.invoiceSeries')} required value={b.invoice_series} onChange={(e) => patch({ invoice_series: e.target.value.toUpperCase() })} onBlur={() => touch('series')} spellCheck={false} />
            {numberField(t('onboarding.billing.nextNumber'), 'invoice_next_number', { min: 1, errorKey: 'numbers' })}
          </div>
          <div className="grid grid-cols-[1fr_100px] gap-2">
            <TextField label={t('onboarding.billing.advanceSeries')} required value={b.advance_invoice_series} onChange={(e) => patch({ advance_invoice_series: e.target.value.toUpperCase() })} onBlur={() => touch('series')} spellCheck={false} />
            {numberField(t('onboarding.billing.nextNumber'), 'advance_invoice_next', { min: 1, errorKey: 'numbers' })}
          </div>
        </div>
      </section>

      {/* Plazos y anticipo */}
      <section aria-labelledby="sec-terms" className="grid gap-3 sm:grid-cols-3">
        <h2 id="sec-terms" className="text-sm font-semibold text-slate-800 sm:col-span-3">
          {t('onboarding.billing.termsTitle')}
        </h2>
        {numberField(t('onboarding.billing.quoteValidity'), 'quote_validity_days', { min: 1, max: 365 })}
        {numberField(t('onboarding.billing.advance'), 'advance_percentage', { min: 0, max: 100, hint: t('onboarding.billing.advanceHint') })}
        {numberField(t('onboarding.billing.paymentTerms'), 'payment_terms_days', { min: 0, max: 365 })}
      </section>

      {/* Impuestos */}
      <section aria-labelledby="sec-tax" className="space-y-3">
        <h2 id="sec-tax" className="text-sm font-semibold text-slate-800">
          {t('onboarding.billing.taxTitle')}
        </h2>
        {canary && b.tax_type !== 'IGIC' && (
          <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900" role="note">
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {t('onboarding.billing.canaryNote')}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-4">
          <SelectField label={t('onboarding.billing.currency')} required value={b.currency} onChange={(e) => patch({ currency: e.target.value })} error={err('currency')} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
          <SelectField
            label={t('onboarding.billing.taxType')}
            value={b.tax_type}
            onChange={(e) => {
              const kind = e.target.value as TaxKind
              const sug = TAX_OPTIONS.find((o) => o.value === kind)?.suggested ?? b.tax_rate
              patch({ tax_type: kind, tax_rate: kind === 'EXENTO' ? 0 : sug, tax_exempt_reason: kind === 'EXENTO' ? b.tax_exempt_reason : null })
            }}
            options={TAX_OPTIONS.map((o) => ({ value: o.value, label: t(`onboarding.billing.tax.${o.value}`) }))}
          />
          {numberField(t('onboarding.billing.taxRate'), 'tax_rate', { min: 0, max: 100 })}
          {b.tax_type === 'EXENTO' && <TextField label={t('onboarding.billing.exemptReason')} required value={b.tax_exempt_reason ?? ''} onChange={(e) => patch({ tax_exempt_reason: e.target.value })} onBlur={() => touch('tax_exempt_reason')} error={err('tax_exempt_reason')} />}
        </div>
      </section>

      {/* Cobros */}
      <section aria-labelledby="sec-pay" className="space-y-3">
        <h2 id="sec-pay" className="text-sm font-semibold text-slate-800">
          {t('onboarding.billing.paymentsTitle')}
        </h2>
        {err('payment_methods') && <p className="text-xs text-red-600" role="alert">{errors.payment_methods}</p>}
        <div className="grid gap-2 sm:grid-cols-3">
          {PAYMENT_METHOD_CODES.map((m) => (
            <CheckboxField key={m} checked={b.payment_methods.includes(m)} onChange={(c) => togglePayment(m, c)} label={t(`onboarding.billing.payment.${m}`)} />
          ))}
        </div>
        <TextField
          label={t('onboarding.billing.iban')}
          type={showIban ? 'text' : 'password'}
          autoComplete="off"
          value={ibanDraft}
          placeholder={empresa?.iban_masked ?? 'ES00 0000 0000 0000 0000 0000'}
          onChange={(e) => setIban(e.target.value)}
          onBlur={() => touch('iban')}
          error={showErrors || touched.iban ? errors.iban : undefined}
          hint={empresa?.iban_masked ? t('onboarding.billing.ibanSaved', { masked: empresa.iban_masked }) : t('onboarding.billing.ibanHint')}
          spellCheck={false}
          trailing={
            <button type="button" onClick={() => setShowIban((s) => !s)} className="rounded-md p-1 text-slate-400 hover:text-slate-600" aria-label={showIban ? t('onboarding.billing.hideIban') : t('onboarding.billing.showIban')} aria-pressed={showIban}>
              {showIban ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          }
        />
        {b.payment_methods.includes('tarjeta') && (
          <IntegrationCard adapter={stripe} actions={payments} settings={{ currency: b.currency }} returnTo={returnTo} />
        )}
      </section>

      {/* Políticas */}
      <section aria-labelledby="sec-policy" className="space-y-3">
        <h2 id="sec-policy" className="text-sm font-semibold text-slate-800">
          {t('onboarding.billing.policyTitle')}
        </h2>
        <ToggleField label={t('onboarding.billing.paymentReminders')} description={t('onboarding.billing.paymentRemindersDescription')} checked={b.reminders.enabled} onChange={(c) => patch({ reminders: { ...b.reminders, enabled: c } })} />
        {b.reminders.enabled && (
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label={t('onboarding.billing.daysBefore')} value={b.reminders.days_before_due.join(', ')} onChange={(e) => patch({ reminders: { ...b.reminders, days_before_due: e.target.value.split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n >= 0) } })} hint={t('onboarding.billing.daysBeforeHint')} />
            <TextField label={t('onboarding.billing.daysAfter')} value={b.reminders.days_after_due.join(', ')} onChange={(e) => patch({ reminders: { ...b.reminders, days_after_due: e.target.value.split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n >= 0) } })} />
          </div>
        )}
        <SelectField
          label={t('onboarding.billing.releasePolicy')}
          value={b.document_release_policy}
          onChange={(e) => patch({ document_release_policy: e.target.value as DocumentReleasePolicy })}
          options={[
            { value: 'on_confirmed_payment', label: t('onboarding.billing.releaseOnPayment') },
            { value: 'on_proof_uploaded', label: t('onboarding.billing.releaseOnProof') },
            { value: 'manual', label: t('onboarding.billing.releaseManual') },
          ]}
        />
        <ToggleField label={t('onboarding.billing.reviewBeforeIssue')} description={t('onboarding.billing.reviewBeforeIssueDescription')} checked={b.review_before_issue} onChange={(c) => patch({ review_before_issue: c })} />
        <TextareaField label={t('onboarding.billing.disclosures')} rows={2} value={empresa?.disclosures ?? ''} onChange={(e) => {
          const v = e.target.value
          ctx.patchSnapshot((s) => ({ ...s, empresa: { ...s.empresa, disclosures: v } }))
          ctx.scheduleSave('billing:disclosures', () => updateEmpresa(empresaId, { disclosures: v || null }))
        }} />
      </section>
    </div>
  )
}
