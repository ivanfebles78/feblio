import { useCallback, useMemo, useState } from 'react'
import { Building2, Lightbulb, Mail, UserRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CheckboxField, RadioCards, SelectField, TextField } from '../../../components/forms/Field'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { useOnboarding } from '../../../lib/onboarding/OnboardingContext'
import { updateEmpresa, updateProfile } from '../../../lib/onboarding/api'
import { supabase } from '../../../lib/supabase'
import type { EntityType } from '../../../lib/types'
import { COUNTRY_CODES, CURRENCIES, SPAIN_PROVINCES, TIMEZONES, countryLabel, isCanaryIslands } from '../../../lib/onboarding/steps'
import type { CompanyDraft } from '../../../lib/onboarding/validation'
import { validateEmail } from '../../../lib/validation'
import { LANGUAGE_NAME, SUPPORTED_LANGUAGES, applyCompanyLanguage } from '../../../i18n'
import { companyDraftFromSnapshot, draftToEmpresaPatch, draftToProfilePatch } from './companyDraft'
import type { StepProps } from './types'

export function useCompanyDraft() {
  const ctx = useOnboarding()
  const defaults = useCallback(() => companyDraftFromSnapshot(ctx.snapshot) as unknown as Record<string, unknown>, [ctx.snapshot])
  const draft = ctx.getStepData('company', defaults) as unknown as CompanyDraft
  return { ctx, draft, defaults }
}

/** Opciones del idioma predeterminado de la empresa: solo español e inglés, nombres nativos, sin banderas. */
const COMPANY_LANGUAGE_OPTIONS = SUPPORTED_LANGUAGES.map((code) => ({ value: code, label: LANGUAGE_NAME[code] }))

export function CompanyAndOwnerStep({ errors, showErrors }: StepProps) {
  const { t } = useTranslation()
  const { ctx, draft, defaults } = useCompanyDraft()
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [emailChange, setEmailChange] = useState<{ open: boolean; value: string; error?: string; notice?: string; busy: boolean }>({ open: false, value: '', busy: false })
  const empresaId = ctx.snapshot?.empresa.id ?? ''
  const ownerId = ctx.snapshot?.owner?.id ?? ''

  const set = useCallback(
    (patch: Partial<CompanyDraft>) => {
      ctx.updateStepData('company', patch as Record<string, unknown>, defaults)
      const next = { ...draft, ...patch }
      ctx.scheduleSave('company:db', async () => {
        const empresaPatch = draftToEmpresaPatch(next)
        await updateEmpresa(empresaId, empresaPatch)
        if (ownerId) await updateProfile(ownerId, draftToProfilePatch(next))
        ctx.patchSnapshot((s) => ({
          ...s,
          empresa: { ...s.empresa, ...empresaPatch },
          owner: s.owner ? { ...s.owner, ...draftToProfilePatch(next) } : s.owner,
        }))
        // El idioma corporativo guardado se refleja en la interfaz solo si el usuario no eligió uno manualmente
        applyCompanyLanguage(empresaPatch.language)
      })
    },
    [ctx, draft, defaults, empresaId, ownerId],
  )

  const err = (k: keyof CompanyDraft) => (showErrors || touched[k] ? errors[k] : undefined)
  const touch = (k: keyof CompanyDraft) => setTouched((prev) => ({ ...prev, [k]: true }))

  const canarySuggestion = useMemo(
    () => draft.country === 'ES' && isCanaryIslands(draft.province, draft.postal_code) && draft.timezone !== 'Atlantic/Canary',
    [draft.country, draft.province, draft.postal_code, draft.timezone],
  )

  async function changeAccessEmail() {
    const v = validateEmail(emailChange.value)
    if (!v.ok) {
      setEmailChange((s) => ({ ...s, error: v.message }))
      return
    }
    setEmailChange((s) => ({ ...s, busy: true, error: undefined }))
    // Procedimiento seguro de Supabase: envía confirmación al email nuevo (y al actual si está configurado)
    const { error } = await supabase.auth.updateUser({ email: emailChange.value.trim().toLowerCase() })
    if (error) setEmailChange((s) => ({ ...s, busy: false, error: error.message }))
    else setEmailChange({ open: false, value: '', busy: false, notice: t('onboarding.company.emailChangeNotice') })
  }

  return (
    <div className="space-y-8">
      {/* ---------------- Empresa ---------------- */}
      <section aria-labelledby="sec-empresa">
        <h2 id="sec-empresa" className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Building2 className="h-4 w-4 text-brand-600" aria-hidden="true" /> {t('onboarding.company.companyData')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label={t('onboarding.company.legalName')} required autoComplete="organization" value={draft.name} onChange={(e) => set({ name: e.target.value })} onBlur={() => touch('name')} error={err('name')} />
          <TextField label={t('onboarding.company.tradeName')} value={draft.trade_name} onChange={(e) => set({ trade_name: e.target.value })} hint={t('onboarding.company.tradeNameHint')} />
          <div className="sm:col-span-2">
            <RadioCards<EntityType>
              legend={t('onboarding.company.entityType')}
              name="entity_type"
              value={draft.entity_type}
              onChange={(v) => {
                set({ entity_type: v })
                touch('entity_type')
              }}
              options={[
                { value: 'company', label: t('onboarding.company.entityCompany'), description: t('onboarding.company.entityCompanyDescription') },
                { value: 'self_employed', label: t('onboarding.company.entitySelfEmployed'), description: t('onboarding.company.entitySelfEmployedDescription') },
              ]}
              error={err('entity_type')}
            />
          </div>
          <TextField label={t('onboarding.company.taxId')} required value={draft.cif} onChange={(e) => set({ cif: e.target.value })} onBlur={() => touch('cif')} error={err('cif')} spellCheck={false} />
          <TextField label={t('onboarding.company.phone')} type="tel" autoComplete="tel" value={draft.phone} onChange={(e) => set({ phone: e.target.value })} onBlur={() => touch('phone')} error={err('phone')} />
          <TextField label={t('onboarding.company.address')} autoComplete="street-address" className="sm:col-span-2" value={draft.address} onChange={(e) => set({ address: e.target.value })} />
          <SelectField label={t('onboarding.company.country')} autoComplete="country" value={draft.country} onChange={(e) => set({ country: e.target.value })} options={COUNTRY_CODES.map((c) => ({ value: c, label: countryLabel(c) }))} />
          {draft.country === 'ES' ? (
            <SelectField label={t('onboarding.company.province')} autoComplete="address-level1" value={draft.province} onChange={(e) => set({ province: e.target.value })} options={SPAIN_PROVINCES.map((p) => ({ value: p, label: p }))} placeholder={t('onboarding.company.selectPlaceholder')} />
          ) : (
            <TextField label={t('onboarding.company.provinceRegion')} autoComplete="address-level1" value={draft.province} onChange={(e) => set({ province: e.target.value })} />
          )}
          <TextField label={t('onboarding.company.city')} autoComplete="address-level2" value={draft.city} onChange={(e) => set({ city: e.target.value })} />
          <TextField label={t('onboarding.company.postalCode')} autoComplete="postal-code" inputMode="numeric" value={draft.postal_code} onChange={(e) => set({ postal_code: e.target.value })} onBlur={() => touch('postal_code')} error={err('postal_code')} />
          <SelectField label={t('onboarding.company.timezone')} required value={draft.timezone} onChange={(e) => set({ timezone: e.target.value })} onBlur={() => touch('timezone')} error={err('timezone')} options={TIMEZONES.map((tz) => ({ value: tz, label: tz }))} />
          <SelectField
            label={t('onboarding.company.defaultLanguage')}
            value={draft.language}
            onChange={(e) => set({ language: e.target.value })}
            options={COMPANY_LANGUAGE_OPTIONS}
            hint={t('onboarding.company.defaultLanguageHint')}
          />
          <SelectField label={t('onboarding.company.currency')} required value={draft.currency} onChange={(e) => set({ currency: e.target.value })} error={err('currency')} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
          <TextField label={t('onboarding.company.companyEmail')} type="email" autoComplete="email" value={draft.email} onChange={(e) => set({ email: e.target.value })} onBlur={() => touch('email')} error={err('email')} hint={t('onboarding.company.companyEmailHint')} />
          <TextField label={t('onboarding.company.website')} type="url" autoComplete="url" value={draft.website} onChange={(e) => set({ website: e.target.value })} onBlur={() => touch('website')} error={err('website')} />
          <TextField label={t('onboarding.company.logoUrl')} type="url" value={draft.logo_url} onChange={(e) => set({ logo_url: e.target.value })} onBlur={() => touch('logo_url')} error={err('logo_url')} hint={t('onboarding.company.logoUrlHint')} />
          <div className="flex items-end gap-3">
            <TextField label={t('onboarding.company.primaryColor')} value={draft.primary_color} onChange={(e) => set({ primary_color: e.target.value })} onBlur={() => touch('primary_color')} error={err('primary_color')} placeholder="#2563eb" className="flex-1" />
            <label className="mb-[2px] flex h-10 w-12 cursor-pointer items-center justify-center rounded-xl border border-slate-200" style={{ background: /^#[0-9a-fA-F]{6}$/.test(draft.primary_color) ? draft.primary_color : '#ffffff' }}>
              <span className="sr-only">{t('onboarding.company.colorPicker')}</span>
              <input type="color" className="h-0 w-0 opacity-0" value={/^#[0-9a-fA-F]{6}$/.test(draft.primary_color) ? draft.primary_color : '#2563eb'} onChange={(e) => set({ primary_color: e.target.value })} />
            </label>
          </div>
        </div>

        {canarySuggestion && (
          <div className="mt-4 flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 sm:flex-row sm:items-center sm:justify-between" role="note">
            <span className="flex items-start gap-2">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {t('onboarding.company.canaryBefore')} <strong>Atlantic/Canary</strong> {t('onboarding.company.canaryMiddle')} <strong>IGIC</strong> {t('onboarding.company.canaryAfter')}
              </span>
            </span>
            <button type="button" onClick={() => set({ timezone: 'Atlantic/Canary' })} className="self-start rounded-lg bg-amber-600 px-3 py-1.5 font-semibold text-white hover:bg-amber-700 sm:self-auto">
              {t('onboarding.company.applyTimezone')}
            </button>
          </div>
        )}
      </section>

      {/* ---------------- Propietario ---------------- */}
      <section aria-labelledby="sec-owner">
        <h2 id="sec-owner" className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <UserRound className="h-4 w-4 text-brand-600" aria-hidden="true" /> {t('onboarding.company.ownerData')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label={t('onboarding.company.ownerName')} required autoComplete="name" value={draft.owner_full_name} onChange={(e) => set({ owner_full_name: e.target.value })} onBlur={() => touch('owner_full_name')} error={err('owner_full_name')} />
          <div>
            <TextField label={t('onboarding.company.accessEmail')} type="email" value={ctx.snapshot?.owner?.email ?? ''} readOnly disabled hint={t('onboarding.company.accessEmailHint')} />
            <button type="button" onClick={() => setEmailChange((s) => ({ ...s, open: true }))} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
              <Mail className="h-3.5 w-3.5" aria-hidden="true" /> {t('onboarding.company.changeAccessEmail')}
            </button>
            {emailChange.notice && <p className="mt-1 text-xs text-emerald-700" role="status">{emailChange.notice}</p>}
          </div>
          <TextField label={t('onboarding.company.contactEmail')} type="email" autoComplete="email" value={draft.owner_contact_email} onChange={(e) => set({ owner_contact_email: e.target.value })} onBlur={() => touch('owner_contact_email')} error={err('owner_contact_email')} hint={t('onboarding.company.contactEmailHint')} />
          <TextField label={t('onboarding.company.phone')} type="tel" autoComplete="tel" value={draft.owner_phone} onChange={(e) => set({ owner_phone: e.target.value })} onBlur={() => touch('owner_phone')} error={err('owner_phone')} />
          <TextField label={t('onboarding.company.jobTitle')} autoComplete="organization-title" value={draft.owner_job_title} onChange={(e) => set({ owner_job_title: e.target.value })} />
          <CheckboxField className="sm:col-span-2" checked={draft.owner_is_onboarding_owner} onChange={(c) => set({ owner_is_onboarding_owner: c })} label={t('onboarding.company.isOnboardingOwner')} />
        </div>
      </section>

      <ConfirmDialog
        open={emailChange.open}
        title={t('onboarding.company.changeAccessEmail')}
        confirmLabel={t('onboarding.company.sendConfirmation')}
        busy={emailChange.busy}
        onConfirm={changeAccessEmail}
        onCancel={() => setEmailChange({ open: false, value: '', busy: false })}
      >
        <TextField label={t('onboarding.company.newAccessEmail')} type="email" autoComplete="email" value={emailChange.value} onChange={(e) => setEmailChange((s) => ({ ...s, value: e.target.value }))} error={emailChange.error} hint={t('onboarding.company.newAccessEmailHint')} />
      </ConfirmDialog>
    </div>
  )
}
