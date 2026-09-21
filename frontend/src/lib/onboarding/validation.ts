/**
 * Validación por paso. Funciones puras: reciben el estado y devuelven un mapa
 * campo → mensaje. Se usan para habilitar "Siguiente", mostrar errores junto
 * al campo y decidir si un paso puede completarse.
 */
import { t } from '../../i18n'
import {
  validateBusinessHours,
  validateEmail,
  validateHexColor,
  validateIban,
  validatePercentage,
  validatePersonName,
  validatePhone,
  validateSeries,
  validateTaxId,
  validateTimezone,
  validateUrl,
} from '../validation'
import type {
  AutomationSettings,
  BillingSettings,
  EmailStepData,
  OnboardingSnapshot,
  OnboardingStepKey,
  RepositoryStepData,
  SmsStepData,
  VoiceStepData,
  WhatsAppStepData,
} from './types'

export type FieldErrors = Record<string, string>

export interface CompanyDraft {
  name: string
  trade_name: string
  entity_type: 'company' | 'self_employed' | ''
  cif: string
  address: string
  country: string
  province: string
  city: string
  postal_code: string
  timezone: string
  language: string
  currency: string
  phone: string
  email: string
  website: string
  logo_url: string
  primary_color: string
  owner_full_name: string
  owner_contact_email: string
  owner_phone: string
  owner_job_title: string
  owner_is_onboarding_owner: boolean
}

export function validateCompany(d: CompanyDraft): FieldErrors {
  const e: FieldErrors = {}
  if (!d.name.trim()) e.name = t('onboarding.validation.nameRequired')
  if (!d.entity_type) e.entity_type = t('onboarding.validation.entityTypeRequired')
  const tax = validateTaxId(d.cif)
  if (!tax.ok) e.cif = tax.message!
  const tz = validateTimezone(d.timezone)
  if (!tz.ok) e.timezone = tz.message!
  if (!/^[A-Z]{3}$/.test(d.currency)) e.currency = t('onboarding.validation.currencyInvalidIso')
  if (d.email) {
    const r = validateEmail(d.email)
    if (!r.ok) e.email = r.message!
  }
  const ph = validatePhone(d.phone)
  if (!ph.ok) e.phone = ph.message!
  const url = validateUrl(d.website)
  if (!url.ok) e.website = url.message!
  const logo = validateUrl(d.logo_url)
  if (!logo.ok) e.logo_url = logo.message!
  const color = validateHexColor(d.primary_color)
  if (!color.ok) e.primary_color = color.message!
  if (d.postal_code && !/^[A-Za-z0-9\- ]{3,10}$/.test(d.postal_code)) e.postal_code = t('onboarding.validation.postalCodeInvalid')
  const owner = validatePersonName(d.owner_full_name)
  if (!owner.ok) e.owner_full_name = owner.message!
  if (d.owner_contact_email) {
    const r = validateEmail(d.owner_contact_email)
    if (!r.ok) e.owner_contact_email = r.message!
  }
  const op = validatePhone(d.owner_phone)
  if (!op.ok) e.owner_phone = op.message!
  return e
}

export function validateRepository(d: RepositoryStepData, snapshot: OnboardingSnapshot | null): FieldErrors {
  const e: FieldErrors = {}
  if (!d.provider) e.provider = t('onboarding.validation.chooseOption')
  if (d.provider === 'later') e.provider = t('onboarding.validation.repositoryRequired')
  const conn = snapshot?.integrations.find((i) => i.kind === 'document_repository')
  if ((d.provider === 'google_drive' || d.provider === 'onedrive') && conn?.status !== 'connected') {
    e.connection = t('onboarding.validation.repositoryConnection')
  }
  return e
}

export function validateEmailStep(d: EmailStepData): FieldErrors {
  const e: FieldErrors = {}
  if (d.provider === 'later') return e
  if (d.provider !== 'feblio_inbox') {
    const r = validateEmail(d.inbound_address)
    if (!r.ok) e.inbound_address = r.message!
  }
  if (d.sender_address) {
    const r = validateEmail(d.sender_address)
    if (!r.ok) e.sender_address = r.message!
  }
  if (d.auto_send && !d.sender_address.trim()) e.auto_send = t('onboarding.validation.autoSendNoSender')
  if (d.auto_send && d.require_approval) e.auto_send = t('onboarding.validation.autoSendApproval')
  if (d.scope === 'labeled' && d.labels.filter(Boolean).length === 0) e.labels = t('onboarding.validation.labelsRequired')
  if (d.provider === 'imap') {
    if (!d.imap_host?.trim()) e.imap_host = t('onboarding.validation.imapHostRequired')
    if (!d.smtp_host?.trim()) e.smtp_host = t('onboarding.validation.smtpHostRequired')
    if (d.imap_port && (d.imap_port < 1 || d.imap_port > 65535)) e.imap_port = t('onboarding.validation.portInvalid')
    if (d.smtp_port && (d.smtp_port < 1 || d.smtp_port > 65535)) e.smtp_port = t('onboarding.validation.portInvalid')
  }
  return e
}

export function validateWhatsApp(d: WhatsAppStepData): FieldErrors {
  const e: FieldErrors = {}
  if (d.provider === 'later') return e
  const ph = validatePhone(d.phone_number, { required: true })
  if (!ph.ok) e.phone_number = ph.message!
  if (!/^\d{6,20}$/.test(d.business_account_id.trim())) e.business_account_id = t('onboarding.validation.businessAccountId')
  if (!/^\d{6,20}$/.test(d.phone_number_id.trim())) e.phone_number_id = t('onboarding.validation.phoneNumberId')
  const h = validateBusinessHours(d.hours)
  if (!h.ok) e.hours = h.message!
  if (!d.consent_text.trim()) e.consent_text = t('onboarding.validation.consentTextRequired')
  if (!d.form_message_template.includes('{url}')) e.form_message_template = t('onboarding.validation.templateNeedsUrl')
  return e
}

export function validateSms(d: SmsStepData): FieldErrors {
  const e: FieldErrors = {}
  if (d.provider === 'later') return e
  const s = validatePhone(d.sender_number, { required: true })
  if (!s.ok) e.sender_number = s.message!
  const r = validatePhone(d.reply_number)
  if (!r.ok) e.reply_number = r.message!
  if (d.monthly_limit < 0 || d.monthly_limit > 100000) e.monthly_limit = t('onboarding.validation.monthlyLimitRange')
  if (d.allowed_countries.length === 0) e.allowed_countries = t('onboarding.validation.countriesRequired')
  if (!d.form_message_template.includes('{url}')) e.form_message_template = t('onboarding.validation.templateNeedsUrl')
  if (!d.opt_out_keyword.trim()) e.opt_out_keyword = t('onboarding.validation.optOutRequired')
  return e
}

export function validateVoice(d: VoiceStepData): FieldErrors {
  const e: FieldErrors = {}
  if (d.mode === 'later' || d.mode === 'manual') return e
  const ph = validatePhone(d.main_number, { required: true })
  if (!ph.ok) e.main_number = ph.message!
  const tz = validateTimezone(d.timezone)
  if (!tz.ok) e.timezone = tz.message!
  const h = validateBusinessHours(d.hours)
  if (!h.ok) e.hours = h.message!
  if (d.mode === 'agent' || d.mode === 'integrated') {
    if (!d.recording_notice) e.recording_notice = t('onboarding.validation.recordingNotice')
    if (!d.transcription_notice) e.transcription_notice = t('onboarding.validation.transcriptionNotice')
    if (!d.consent_required) e.consent_required = t('onboarding.validation.consentRequired')
    if (d.max_wait_seconds < 5 || d.max_wait_seconds > 600) e.max_wait_seconds = t('onboarding.validation.waitRange')
    if (d.max_duration_minutes < 1 || d.max_duration_minutes > 120) e.max_duration_minutes = t('onboarding.validation.durationRange')
  }
  const of = validatePhone(d.overflow_number)
  if (!of.ok) e.overflow_number = of.message!
  for (const [i, ext] of d.extensions.entries()) {
    if (!ext.name.trim() || !validatePhone(ext.number, { required: true }).ok) e[`extensions.${i}`] = t('onboarding.validation.extensionIncomplete')
  }
  return e
}

export function validateAutomation(a: AutomationSettings): FieldErrors {
  const e: FieldErrors = {}
  if (a.level === 1 && (a.auto_send_form || a.auto_send_quote)) e.level = t('onboarding.validation.level1DraftsOnly')
  if (a.level < 3 && !a.require_human_approval) e.require_human_approval = t('onboarding.validation.levelsNeedApproval')
  if (a.level === 3 && a.level3_scopes.length === 0) e.level3_scopes = t('onboarding.validation.level3Scopes')
  return e
}

export interface IbanState {
  /** Valor que se está escribiendo (vacío si no se edita) */
  draft: string
  /** Ya hay un IBAN guardado en la empresa */
  saved: boolean
}

export function validateBilling(b: BillingSettings, ibanState: IbanState): FieldErrors {
  const iban = ibanState.draft
  const e: FieldErrors = {}
  const s = validateSeries(b.quote_series, b.invoice_series, b.advance_invoice_series)
  if (!s.ok) e.series = s.message!
  const adv = validatePercentage(b.advance_percentage, t('onboarding.validation.advanceLabel'))
  if (!adv.ok) e.advance_percentage = adv.message!
  const tax = validatePercentage(b.tax_rate, t('onboarding.validation.taxLabel'))
  if (!tax.ok) e.tax_rate = tax.message!
  if (b.tax_type === 'EXENTO' && Number(b.tax_rate) !== 0) e.tax_rate = t('onboarding.validation.exemptRateZero')
  if (b.tax_type === 'EXENTO' && !b.tax_exempt_reason?.trim()) e.tax_exempt_reason = t('onboarding.validation.exemptReason')
  if (b.quote_validity_days < 1 || b.quote_validity_days > 365) e.quote_validity_days = t('onboarding.validation.validityRange')
  if (b.payment_terms_days < 0 || b.payment_terms_days > 365) e.payment_terms_days = t('onboarding.validation.termsRange')
  if ([b.quote_next_number, b.invoice_next_number, b.advance_invoice_next].some((n) => !Number.isInteger(n) || n < 1)) e.numbers = t('onboarding.validation.nextNumbers')
  if (!/^[A-Z]{3}$/.test(b.currency)) e.currency = t('onboarding.validation.currencyInvalid')
  const ib = validateIban(iban)
  if (!ib.ok) e.iban = ib.message!
  if (b.payment_methods.includes('transferencia') && !iban.trim() && !ibanState.saved && !e.iban) e.iban = t('onboarding.validation.ibanForTransfer')
  if (b.payment_methods.length === 0) e.payment_methods = t('onboarding.validation.paymentMethodRequired')
  return e
}

export function hasErrors(e: FieldErrors): boolean {
  return Object.keys(e).length > 0
}

/** Pasos que pueden omitirse desde la UI. */
export const SKIPPABLE: OnboardingStepKey[] = ['repository', 'email', 'whatsapp', 'sms', 'voice']
