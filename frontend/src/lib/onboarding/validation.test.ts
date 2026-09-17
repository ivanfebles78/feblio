import { describe, expect, it } from 'vitest'
import { validateAutomation, validateBilling, validateCompany, validateEmailStep, validateVoice, type CompanyDraft } from './validation'
import { defaultEmailData, defaultVoiceData, firstOpenStep, isCanaryIslands, nextStepKey, prevStepKey } from './steps'
import type { AutomationSettings, BillingSettings } from './types'

const company: CompanyDraft = {
  name: 'RALM, S.L.', trade_name: 'RALM', entity_type: 'company', cif: 'B12345674', address: '', country: 'ES', province: 'Las Palmas', city: '', postal_code: '35001',
  timezone: 'Atlantic/Canary', language: 'es', currency: 'EUR', phone: '', email: '', website: '', logo_url: '', primary_color: '',
  owner_full_name: 'Ana Pérez', owner_contact_email: '', owner_phone: '', owner_job_title: '', owner_is_onboarding_owner: true,
}

describe('paso empresa', () => {
  it('acepta datos válidos y detecta Canarias por provincia o código postal', () => {
    expect(validateCompany(company)).toEqual({})
    expect(isCanaryIslands('Las Palmas', null)).toBe(true)
    expect(isCanaryIslands(null, '38001')).toBe(true)
    expect(isCanaryIslands('Madrid', '28001')).toBe(false)
  })
  it('exige NIF válido, zona horaria y nombre del propietario', () => {
    const e = validateCompany({ ...company, cif: '123', timezone: 'X/Y', owner_full_name: 'Ana' })
    expect(e.cif).toBeTruthy()
    expect(e.timezone).toBeTruthy()
    expect(e.owner_full_name).toBeTruthy()
  })
})

describe('paso email', () => {
  it('no permite envío automático sin remitente ni con aprobación requerida', () => {
    const d = { ...defaultEmailData(), provider: 'gmail' as const, inbound_address: 'in@ralm.es', auto_send: true, require_approval: false }
    expect(validateEmailStep(d).auto_send).toMatch(/remitente/)
    expect(validateEmailStep({ ...d, sender_address: 'out@ralm.es', require_approval: true }).auto_send).toMatch(/aprobación/)
    expect(validateEmailStep({ ...d, sender_address: 'out@ralm.es' })).toEqual({})
  })
  it('"configurar más adelante" nunca tiene errores', () => {
    expect(validateEmailStep({ ...defaultEmailData(), provider: 'later' })).toEqual({})
  })
})

describe('paso llamadas', () => {
  it('la voz automatizada exige avisos de grabación, transcripción y consentimiento', () => {
    const d = { ...defaultVoiceData('Europe/Madrid'), mode: 'agent' as const, main_number: '+34900000000', recording_notice: false, transcription_notice: false, consent_required: false }
    const e = validateVoice(d)
    expect(e.recording_notice).toBeTruthy()
    expect(e.transcription_notice).toBeTruthy()
    expect(e.consent_required).toBeTruthy()
    expect(validateVoice({ ...d, recording_notice: true, transcription_notice: true, consent_required: true })).toEqual({})
  })
  it('el registro manual no exige nada', () => {
    expect(validateVoice({ ...defaultVoiceData(), mode: 'manual' })).toEqual({})
  })
})

describe('paso automatización', () => {
  const base: AutomationSettings = { empresa_id: 'e', level: 1, auto_create_request: true, auto_create_project: false, auto_send_form: false, auto_request_missing_docs: false, auto_schedule_call: false, auto_draft_quote: true, auto_send_quote: false, auto_reminders: false, pause_outside_hours: true, require_human_approval: true, level3_scopes: [] }
  it('nivel 1 solo borradores; niveles 1-2 requieren aprobación; nivel 3 exige procesos', () => {
    expect(validateAutomation(base)).toEqual({})
    expect(validateAutomation({ ...base, auto_send_form: true }).level).toBeTruthy()
    expect(validateAutomation({ ...base, level: 2, require_human_approval: false }).require_human_approval).toBeTruthy()
    expect(validateAutomation({ ...base, level: 3, require_human_approval: false }).level3_scopes).toBeTruthy()
    expect(validateAutomation({ ...base, level: 3, require_human_approval: false, level3_scopes: ['enviar_formulario'] })).toEqual({})
  })
})

describe('paso facturación', () => {
  const b: BillingSettings = { empresa_id: 'e', quote_series: 'P', quote_next_number: 1, invoice_series: 'F', invoice_next_number: 1, advance_invoice_series: 'A', advance_invoice_next: 1, quote_validity_days: 30, advance_percentage: 50, payment_terms_days: 30, currency: 'EUR', tax_type: 'IGIC', tax_rate: 7, tax_exempt_reason: null, payment_methods: ['transferencia'], payment_gateway: null, reminders: { enabled: true, days_before_due: [3], days_after_due: [1] }, document_release_policy: 'on_confirmed_payment', review_before_issue: true }
  it('anticipo entre 0 y 100, series únicas, exención coherente e IBAN si hay transferencia', () => {
    expect(validateBilling(b, { draft: '', saved: true })).toEqual({})
    expect(validateBilling({ ...b, advance_percentage: 120 }, { draft: '', saved: true }).advance_percentage).toBeTruthy()
    expect(validateBilling({ ...b, invoice_series: 'P' }, { draft: '', saved: true }).series).toBeTruthy()
    expect(validateBilling({ ...b, tax_type: 'EXENTO', tax_rate: 7 }, { draft: '', saved: true }).tax_rate).toBeTruthy()
    expect(validateBilling(b, { draft: '', saved: false }).iban).toMatch(/IBAN/)
    expect(validateBilling(b, { draft: 'ES91 2100 0418 4502 0005 1332', saved: false })).toEqual({})
    expect(validateBilling(b, { draft: 'ES00 0000', saved: false }).iban).toBeTruthy()
  })
})

describe('navegación de pasos', () => {
  it('reanuda por el primer paso abierto', () => {
    expect(firstOpenStep({ company: 'completed', repository: 'skipped' })).toBe('email')
    expect(firstOpenStep({})).toBe('company')
  })
  it('anterior/siguiente', () => {
    expect(nextStepKey('company')).toBe('repository')
    expect(prevStepKey('company')).toBeNull()
    expect(nextStepKey('review')).toBeNull()
  })
})
