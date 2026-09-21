import { useState, type FormEvent } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { t as translate } from '../../../../i18n'
import { CheckboxField, SelectField, TextField, TextareaField, ToggleField } from '../../../../components/forms/Field'
import type { FormConsentDef, FormDocDef, FormFieldDef, FormFieldType, IntakeFormTemplate } from '../../../../lib/onboarding/types'

const FIELD_TYPE_KEYS: Record<FormFieldType, string> = {
  text: 'typeText',
  email: 'typeEmail',
  tel: 'typeTel',
  number: 'typeNumber',
  date: 'typeDate',
  select: 'typeSelect',
  textarea: 'typeTextarea',
}
const fieldTypeOptions = () => (Object.keys(FIELD_TYPE_KEYS) as FormFieldType[]).map((value) => ({ value, label: translate(`onboarding.formEditor.${FIELD_TYPE_KEYS[value]}`) }))

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
      { key: 'name', label: translate('onboarding.formEditor.defaultNameField'), type: 'text', required: true },
      { key: 'email', label: translate('onboarding.formEditor.defaultEmailField'), type: 'email', required: true },
    ],
    required_documents: [],
    consents: [{ key: 'privacy', label: translate('onboarding.formEditor.defaultPrivacyConsent'), required: true }],
    link_expiry_days: 30,
    reminders: { enabled: true, after_days: [3, 7] },
    is_active: true,
  }
}

export function validateTemplate(t: EditableTemplate): Record<string, string> {
  const e: Record<string, string> = {}
  if (!t.name.trim()) e.name = translate('onboarding.formEditor.nameRequired')
  if (!/^[a-z0-9_]{2,40}$/.test(t.key)) e.key = translate('onboarding.formEditor.keyInvalid')
  if (t.fields.length === 0) e.fields = translate('onboarding.formEditor.fieldsRequired')
  const keys = new Set<string>()
  t.fields.forEach((f, i) => {
    if (!f.label.trim()) e[`field.${i}`] = translate('onboarding.formEditor.fieldLabelRequired')
    if (!/^[a-z0-9_]{1,40}$/.test(f.key)) e[`field.${i}`] = translate('onboarding.formEditor.fieldKeyInvalid')
    if (keys.has(f.key)) e[`field.${i}`] = translate('onboarding.formEditor.fieldKeyDuplicate')
    keys.add(f.key)
    if (f.type === 'select' && f.key !== 'project_type' && (!f.options || f.options.length === 0)) e[`field.${i}`] = translate('onboarding.formEditor.selectNeedsOptions')
    if (f.condition && !t.fields.some((o) => o.key === f.condition!.field)) e[`field.${i}`] = translate('onboarding.formEditor.conditionMissing')
  })
  if (!t.fields.some((f) => f.key === 'name')) e.fields = translate('onboarding.formEditor.nameFieldRequired')
  if (t.link_expiry_days < 1 || t.link_expiry_days > 365) e.link_expiry_days = translate('onboarding.formEditor.expiryRange')
  return e
}

interface FormTemplateEditorProps {
  initial: EditableTemplate
  busy: boolean
  onSave: (t: EditableTemplate) => Promise<void>
  onCancel: () => void
}

export function FormTemplateEditor({ initial, busy, onSave, onCancel }: FormTemplateEditorProps) {
  const { t: tr } = useTranslation()
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
    <form onSubmit={submit} noValidate className="space-y-5 rounded-2xl border border-brand-200 bg-brand-50/30 p-4" aria-label={t.id ? tr('onboarding.formEditor.editForm') : tr('onboarding.formEditor.newForm')}>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label={tr('onboarding.formEditor.formName')}
          required
          value={t.name}
          onChange={(e) => patch({ name: e.target.value, key: t.id ? t.key : slugify(e.target.value) })}
          error={errors.name}
        />
        <TextField label={tr('onboarding.formEditor.internalKey')} required value={t.key} onChange={(e) => patch({ key: slugify(e.target.value) })} error={errors.key} disabled={!!t.id} spellCheck={false} />
        <TextareaField label={tr('onboarding.formEditor.description')} rows={2} value={t.description ?? ''} onChange={(e) => patch({ description: e.target.value })} className="sm:col-span-2" />
      </div>

      {/* Campos */}
      <section aria-labelledby="ed-fields">
        <div className="mb-2 flex items-center justify-between">
          <h4 id="ed-fields" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {tr('onboarding.formEditor.fields')}
          </h4>
          <button type="button" onClick={() => patch({ fields: [...t.fields, { key: `campo_${t.fields.length + 1}`, label: '', type: 'text', required: false }] })} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> {tr('onboarding.formEditor.addField')}
          </button>
        </div>
        {errors.fields && <p className="mb-2 text-xs text-red-600" role="alert">{errors.fields}</p>}
        <ul className="space-y-2">
          {t.fields.map((f, i) => (
            <li key={i} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_140px_auto]">
                <TextField label={tr('onboarding.formEditor.label')} value={f.label} onChange={(e) => setField(i, { label: e.target.value, key: f.key.startsWith('campo_') ? slugify(e.target.value) || f.key : f.key })} error={errors[`field.${i}`]} />
                <TextField label={tr('onboarding.formEditor.key')} value={f.key} onChange={(e) => setField(i, { key: slugify(e.target.value) })} spellCheck={false} />
                <SelectField label={tr('onboarding.formEditor.type')} value={f.type} onChange={(e) => setField(i, { type: e.target.value as FormFieldType })} options={fieldTypeOptions()} />
                <div className="flex items-end gap-1 pb-[2px]">
                  <button type="button" onClick={() => moveField(i, -1)} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" aria-label={tr('onboarding.formEditor.moveUp', { name: f.label || i + 1 })}>
                    <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => moveField(i, 1)} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" aria-label={tr('onboarding.formEditor.moveDown', { name: f.label || i + 1 })}>
                    <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => patch({ fields: t.fields.filter((_, idx) => idx !== i) })} className="rounded-lg border border-slate-200 p-2 text-slate-400 hover:text-red-500" aria-label={tr('onboarding.formEditor.removeField', { name: f.label || i + 1 })}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <CheckboxField checked={f.required} onChange={(c) => setField(i, { required: c })} label={tr('onboarding.formEditor.required')} />
                {f.type === 'select' && (
                  <TextField label={tr('onboarding.formEditor.options')} value={(f.options ?? []).join('; ')} onChange={(e) => setField(i, { options: e.target.value.split(';').map((s) => s.trim()).filter(Boolean) })} hint={f.key === 'project_type' ? tr('onboarding.formEditor.optionsHint') : undefined} />
                )}
                <TextField
                  label={tr('onboarding.formEditor.condition')}
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
            {tr('onboarding.formEditor.documents')}
          </h4>
          <button type="button" onClick={() => patch({ required_documents: [...t.required_documents, { key: `doc_${t.required_documents.length + 1}`, label: '', required: true }] })} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> {tr('onboarding.formEditor.addDocument')}
          </button>
        </div>
        {t.required_documents.length === 0 && <p className="text-xs text-slate-400">{tr('onboarding.formEditor.noDocuments')}</p>}
        <ul className="space-y-2">
          {t.required_documents.map((d, i) => (
            <li key={i} className="grid items-end gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-[1fr_auto_auto]">
              <TextField label={tr('onboarding.formEditor.document')} value={d.label} onChange={(e) => setDoc(i, { label: e.target.value, key: slugify(e.target.value) || d.key })} />
              <CheckboxField checked={d.required} onChange={(c) => setDoc(i, { required: c })} label={tr('onboarding.formEditor.required')} className="pb-2" />
              <button type="button" onClick={() => patch({ required_documents: t.required_documents.filter((_, idx) => idx !== i) })} className="mb-[2px] rounded-lg border border-slate-200 p-2 text-slate-400 hover:text-red-500" aria-label={tr('onboarding.formEditor.removeDocument', { name: d.label || i + 1 })}>
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
            {tr('onboarding.formEditor.consents')}
          </h4>
          <button type="button" onClick={() => patch({ consents: [...t.consents, { key: `consent_${t.consents.length + 1}`, label: '', required: false }] })} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> {tr('onboarding.formEditor.add')}
          </button>
        </div>
        <ul className="space-y-2">
          {t.consents.map((c, i) => (
            <li key={i} className="grid items-end gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-[1fr_auto_auto]">
              <TextField label={tr('onboarding.formEditor.text')} value={c.label} onChange={(e) => setConsent(i, { label: e.target.value })} />
              <CheckboxField checked={c.required} onChange={(v) => setConsent(i, { required: v })} label={tr('onboarding.formEditor.required')} className="pb-2" />
              <button type="button" onClick={() => patch({ consents: t.consents.filter((_, idx) => idx !== i) })} className="mb-[2px] rounded-lg border border-slate-200 p-2 text-slate-400 hover:text-red-500" aria-label={tr('onboarding.formEditor.removeConsent', { n: i + 1 })}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Caducidad y recordatorios */}
      <section className="grid gap-3 sm:grid-cols-3">
        <TextField label={tr('onboarding.formEditor.linkExpiry')} type="number" inputMode="numeric" min={1} max={365} value={t.link_expiry_days} onChange={(e) => patch({ link_expiry_days: Number(e.target.value) })} error={errors.link_expiry_days} />
        <div className="sm:col-span-2">
          <ToggleField label={tr('onboarding.formEditor.reminders')} description={tr('onboarding.formEditor.remindersDescription')} checked={t.reminders.enabled} onChange={(c) => patch({ reminders: { ...t.reminders, enabled: c } })} />
          {t.reminders.enabled && (
            <TextField label={tr('onboarding.formEditor.reminderDays')} value={t.reminders.after_days.join(', ')} onChange={(e) => patch({ reminders: { ...t.reminders, after_days: e.target.value.split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0) } })} />
          )}
        </div>
      </section>

      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="btn-primary !py-2.5 text-sm">
          {busy ? tr('onboarding.formEditor.saving') : tr('onboarding.formEditor.save')}
        </button>
        <button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
          {tr('onboarding.formEditor.cancel')}
        </button>
      </div>
    </form>
  )
}
