import { useState, type FormEvent } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { CheckboxField, SelectField, TextField, TextareaField, ToggleField } from '../../../../components/forms/Field'
import type { FormConsentDef, FormDocDef, FormFieldDef, FormFieldType, IntakeFormTemplate } from '../../../../lib/onboarding/types'

const FIELD_TYPES: { value: FormFieldType; label: string }[] = [
  { value: 'text', label: 'Texto' },
  { value: 'email', label: 'Email' },
  { value: 'tel', label: 'Teléfono' },
  { value: 'number', label: 'Número' },
  { value: 'date', label: 'Fecha' },
  { value: 'select', label: 'Desplegable' },
  { value: 'textarea', label: 'Texto largo' },
]

export type EditableTemplate = Omit<IntakeFormTemplate, 'id' | 'empresa_id' | 'created_at' | 'updated_at' | 'is_default'> & { id?: string }

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}

export function emptyTemplate(): EditableTemplate {
  return {
    key: '',
    name: '',
    description: '',
    fields: [
      { key: 'name', label: 'Nombre o razón social', type: 'text', required: true },
      { key: 'email', label: 'Email', type: 'email', required: true },
    ],
    required_documents: [],
    consents: [{ key: 'privacy', label: 'He leído la política de privacidad y acepto el tratamiento de mis datos.', required: true }],
    link_expiry_days: 30,
    reminders: { enabled: true, after_days: [3, 7] },
    is_active: true,
  }
}

export function validateTemplate(t: EditableTemplate): Record<string, string> {
  const e: Record<string, string> = {}
  if (!t.name.trim()) e.name = 'Indica un nombre.'
  if (!/^[a-z0-9_]{2,40}$/.test(t.key)) e.key = 'Clave: minúsculas, números y guiones bajos (2–40).'
  if (t.fields.length === 0) e.fields = 'Añade al menos un campo.'
  const keys = new Set<string>()
  t.fields.forEach((f, i) => {
    if (!f.label.trim()) e[`field.${i}`] = 'Etiqueta obligatoria.'
    if (!/^[a-z0-9_]{1,40}$/.test(f.key)) e[`field.${i}`] = 'Clave no válida.'
    if (keys.has(f.key)) e[`field.${i}`] = 'Clave repetida.'
    keys.add(f.key)
    if (f.type === 'select' && f.key !== 'project_type' && (!f.options || f.options.length === 0)) e[`field.${i}`] = 'Un desplegable necesita opciones.'
    if (f.condition && !t.fields.some((o) => o.key === f.condition!.field)) e[`field.${i}`] = 'La condición apunta a un campo inexistente.'
  })
  if (!t.fields.some((f) => f.key === 'name')) e.fields = 'Debe existir un campo con clave "name" (nombre del cliente).'
  if (t.link_expiry_days < 1 || t.link_expiry_days > 365) e.link_expiry_days = 'Entre 1 y 365 días.'
  return e
}

interface FormTemplateEditorProps {
  initial: EditableTemplate
  busy: boolean
  onSave: (t: EditableTemplate) => Promise<void>
  onCancel: () => void
}

export function FormTemplateEditor({ initial, busy, onSave, onCancel }: FormTemplateEditorProps) {
  const [t, setT] = useState<EditableTemplate>(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const patch = (p: Partial<EditableTemplate>) => setT((x) => ({ ...x, ...p }))

  function setField(i: number, p: Partial<FormFieldDef>) {
    patch({ fields: t.fields.map((f, idx) => (idx === i ? { ...f, ...p } : f)) })
  }
  function moveField(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= t.fields.length) return
    const next = [...t.fields]
    ;[next[i], next[j]] = [next[j], next[i]]
    patch({ fields: next })
  }
  function setDoc(i: number, p: Partial<FormDocDef>) {
    patch({ required_documents: t.required_documents.map((d, idx) => (idx === i ? { ...d, ...p } : d)) })
  }
  function setConsent(i: number, p: Partial<FormConsentDef>) {
    patch({ consents: t.consents.map((c, idx) => (idx === i ? { ...c, ...p } : c)) })
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const errs = validateTemplate(t)
    setErrors(errs)
    if (Object.keys(errs).length) return
    await onSave(t)
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5 rounded-2xl border border-brand-200 bg-brand-50/30 p-4" aria-label={t.id ? 'Editar formulario' : 'Nuevo formulario'}>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Nombre del formulario"
          required
          value={t.name}
          onChange={(e) => patch({ name: e.target.value, key: t.id ? t.key : slugify(e.target.value) })}
          error={errors.name}
        />
        <TextField label="Clave interna" required value={t.key} onChange={(e) => patch({ key: slugify(e.target.value) })} error={errors.key} disabled={!!t.id} spellCheck={false} />
        <TextareaField label="Descripción" rows={2} value={t.description ?? ''} onChange={(e) => patch({ description: e.target.value })} className="sm:col-span-2" />
      </div>

      {/* Campos */}
      <section aria-labelledby="ed-fields">
        <div className="mb-2 flex items-center justify-between">
          <h4 id="ed-fields" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Campos
          </h4>
          <button type="button" onClick={() => patch({ fields: [...t.fields, { key: `campo_${t.fields.length + 1}`, label: '', type: 'text', required: false }] })} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Añadir campo
          </button>
        </div>
        {errors.fields && <p className="mb-2 text-xs text-red-600" role="alert">{errors.fields}</p>}
        <ul className="space-y-2">
          {t.fields.map((f, i) => (
            <li key={i} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_140px_auto]">
                <TextField label="Etiqueta" value={f.label} onChange={(e) => setField(i, { label: e.target.value, key: f.key.startsWith('campo_') ? slugify(e.target.value) || f.key : f.key })} error={errors[`field.${i}`]} />
                <TextField label="Clave" value={f.key} onChange={(e) => setField(i, { key: slugify(e.target.value) })} spellCheck={false} />
                <SelectField label="Tipo" value={f.type} onChange={(e) => setField(i, { type: e.target.value as FormFieldType })} options={FIELD_TYPES} />
                <div className="flex items-end gap-1 pb-[2px]">
                  <button type="button" onClick={() => moveField(i, -1)} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" aria-label={`Subir campo ${f.label || i + 1}`}>
                    <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => moveField(i, 1)} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" aria-label={`Bajar campo ${f.label || i + 1}`}>
                    <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => patch({ fields: t.fields.filter((_, idx) => idx !== i) })} className="rounded-lg border border-slate-200 p-2 text-slate-400 hover:text-red-500" aria-label={`Quitar campo ${f.label || i + 1}`}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <CheckboxField checked={f.required} onChange={(c) => setField(i, { required: c })} label="Obligatorio" />
                {f.type === 'select' && (
                  <TextField label="Opciones (separadas por ;)" value={(f.options ?? []).join('; ')} onChange={(e) => setField(i, { options: e.target.value.split(';').map((s) => s.trim()).filter(Boolean) })} hint={f.key === 'project_type' ? 'Vacío = usa los tipos de proyecto de la empresa.' : undefined} />
                )}
                <TextField
                  label="Mostrar solo si (campo=valor)"
                  value={f.condition ? `${f.condition.field}=${f.condition.equals}` : ''}
                  onChange={(e) => {
                    const [field, equals] = e.target.value.split('=')
                    setField(i, { condition: field && equals !== undefined ? { field: field.trim(), equals: equals.trim() } : undefined })
                  }}
                  spellCheck={false}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Documentos */}
      <section aria-labelledby="ed-docs">
        <div className="mb-2 flex items-center justify-between">
          <h4 id="ed-docs" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Documentos solicitados
          </h4>
          <button type="button" onClick={() => patch({ required_documents: [...t.required_documents, { key: `doc_${t.required_documents.length + 1}`, label: '', required: true }] })} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Añadir documento
          </button>
        </div>
        {t.required_documents.length === 0 && <p className="text-xs text-slate-400">Sin documentos obligatorios.</p>}
        <ul className="space-y-2">
          {t.required_documents.map((d, i) => (
            <li key={i} className="grid items-end gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-[1fr_auto_auto]">
              <TextField label="Documento" value={d.label} onChange={(e) => setDoc(i, { label: e.target.value, key: slugify(e.target.value) || d.key })} />
              <CheckboxField checked={d.required} onChange={(c) => setDoc(i, { required: c })} label="Obligatorio" className="pb-2" />
              <button type="button" onClick={() => patch({ required_documents: t.required_documents.filter((_, idx) => idx !== i) })} className="mb-[2px] rounded-lg border border-slate-200 p-2 text-slate-400 hover:text-red-500" aria-label={`Quitar documento ${d.label || i + 1}`}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Consentimientos */}
      <section aria-labelledby="ed-consents">
        <div className="mb-2 flex items-center justify-between">
          <h4 id="ed-consents" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Consentimientos
          </h4>
          <button type="button" onClick={() => patch({ consents: [...t.consents, { key: `consent_${t.consents.length + 1}`, label: '', required: false }] })} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Añadir
          </button>
        </div>
        <ul className="space-y-2">
          {t.consents.map((c, i) => (
            <li key={i} className="grid items-end gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-[1fr_auto_auto]">
              <TextField label="Texto" value={c.label} onChange={(e) => setConsent(i, { label: e.target.value })} />
              <CheckboxField checked={c.required} onChange={(v) => setConsent(i, { required: v })} label="Obligatorio" className="pb-2" />
              <button type="button" onClick={() => patch({ consents: t.consents.filter((_, idx) => idx !== i) })} className="mb-[2px] rounded-lg border border-slate-200 p-2 text-slate-400 hover:text-red-500" aria-label={`Quitar consentimiento ${i + 1}`}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Caducidad y recordatorios */}
      <section className="grid gap-3 sm:grid-cols-3">
        <TextField label="Caducidad del enlace (días)" type="number" inputMode="numeric" min={1} max={365} value={t.link_expiry_days} onChange={(e) => patch({ link_expiry_days: Number(e.target.value) })} error={errors.link_expiry_days} />
        <div className="sm:col-span-2">
          <ToggleField label="Recordatorios" description="Reenviar el enlace si no se completa." checked={t.reminders.enabled} onChange={(c) => patch({ reminders: { ...t.reminders, enabled: c } })} />
          {t.reminders.enabled && (
            <TextField label="Días tras el envío (separados por comas)" value={t.reminders.after_days.join(', ')} onChange={(e) => patch({ reminders: { ...t.reminders, after_days: e.target.value.split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0) } })} />
          )}
        </div>
      </section>

      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="btn-primary !py-2.5 text-sm">
          {busy ? 'Guardando…' : 'Guardar formulario'}
        </button>
        <button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
          Cancelar
        </button>
      </div>
    </form>
  )
}
