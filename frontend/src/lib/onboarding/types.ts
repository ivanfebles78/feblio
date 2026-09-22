import type { Empresa } from '../types'
import type { BusinessHours } from '../validation'

/* ------------------------------------------------------------------ */
/* Pasos                                                                */
/* ------------------------------------------------------------------ */

export type OnboardingStepKey =
  | 'company'
  | 'repository'
  | 'email'
  | 'whatsapp'
  | 'sms'
  | 'voice'
  | 'forms'
  | 'services'
  | 'automation'
  | 'billing'
  | 'review'

export type StepStatus = 'pending' | 'in_progress' | 'completed' | 'skipped' | 'error' | 'requires_attention'

export interface StepError {
  field?: string
  message: string
}

export interface OnboardingStepRow {
  id: string
  empresa_id: string
  step_key: OnboardingStepKey
  status: StepStatus
  data: Record<string, unknown>
  errors: StepError[]
  started_at: string | null
  completed_at: string | null
  skipped_at: string | null
  skipped_reason: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

/* ------------------------------------------------------------------ */
/* Integraciones                                                        */
/* ------------------------------------------------------------------ */

export type IntegrationKind = 'document_repository' | 'email' | 'whatsapp' | 'sms' | 'voice' | 'payments'

export type IntegrationStatus =
  | 'not_configured'
  | 'pending_credentials'
  | 'connecting'
  | 'connected'
  | 'degraded'
  | 'expired'
  | 'error'
  | 'disconnected'

export interface IntegrationConnection {
  id: string
  empresa_id: string
  kind: IntegrationKind
  provider: string | null
  status: IntegrationStatus
  display_name: string | null
  account_identifier: string | null
  settings: Record<string, unknown>
  last_activity_at: string | null
  last_test_at: string | null
  last_test_ok: boolean | null
  last_error: string | null
  last_sync_at: string | null
  token_expires_at: string | null
  connected_at: string | null
  disconnected_at: string | null
  created_at: string
  updated_at: string
}

export interface HealthCheckResult {
  ok: boolean
  message: string
  details?: Record<string, unknown>
  checkedAt: string
}

/* ------------------------------------------------------------------ */
/* Configuraciones                                                      */
/* ------------------------------------------------------------------ */

export type AutomationLevel = 1 | 2 | 3

export interface AutomationSettings {
  empresa_id: string
  level: AutomationLevel
  auto_create_request: boolean
  auto_create_project: boolean
  auto_send_form: boolean
  auto_request_missing_docs: boolean
  auto_schedule_call: boolean
  auto_draft_quote: boolean
  auto_send_quote: boolean
  auto_reminders: boolean
  pause_outside_hours: boolean
  require_human_approval: boolean
  level3_scopes: string[]
  updated_at?: string
}

export type TaxKind = 'IGIC' | 'IVA' | 'IPSI' | 'EXENTO' | 'OTRO'
export type DocumentReleasePolicy = 'on_confirmed_payment' | 'on_proof_uploaded' | 'manual'

export interface BillingSettings {
  empresa_id: string
  quote_series: string
  quote_next_number: number
  invoice_series: string
  invoice_next_number: number
  advance_invoice_series: string
  advance_invoice_next: number
  quote_validity_days: number
  advance_percentage: number
  payment_terms_days: number
  currency: string
  tax_type: TaxKind
  tax_rate: number
  tax_exempt_reason: string | null
  payment_methods: string[]
  payment_gateway: string | null
  reminders: { enabled: boolean; days_before_due: number[]; days_after_due: number[] }
  document_release_policy: DocumentReleasePolicy
  review_before_issue: boolean
  updated_at?: string
}

export interface FolderTemplate {
  id: string
  empresa_id: string
  name: string
  root_pattern: string
  folders: string[]
  is_default: boolean
  created_at: string
  updated_at: string
}

export type FormFieldType = 'text' | 'email' | 'tel' | 'date' | 'select' | 'textarea' | 'number'

export interface FormFieldDef {
  key: string
  label: string
  type: FormFieldType
  required: boolean
  options?: string[]
  /** Muestra el campo solo si otro campo tiene cierto valor */
  condition?: { field: string; equals: string }
}

export interface FormDocDef {
  key: string
  label: string
  required: boolean
}

export interface FormConsentDef {
  key: string
  label: string
  required: boolean
}

export interface IntakeFormTemplate {
  id: string
  empresa_id: string
  key: string
  name: string
  description: string | null
  fields: FormFieldDef[]
  required_documents: FormDocDef[]
  consents: FormConsentDef[]
  link_expiry_days: number
  reminders: { enabled: boolean; after_days: number[] }
  is_default: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

export type ChannelKey = 'email' | 'whatsapp' | 'sms' | 'voice' | 'public_form' | 'manual'

export interface ChannelRule {
  id: string
  empresa_id: string
  channel: ChannelKey
  default_form_template_id: string | null
  form_selection_rule: Record<string, unknown>
  send_message_template: string | null
  rules: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface TestRunStep {
  key: string
  label: string
  ok: boolean
  [k: string]: unknown
}

export interface OnboardingTestRun {
  id: string
  empresa_id: string
  status: 'running' | 'completed' | 'failed' | 'cleaned'
  steps: TestRunStep[]
  created_ids: Record<string, string>
  started_at: string
  completed_at: string | null
  cleaned_at: string | null
}

export interface OnboardingOwner {
  id: string
  email: string
  full_name: string | null
  contact_email: string | null
  phone: string | null
  job_title: string | null
  is_onboarding_owner: boolean
}

export interface Blocker {
  code: string
  step: OnboardingStepKey
  message: string
}

/** Respuesta completa de get_onboarding() */
export interface OnboardingSnapshot {
  empresa: Empresa & { iban_masked: string | null }
  owner: OnboardingOwner | null
  steps: OnboardingStepRow[]
  integrations: IntegrationConnection[]
  automation: AutomationSettings
  billing: BillingSettings
  folder_templates: FolderTemplate[]
  form_templates: IntakeFormTemplate[]
  channel_rules: ChannelRule[]
  consents: { terms_of_service: boolean; privacy_policy: boolean; marketing: boolean }
  last_test_run: OnboardingTestRun | null
}

/* ------------------------------------------------------------------ */
/* Datos por paso (persisten en onboarding_steps.data / settings)       */
/* ------------------------------------------------------------------ */

export type RepositoryProvider = 'google_drive' | 'onedrive' | 'feblio_storage' | 'later'
export interface RepositoryStepData {
  provider: RepositoryProvider
  root_folder_id?: string
  root_folder_name?: string
  folder_template_id?: string
}

export type EmailProvider = 'gmail' | 'm365' | 'feblio_inbox' | 'imap' | 'later'
export interface EmailStepData {
  provider: EmailProvider
  inbound_address: string
  sender_address: string
  sender_name: string
  signature: string
  scope: 'all' | 'labeled'
  labels: string[]
  auto_create_requests: boolean
  prepare_drafts: boolean
  require_approval: boolean
  auto_send: boolean
  imap_host?: string
  imap_port?: number
  smtp_host?: string
  smtp_port?: number
}

export type WhatsAppProvider = 'meta' | 'later'
export interface WhatsAppStepData {
  provider: WhatsAppProvider
  phone_number: string
  business_account_id: string
  phone_number_id: string
  welcome_message: string
  off_hours_message: string
  form_message_template: string
  hours: BusinessHours
  languages: string[]
  escalate_to_human: boolean
  escalation_keywords: string
  consent_text: string
  create_request_rule: 'always' | 'keyword' | 'manual'
}

export type SmsProvider = 'twilio' | 'later'
export interface SmsStepData {
  provider: SmsProvider
  sender_number: string
  reply_number: string
  allowed_countries: string[]
  monthly_limit: number
  form_message_template: string
  reminders_enabled: boolean
  reminder_days: number[]
  opt_out_keyword: string
}

export type VoiceMode = 'manual' | 'integrated' | 'agent' | 'forward' | 'later'
export interface VoiceStepData {
  mode: VoiceMode
  main_number: string
  hours: BusinessHours
  timezone: string
  welcome_message: string
  recording_notice: boolean
  transcription_notice: boolean
  consent_required: boolean
  extensions: { name: string; number: string }[]
  overflow_number: string
  max_wait_seconds: number
  max_duration_minutes: number
  languages: string[]
  transfer_to_employee: boolean
  send_form_via: 'sms' | 'whatsapp' | 'email' | 'none'
  scheduling_enabled: boolean
}

export interface FormsStepData {
  default_template_id: string
}

export interface ReviewStepData {
  confirmed_at?: string
}

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'
