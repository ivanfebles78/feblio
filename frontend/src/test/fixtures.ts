import type { OnboardingSnapshot, OnboardingStepRow } from '../lib/onboarding/types'

export function stepRow(key: OnboardingStepRow['step_key'], data: Record<string, unknown> = {}, status: OnboardingStepRow['status'] = 'pending'): OnboardingStepRow {
  return { id: `s-${key}`, empresa_id: 'e1', step_key: key, status, data, errors: [], started_at: null, completed_at: null, skipped_at: null, skipped_reason: null, updated_by: null, created_at: '', updated_at: '' }
}

export function snapshotFixture(overrides: Partial<OnboardingSnapshot> = {}): OnboardingSnapshot {
  return {
    empresa: { id: 'e1', name: 'RALM, S.L.', cif: 'B12345674', tax_type: 'CIF', entity_type: 'company', logo_url: null, address: null, phone: null, email: null, website: null, iban: null, iban_masked: null, disclosures: null, intake_config: null, created_at: '', timezone: 'Atlantic/Canary', currency: 'EUR', onboarding_status: 'in_progress', onboarding_current_step: 'email' },
    owner: { id: 'u1', email: 'ralm@example.com', full_name: 'Ralm Admin', contact_email: null, phone: null, job_title: null, is_onboarding_owner: true },
    steps: [stepRow('company', {}, 'completed'), stepRow('repository', { provider: 'feblio_storage' }, 'completed'), stepRow('email', { provider: 'feblio_inbox' }, 'in_progress'), stepRow('whatsapp'), stepRow('sms'), stepRow('voice'), stepRow('forms'), stepRow('automation'), stepRow('billing'), stepRow('review')],
    integrations: [],
    automation: { empresa_id: 'e1', level: 1, auto_create_request: true, auto_create_project: false, auto_send_form: false, auto_request_missing_docs: false, auto_schedule_call: false, auto_draft_quote: true, auto_send_quote: false, auto_reminders: false, pause_outside_hours: true, require_human_approval: true, level3_scopes: [] },
    billing: { empresa_id: 'e1', quote_series: 'P', quote_next_number: 1, invoice_series: 'F', invoice_next_number: 1, advance_invoice_series: 'A', advance_invoice_next: 1, quote_validity_days: 30, advance_percentage: 50, payment_terms_days: 30, currency: 'EUR', tax_type: 'IGIC', tax_rate: 7, tax_exempt_reason: null, payment_methods: ['transferencia'], payment_gateway: null, reminders: { enabled: true, days_before_due: [3], days_after_due: [1, 7] }, document_release_policy: 'on_confirmed_payment', review_before_issue: true },
    folder_templates: [],
    form_templates: [],
    channel_rules: [],
    consents: { terms_of_service: true, privacy_policy: true, marketing: false },
    last_test_run: null,
    ...overrides,
  }
}

