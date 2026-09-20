import { useMemo } from 'react'
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
  if (!data.contact_name?.trim()) errs.contact_name = 'Indica tu nombre.'
  if (!data.contact_email?.trim()) errs.contact_email = 'Indica un correo para poder responderte.'
  else if (!validateEmail(data.contact_email).ok) errs.contact_email = 'El correo electrónico no es válido.'
  if (!data.needs?.trim()) errs.needs = 'Cuéntanos qué necesitas.'
  for (const f of visibleFields(vista.template?.fields ?? [], data)) {
    const v = (data[f.key] ?? '').trim()
    if (f.required && !v) errs[f.key] = 'Este campo es obligatorio.'
    else if (f.type === 'email' && v && !validateEmail(v).ok) errs[f.key] = 'El correo electrónico no es válido.'
  }
  for (const c of vista.template?.consents ?? []) if (c.required && !consents[c.key]) errs[`consent:${c.key}`] = 'Debes aceptarlo para enviar.'
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
  const set = (k: string, v: string) => onChange({ ...data, [k]: v })
  const fields = useMemo(() => visibleFields(vista.template?.fields ?? [], data), [vista.template, data])
  const docReqs = vista.requisitos.filter((r) => r.kind === 'document')
  const docsFor = (reqId: string) => vista.documentos.filter((d) => d.requisito_id === reqId)
  const otherDocs = vista.documentos.filter((d) => !d.requisito_id || !docReqs.some((r) => r.id === d.requisito_id))
  const progress = localCompleteness(data, vista)
  const empresaName = vista.empresa?.name ?? 'la empresa'
  let step = 0

  return (
    <div className="space-y-5">
      <ProgressBar value={progress} label="Información aportada" />

      <Section step={++step} title="Tus datos" description="Para que podamos responderte.">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Nombre y apellidos" required value={data.contact_name ?? ''} onChange={(e) => set('contact_name', e.target.value)} error={errors.contact_name} disabled={readOnly} autoComplete="name" className="sm:col-span-2" />
          <TextField label="Correo electrónico" type="email" required value={data.contact_email ?? ''} onChange={(e) => set('contact_email', e.target.value)} error={errors.contact_email} disabled={readOnly} autoComplete="email" inputMode="email" />
          <TextField label="Teléfono" type="tel" value={data.contact_phone ?? ''} onChange={(e) => set('contact_phone', e.target.value)} disabled={readOnly} autoComplete="tel" inputMode="tel" />
        </div>
      </Section>

      <Section step={++step} title="Tu proyecto" description="Cuanto más detalle, antes podremos prepararte una propuesta.">
        <div className="grid gap-4">
          <TextareaField label="Qué necesitas" required rows={4} value={data.needs ?? ''} onChange={(e) => set('needs', e.target.value)} error={errors.needs} disabled={readOnly} placeholder="Describe con tus palabras el trabajo o servicio que buscas." />
          <TextareaField label="Objetivos" rows={3} value={data.objectives ?? ''} onChange={(e) => set('objectives', e.target.value)} disabled={readOnly} placeholder="Qué quieres conseguir con este trabajo." />
          <TextareaField label="Alcance" rows={3} value={data.scope ?? ''} onChange={(e) => set('scope', e.target.value)} disabled={readOnly} placeholder="Qué incluye y qué no; espacios, unidades, tamaño…" />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Plazos" value={data.timeline ?? ''} onChange={(e) => set('timeline', e.target.value)} disabled={readOnly} placeholder="Cuándo necesitas empezar o terminar" />
            <TextField label="Presupuesto orientativo" value={data.budget ?? ''} onChange={(e) => set('budget', e.target.value)} disabled={readOnly} hint="Opcional." placeholder="Por ejemplo, entre 5.000 y 8.000 €" />
          </div>
        </div>
      </Section>

      {fields.length > 0 && (
        <Section step={++step} title={`Preguntas de ${empresaName}`} description="Información específica para tu caso.">
          <div className="grid gap-4">
            {fields.map((f) => {
              const common = { label: f.label, required: f.required, error: errors[f.key], disabled: readOnly }
              if (f.type === 'textarea') return <TextareaField key={f.key} {...common} rows={3} value={data[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} />
              if (f.type === 'select') return <SelectField key={f.key} {...common} value={data[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} options={(f.options ?? []).map((o) => ({ value: o, label: o }))} placeholder="Selecciona una opción…" />
              return <TextField key={f.key} {...common} type={f.type} value={data[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} inputMode={f.type === 'tel' ? 'tel' : f.type === 'number' ? 'decimal' : undefined} />
            })}
          </div>
        </Section>
      )}

      {docReqs.length > 0 && (
        <Section step={++step} title="Documentos" description="Adjunta lo que tengas a mano; puedes añadir el resto más tarde desde este mismo enlace.">
          <ul className="space-y-4">
            {docReqs.map((r) => {
              const files = docsFor(r.id)
              return (
                <li key={r.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-slate-800">{r.label}</p>
                    <span className={`text-xs font-medium ${files.length ? 'text-emerald-700' : 'text-amber-700'}`}>{files.length ? `${files.length} adjunto${files.length > 1 ? 's' : ''}` : 'Pendiente'}</span>
                  </div>
                  {files.length > 0 && (
                    <div className="mt-2">
                      <ClienteDocList token={token} docs={files} empresaName={empresaName} />
                    </div>
                  )}
                  <div className="mt-3">
                    <FileUploader onUpload={(file, mime, ext) => onUpload(file, mime, ext, r.id)} label={files.length ? 'Añadir otro archivo' : 'Adjuntar archivo'} compact />
                  </div>
                </li>
              )
            })}
          </ul>
        </Section>
      )}

      <Section step={++step} title="Otros archivos" description={`Fotos, planos, presupuestos anteriores… cualquier cosa que ayude. Aquí verás también lo que ${empresaName} comparta contigo.`}>
        {otherDocs.length > 0 && (
          <div className="mb-3">
            <ClienteDocList token={token} docs={otherDocs} empresaName={empresaName} />
          </div>
        )}
        <FileUploader onUpload={(file, mime, ext) => onUpload(file, mime, ext, null)} />
      </Section>

      {(vista.template?.consents ?? []).length > 0 && !readOnly && (
        <section aria-label="Consentimientos" className="space-y-2">
          {(vista.template?.consents ?? []).map((c) => (
            <CheckboxField key={c.key} label={c.label} required={c.required} checked={!!consents[c.key]} onChange={(v) => onConsentChange(c.key, v)} error={errors[`consent:${c.key}`]} />
          ))}
        </section>
      )}
    </div>
  )
}
