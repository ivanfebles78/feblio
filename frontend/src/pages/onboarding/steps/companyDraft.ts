import type { OnboardingSnapshot } from '../../../lib/onboarding/types'
import type { CompanyDraft } from '../../../lib/onboarding/validation'
import type { EmpresaPatch, ProfilePatch } from '../../../lib/onboarding/api'
import { normalizeTaxId } from '../../../lib/validation'
import { taxTypeForEntity } from '../../../lib/types'

/** Prerrellena el paso 1 con los datos del registro (empresas + profiles). */
export function companyDraftFromSnapshot(s: OnboardingSnapshot | null): CompanyDraft {
  const e = s?.empresa
  const o = s?.owner
  return {
    name: e?.name ?? '',
    trade_name: e?.trade_name ?? '',
    entity_type: (e?.entity_type as CompanyDraft['entity_type']) ?? (e?.tax_type === 'NIF' ? 'self_employed' : e?.tax_type === 'CIF' ? 'company' : ''),
    cif: e?.cif ?? '',
    address: e?.address ?? '',
    country: e?.country ?? 'ES',
    province: e?.province ?? '',
    city: e?.city ?? '',
    postal_code: e?.postal_code ?? '',
    timezone: e?.timezone ?? 'Europe/Madrid',
    language: e?.language ?? 'es',
    currency: e?.currency ?? 'EUR',
    phone: e?.phone ?? '',
    email: e?.email ?? '',
    website: e?.website ?? '',
    logo_url: e?.logo_url ?? '',
    primary_color: e?.primary_color ?? '',
    owner_full_name: o?.full_name ?? '',
    owner_contact_email: o?.contact_email ?? '',
    owner_phone: o?.phone ?? '',
    owner_job_title: o?.job_title ?? '',
    owner_is_onboarding_owner: o?.is_onboarding_owner ?? true,
  }
}

const nul = (v: string) => (v.trim() === '' ? null : v.trim())

export function draftToEmpresaPatch(d: CompanyDraft): EmpresaPatch {
  const entity = d.entity_type || 'company'
  return {
    name: d.name.trim(),
    trade_name: nul(d.trade_name),
    entity_type: entity,
    tax_type: taxTypeForEntity(entity),
    cif: normalizeTaxId(d.cif) || null,
    address: nul(d.address),
    country: d.country || 'ES',
    province: nul(d.province),
    city: nul(d.city),
    postal_code: nul(d.postal_code),
    timezone: d.timezone || 'Europe/Madrid',
    language: d.language || 'es',
    currency: d.currency || 'EUR',
    phone: nul(d.phone),
    email: nul(d.email),
    website: nul(d.website),
    logo_url: nul(d.logo_url),
    primary_color: nul(d.primary_color),
  }
}

export function draftToProfilePatch(d: CompanyDraft): ProfilePatch {
  return {
    full_name: d.owner_full_name.trim(),
    contact_email: nul(d.owner_contact_email),
    phone: nul(d.owner_phone),
    job_title: nul(d.owner_job_title),
    is_onboarding_owner: d.owner_is_onboarding_owner,
  }
}
