import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { t } from '../../i18n'
import { CheckboxField, SelectField, TextField, TextareaField } from '../forms/Field'
import { ProgressBar } from '../v2/Progress'
import { FileUploader } from './FileUploader'
import { ClienteDocList } from './ClienteDocList'
import { validateEmail } from '../../lib/validation'
import { RulesAnalysisProvider } from '../../lib/solicitudes/analysis'
import type { FormFieldDef } from '../../lib/onboarding/types'
import type { ClienteVista } from '../../lib/solicitudes/types'

export type ClienteFormData = Record<string, string>

/** Campos visibles según condiciones de la plantilla (campo = valor). */
export function visibleFields(fields: FormFieldDef[], data: ClienteFormData): FormFieldDef[] {
  return fields.filter((f) => !f.condition || (data[f.condition.field] ?? '') === f.condition.equals)
}

/** Validación en cliente antes de enviar (el servidor vuelve a comprobar). */
export function validateClienteForm(data: ClienteFormData, vista: ClienteVista, consents: Record<string, boolean>): Record<string, string> {
  const errs: Record<string, string> = {}
  if (!data.contact_name?.trim()) errs.contact_name = t('requests.clientForm.validation.name')
  if (!data.contact_email?.trim()) errs.contact_email = t('requests.clientForm.validation.email')
  else if (!validateEmail(data.contact_email).ok) errs.contact_email = t('requests.clientForm.validation.emailInvalid')
  if (!data.needs?.trim()) errs.needs = t('requests.clientForm.validation.needs')
  for (const f of visibleFields(vista.template?.fields ?? [], data)) {
    const v = (data[f.key] ?? '').trim()
    if (f.required && !v) errs[f.key] = t('requests.clientForm.validation.required')
    else if (f.type === 'email' && v && !validateEmail(v).ok) errs[f.key] = t('requests.clientForm.validation.emailInvalid')
  }
  for (const c of vista.template?.consents ?? []) if (c.required && !consents[c.key]) errs[`consent:${c.key}`] = t('requests.clientForm.validation.consent')
  return errs
}

/** Progreso local (mismas reglas que el servidor) para orientar al cliente mientras rellena. */
export function localCompleteness(data: ClienteFormData, vista: ClienteVista): number {
  const provider = new RulesAnalysisProvider()
  const docsByReq = vista.documentos.map((d) => vista.requisitos.find((r) => r.id === d.requisito_id)?.key).filter((k): k is string => !!k)
  return provider.analyze({
    formData: data,
    contact: { name: data.contact_name ?? vista.solicitud.contact_name, email: data.contact_email ?? vista.solicitud.contact_email },
    templateFields: vista.template?.fields ?? [],
    requiredDocuments: vista.template?.required_documents ?? [],
    requisitos: vista.requisitos.map((r) => ({ key: r.key, label: r.label, kind: r.kind, status: r.status, required: true })),
    documentsByRequisitoKey: docsByReq,
  }).completeness
}

export interface ClienteFormProps {
  /** Token del enlace (solo se usa para pedir descargas al servidor). */
  token: string
  vista: ClienteVista
  data: ClienteFormData
  onChange: (next: ClienteFormData) => void
  consents: Record<string, boolean>
  onConsentChange: (key: string, v: boolean) => void
  errors: Record<string, string>
  readOnly: boolean
  onUpload: (file: File, mime: string, ext: string, requisitoId: string | null) => Promise<void>
}

function Section({ step, title, description, children }: { step: number; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`sec-${step}`} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,.04)] sm:p-6">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white" aria-hidden="true">
          {step}
        </span>
        <div>
          <h2 id={`sec-${step}`} className="text-base font-semibold text-slate-900">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-sm text-slate-600">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

/** Formulario del cliente por secciones, con progreso y adjuntos por documento requerido. */
export function ClienteForm({ token, vista, data, onChange, consents, onConsentChange, errors, readOnly, onUpload }: ClienteFormProps) {
  const { t } = useTranslation()
  const set = (k: string, v: string) => onChange({ ...data, [k]: v })
  const fields = useMemo(() => visibleFields(vista.template?.fields ?? [], data), [vista.template, data])
  const docReqs = vista.requisitos.filter((r) => r.kind === 'document')
  const docsFor = (reqId: string) => vista.documentos.filter((d) => d.requisito_id === reqId)
  const otherDocs = vista.documentos.filter((d) => !d.requisito_id || !docReqs.some((r) => r.id === d.requisito_id))
  const progress = localCompleteness(data, vista)
  const empresaName = vista.empresa?.name ?? t('requests.public.theCompanyLower')
  let step = 0

  return (
    <div className="space-y-5">
      <ProgressBar value={progress} label={t('requests.clientForm.progress')} />

      <Section step={++step} title={t('requests.clientForm.you.title')} description={t('requests.clientForm.you.description')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label={t('requests.clientForm.you.name')} required value={data.contact_name ?? ''} onChange={(e) => set('contact_name', e.target.value)} error={errors.contact_name} disabled={readOnly} autoComplete="name" className="sm:col-span-2" />
          <TextField label={t('requests.clientForm.you.email')} type="email" required value={data.contact_email ?? ''} onChange={(e) => set('contact_email', e.target.value)} error={errors.contact_email} disabled={readOnly} autoComplete="email" inputMode="email" />
          <TextField label={t('requests.clientForm.you.phone')} type="tel" value={data.contact_phone ?? ''} onChange={(e) => set('contact_phone', e.target.value)} disabled={readOnly} autoComplete="tel" inputMode="tel" />
        </div>
      </Section>

      <Section step={++step} title={t('requests.clientForm.project.title')} description={t('requests.clientForm.project.description')}>
        <div className="grid gap-4">
          <TextareaField label={t('requests.clientForm.project.needs')} required rows={4} value={data.needs ?? ''} onChange={(e) => set('needs', e.target.value)} error={errors.needs} disabled={readOnly} placeholder={t('requests.clientForm.project.needsPlaceholder')} />
          <TextareaField label={t('requests.clientForm.project.objectives')} rows={3} value={data.objectives ?? ''} onChange={(e) => set('objectives', e.target.value)} disabled={readOnly} placeholder={t('requests.clientForm.project.objectivesPlaceholder')} />
          <TextareaField label={t('requests.clientForm.project.scope')} rows={3} value={data.scope ?? ''} onChange={(e) => set('scope', e.target.value)} disabled={readOnly} placeholder={t('requests.clientForm.project.scopePlaceholder')} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label={t('requests.clientForm.project.timeline')} value={data.timeline ?? ''} onChange={(e) => set('timeline', e.target.value)} disabled={readOnly} placeholder={t('requests.clientForm.project.timelinePlaceholder')} />
            <TextField label={t('requests.clientForm.project.budget')} value={data.budget ?? ''} onChange={(e) => set('budget', e.target.value)} disabled={readOnly} hint={t('requests.clientForm.project.budgetHint')} placeholder={t('requests.clientForm.project.budgetPlaceholder')} />
          </div>
        </div>
      </Section>

      {fields.length > 0 && (
        <Section step={++step} title={t('requests.clientForm.questions.title', { company: empresaName })} description={t('requests.clientForm.questions.description')}>
          <div className="grid gap-4">
            {fields.map((f) => {
              const common = { label: f.label, required: f.required, error: errors[f.key], disabled: readOnly }
              if (f.type === 'textarea') return <TextareaField key={f.key} {...common} rows={3} value={data[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} />
              if (f.type === 'select') return <SelectField key={f.key} {...common} value={data[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} options={(f.options ?? []).map((o) => ({ value: o, label: o }))} placeholder={t('common.actions.select')} />
              return <TextField key={f.key} {...common} type={f.type} value={data[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} inputMode={f.type === 'tel' ? 'tel' : f.type === 'number' ? 'decimal' : undefined} />
            })}
          </div>
        </Section>
      )}

      {docReqs.length > 0 && (
        <Section step={++step} title={t('requests.clientForm.documents.title')} description={t('requests.clientForm.documents.description')}>
          <ul className="space-y-4">
            {docReqs.map((r) => {
              const files = docsFor(r.id)
              return (
                <li key={r.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-slate-800">{r.label}</p>
                    <span className={`text-xs font-medium ${files.length ? 'text-emerald-700' : 'text-amber-700'}`}>{files.length ? t('requests.clientForm.documents.attached', { count: files.length }) : t('requests.clientForm.documents.pending')}</span>
                  </div>
                  {files.length > 0 && (
                    <div className="mt-2">
                      <ClienteDocList token={token} docs={files} empresaName={empresaName} />
                    </div>
                  )}
                  <div className="mt-3">
                    <FileUploader onUpload={(file, mime, ext) => onUpload(file, mime, ext, r.id)} label={files.length ? t('requests.clientForm.documents.addAnother') : t('requests.clientForm.documents.attach')} compact />
                  </div>
                </li>
              )
            })}
          </ul>
        </Section>
      )}

      <Section step={++step} title={t('requests.clientForm.other.title')} description={t('requests.clientForm.other.description', { company: empresaName })}>
        {otherDocs.length > 0 && (
          <div className="mb-3">
            <ClienteDocList token={token} docs={otherDocs} empresaName={empresaName} />
          </div>
        )}
        <FileUploader onUpload={(file, mime, ext) => onUpload(file, mime, ext, null)} />
      </Section>

      {(vista.template?.consents ?? []).length > 0 && !readOnly && (
        <section aria-label={t('requests.clientForm.consents')} className="space-y-2">
          {(vista.template?.consents ?? []).map((c) => (
            <CheckboxField key={c.key} label={c.label} required={c.required} checked={!!consents[c.key]} onChange={(v) => onConsentChange(c.key, v)} error={errors[`consent:${c.key}`]} />
          ))}
        </section>
      )}
    </div>
  )
}
