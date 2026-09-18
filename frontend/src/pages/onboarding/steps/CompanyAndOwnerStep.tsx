import { useCallback, useMemo, useState } from 'react'
import { Building2, Lightbulb, Mail, UserRound } from 'lucide-react'
import { CheckboxField, RadioCards, SelectField, TextField } from '../../../components/forms/Field'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { useOnboarding } from '../../../lib/onboarding/OnboardingContext'
import { updateEmpresa, updateProfile } from '../../../lib/onboarding/api'
import { supabase } from '../../../lib/supabase'
import { ENTITY_TYPE_LABEL, type EntityType } from '../../../lib/types'
import { COUNTRIES, CURRENCIES, LANGUAGES, SPAIN_PROVINCES, TIMEZONES, isCanaryIslands } from '../../../lib/onboarding/steps'
import type { CompanyDraft } from '../../../lib/onboarding/validation'
import { validateEmail } from '../../../lib/validation'
import { companyDraftFromSnapshot, draftToEmpresaPatch, draftToProfilePatch } from './companyDraft'
import type { StepProps } from './types'

export function useCompanyDraft() {
  const ctx = useOnboarding()
  const defaults = useCallback(() => companyDraftFromSnapshot(ctx.snapshot) as unknown as Record<string, unknown>, [ctx.snapshot])
  const draft = ctx.getStepData('company', defaults) as unknown as CompanyDraft
  return { ctx, draft, defaults }
}

export function CompanyAndOwnerStep({ errors, showErrors }: StepProps) {
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
        await updateEmpresa(empresaId, draftToEmpresaPatch(next))
        if (ownerId) await updateProfile(ownerId, draftToProfilePatch(next))
        ctx.patchSnapshot((s) => ({
          ...s,
          empresa: { ...s.empresa, ...draftToEmpresaPatch(next) },
          owner: s.owner ? { ...s.owner, ...draftToProfilePatch(next) } : s.owner,
        }))
      })
    },
    [ctx, draft, defaults, empresaId, ownerId],
  )

  const err = (k: keyof CompanyDraft) => (showErrors || touched[k] ? errors[k] : undefined)
  const touch = (k: keyof CompanyDraft) => setTouched((t) => ({ ...t, [k]: true }))

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
    else setEmailChange({ open: false, value: '', busy: false, notice: 'Te hemos enviado un enlace de confirmación. El email de acceso cambiará cuando lo confirmes.' })
  }

  return (
    <div className="space-y-8">
      {/* ---------------- Empresa ---------------- */}
      <section aria-labelledby="sec-empresa">
        <h2 id="sec-empresa" className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Building2 className="h-4 w-4 text-brand-600" aria-hidden="true" /> Datos de empresa
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Razón social" required autoComplete="organization" value={draft.name} onChange={(e) => set({ name: e.target.value })} onBlur={() => touch('name')} error={err('name')} />
          <TextField label="Nombre comercial" value={draft.trade_name} onChange={(e) => set({ trade_name: e.target.value })} hint="Si es distinto de la razón social." />
          <div className="sm:col-span-2">
            <RadioCards<EntityType>
              legend="Tipo de titular"
              name="entity_type"
              value={draft.entity_type}
              onChange={(v) => {
                set({ entity_type: v })
                touch('entity_type')
              }}
              options={[
                { value: 'company', label: ENTITY_TYPE_LABEL.company, description: 'Sociedad con CIF' },
                { value: 'self_employed', label: ENTITY_TYPE_LABEL.self_employed, description: 'Persona física con NIF/NIE' },
              ]}
              error={err('entity_type')}
            />
          </div>
          <TextField label="NIF fiscal" required value={draft.cif} onChange={(e) => set({ cif: e.target.value })} onBlur={() => touch('cif')} error={err('cif')} spellCheck={false} />
          <TextField label="Teléfono" type="tel" autoComplete="tel" value={draft.phone} onChange={(e) => set({ phone: e.target.value })} onBlur={() => touch('phone')} error={err('phone')} />
          <TextField label="Dirección fiscal" autoComplete="street-address" className="sm:col-span-2" value={draft.address} onChange={(e) => set({ address: e.target.value })} />
          <SelectField label="País" autoComplete="country" value={draft.country} onChange={(e) => set({ country: e.target.value })} options={COUNTRIES.map((c) => ({ value: c.code, label: c.label }))} />
          {draft.country === 'ES' ? (
            <SelectField label="Provincia" autoComplete="address-level1" value={draft.province} onChange={(e) => set({ province: e.target.value })} options={SPAIN_PROVINCES.map((p) => ({ value: p, label: p }))} placeholder="Selecciona…" />
          ) : (
            <TextField label="Provincia / región" autoComplete="address-level1" value={draft.province} onChange={(e) => set({ province: e.target.value })} />
          )}
          <TextField label="Municipio" autoComplete="address-level2" value={draft.city} onChange={(e) => set({ city: e.target.value })} />
          <TextField label="Código postal" autoComplete="postal-code" inputMode="numeric" value={draft.postal_code} onChange={(e) => set({ postal_code: e.target.value })} onBlur={() => touch('postal_code')} error={err('postal_code')} />
          <SelectField label="Zona horaria" required value={draft.timezone} onChange={(e) => set({ timezone: e.target.value })} onBlur={() => touch('timezone')} error={err('timezone')} options={TIMEZONES.map((t) => ({ value: t, label: t }))} />
          <SelectField label="Idioma" value={draft.language} onChange={(e) => set({ language: e.target.value })} options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))} />
          <SelectField label="Moneda" required value={draft.currency} onChange={(e) => set({ currency: e.target.value })} error={err('currency')} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
          <TextField label="Email general de la empresa" type="email" autoComplete="email" value={draft.email} onChange={(e) => set({ email: e.target.value })} onBlur={() => touch('email')} error={err('email')} hint="Aparece en documentos y comunicaciones. Es distinto del email de acceso." />
          <TextField label="Sitio web" type="url" autoComplete="url" value={draft.website} onChange={(e) => set({ website: e.target.value })} onBlur={() => touch('website')} error={err('website')} />
          <TextField label="URL del logotipo" type="url" value={draft.logo_url} onChange={(e) => set({ logo_url: e.target.value })} onBlur={() => touch('logo_url')} error={err('logo_url')} hint="Imagen pública (PNG/SVG)." />
          <div className="flex items-end gap-3">
            <TextField label="Color principal" value={draft.primary_color} onChange={(e) => set({ primary_color: e.target.value })} onBlur={() => touch('primary_color')} error={err('primary_color')} placeholder="#2563eb" className="flex-1" />
            <label className="mb-[2px] flex h-10 w-12 cursor-pointer items-center justify-center rounded-xl border border-slate-200" style={{ background: /^#[0-9a-fA-F]{6}$/.test(draft.primary_color) ? draft.primary_color : '#ffffff' }}>
              <span className="sr-only">Selector de color</span>
              <input type="color" className="h-0 w-0 opacity-0" value={/^#[0-9a-fA-F]{6}$/.test(draft.primary_color) ? draft.primary_color : '#2563eb'} onChange={(e) => set({ primary_color: e.target.value })} />
            </label>
          </div>
        </div>

        {canarySuggestion && (
          <div className="mt-4 flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 sm:flex-row sm:items-center sm:justify-between" role="note">
            <span className="flex items-start gap-2">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Parece que tu empresa está en Canarias. Sugerencia: zona horaria <strong>Atlantic/Canary</strong> e impuesto <strong>IGIC</strong> (se configura en Facturación).
            </span>
            <button type="button" onClick={() => set({ timezone: 'Atlantic/Canary' })} className="self-start rounded-lg bg-amber-600 px-3 py-1.5 font-semibold text-white hover:bg-amber-700 sm:self-auto">
              Aplicar zona horaria
            </button>
          </div>
        )}
      </section>

      {/* ---------------- Propietario ---------------- */}
      <section aria-labelledby="sec-owner">
        <h2 id="sec-owner" className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <UserRound className="h-4 w-4 text-brand-600" aria-hidden="true" /> Datos del propietario
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Nombre y apellidos" required autoComplete="name" value={draft.owner_full_name} onChange={(e) => set({ owner_full_name: e.target.value })} onBlur={() => touch('owner_full_name')} error={err('owner_full_name')} />
          <div>
            <TextField label="Email de acceso" type="email" value={ctx.snapshot?.owner?.email ?? ''} readOnly disabled hint="Solo se cambia mediante confirmación por correo." />
            <button type="button" onClick={() => setEmailChange((s) => ({ ...s, open: true }))} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
              <Mail className="h-3.5 w-3.5" aria-hidden="true" /> Cambiar email de acceso
            </button>
            {emailChange.notice && <p className="mt-1 text-xs text-emerald-700" role="status">{emailChange.notice}</p>}
          </div>
          <TextField label="Email de contacto" type="email" autoComplete="email" value={draft.owner_contact_email} onChange={(e) => set({ owner_contact_email: e.target.value })} onBlur={() => touch('owner_contact_email')} error={err('owner_contact_email')} hint="Si es distinto del de acceso." />
          <TextField label="Teléfono" type="tel" autoComplete="tel" value={draft.owner_phone} onChange={(e) => set({ owner_phone: e.target.value })} onBlur={() => touch('owner_phone')} error={err('owner_phone')} />
          <TextField label="Cargo" autoComplete="organization-title" value={draft.owner_job_title} onChange={(e) => set({ owner_job_title: e.target.value })} />
          <CheckboxField className="sm:col-span-2" checked={draft.owner_is_onboarding_owner} onChange={(c) => set({ owner_is_onboarding_owner: c })} label="Soy la persona responsable de esta configuración inicial." />
        </div>
      </section>

      <ConfirmDialog
        open={emailChange.open}
        title="Cambiar email de acceso"
        confirmLabel="Enviar confirmación"
        busy={emailChange.busy}
        onConfirm={changeAccessEmail}
        onCancel={() => setEmailChange({ open: false, value: '', busy: false })}
      >
        <TextField label="Nuevo email de acceso" type="email" autoComplete="email" value={emailChange.value} onChange={(e) => setEmailChange((s) => ({ ...s, value: e.target.value }))} error={emailChange.error} hint="Recibirás un enlace para confirmar el cambio. Hasta entonces seguirás entrando con el actual." />
      </ConfirmDialog>
    </div>
  )
}
