// Feblio · Editor de un servicio del catálogo (alta y edición). Al guardar, el precio solo genera una
// versión nueva si algún campo económico cambia; la versión anterior queda intacta.
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'
import { CheckboxField, SelectField, TextField, TextareaField, ToggleField } from '../forms/Field'
import { Button } from '../v2/Button'
import { Modal } from '../v2/Modal'
import { currentLanguage } from '../../i18n'
import { priceLabel } from '../../lib/services/format'
import { normalizeCode, validateService, type CatalogErrors } from '../../lib/services/validation'
import {
  ANSWER_TYPES,
  PREREQUISITES,
  PRICING_MODES,
  TAX_TYPES,
  URGENCY_TYPES,
  type ActionItem,
  type CatalogRow,
  type ExternalCost,
  type LabelItem,
  type PriceInput,
  type Prerequisite,
  type QuestionItem,
  type ServiceCategory,
  type ServiceInput,
} from '../../lib/services/types'

export interface ServiceEditorProps {
  open: boolean
  /** Servicio a editar; ausente para un alta nueva. */
  service?: CatalogRow | null
  categories: ServiceCategory[]
  defaults: { currency: string; taxType: string; taxRate: string }
  busy?: boolean
  error?: string | null
  onSave: (input: ServiceInput, opts: { withPrice: boolean }) => void
  onClose: () => void
}

const emptyPrice = (defaults: ServiceEditorProps['defaults']): PriceInput => ({
  pricing_mode: 'fixed',
  base_price: '',
  currency: defaults.currency,
  tax_type: (defaults.taxType as PriceInput['tax_type']) ?? 'IVA',
  tax_rate: defaults.taxRate,
  unit: '',
  min_price: '',
  max_price: '',
  urgency_surcharge_type: 'none',
  urgency_surcharge_value: '',
  external_costs: [],
  valid_from: '',
  note: '',
})

function fromRow(row: CatalogRow, defaults: ServiceEditorProps['defaults']): ServiceInput {
  return {
    id: row.id,
    code: row.code,
    category_id: row.category_id,
    name_es: row.name_es,
    name_en: row.name_en ?? '',
    description_es: row.description_es ?? '',
    description_en: row.description_en ?? '',
    effective_from: row.effective_from ?? '',
    effective_to: row.effective_to ?? '',
    estimated_duration_minutes: row.estimated_duration_minutes ? String(row.estimated_duration_minutes) : '',
    prerequisites: row.prerequisites ?? [],
    requires_human_review: row.requires_human_review,
    min_info: row.min_info ?? [],
    required_documents: row.required_documents ?? [],
    client_questions: row.client_questions ?? [],
    included_actions: row.included_actions ?? [],
    excluded_actions: row.excluded_actions ?? [],
    price: {
      pricing_mode: row.pricing_mode ?? 'fixed',
      base_price: row.base_price === null || row.base_price === undefined ? '' : String(row.base_price),
      currency: row.currency ?? defaults.currency,
      tax_type: (row.tax_type ?? defaults.taxType) as PriceInput['tax_type'],
      tax_rate: row.tax_rate === null || row.tax_rate === undefined ? defaults.taxRate : String(row.tax_rate),
      tax_note: row.tax_note ?? '',
      unit: row.unit ?? '',
      min_price: row.min_price === null || row.min_price === undefined ? '' : String(row.min_price),
      max_price: row.max_price === null || row.max_price === undefined ? '' : String(row.max_price),
      urgency_surcharge_type: row.urgency_surcharge_type ?? 'none',
      urgency_surcharge_value:
        row.urgency_surcharge_value === null || row.urgency_surcharge_value === undefined ? '' : String(row.urgency_surcharge_value),
      external_costs: row.external_costs ?? [],
      valid_from: '',
      note: '',
    },
  }
}

export function ServiceEditor({ open, service, categories, defaults, busy, error, onSave, onClose }: ServiceEditorProps) {
  const { t } = useTranslation()
  const isNew = !service
  const [data, setData] = useState<ServiceInput>(() => (service ? fromRow(service, defaults) : blank(defaults)))
  const [showErrors, setShowErrors] = useState(false)

  useEffect(() => {
    if (open) {
      setData(service ? fromRow(service, defaults) : blank(defaults))
      setShowErrors(false)
    }
  }, [open, service, defaults])

  const errors: CatalogErrors = useMemo(() => validateService(data, { requirePrice: isNew }), [data, isNew])
  const err = (field: string) => (showErrors && errors[field] ? t(errors[field]) : undefined)

  const priceChanged = useMemo(() => {
    if (isNew) return true
    const before = service ? fromRow(service, defaults).price : undefined
    return JSON.stringify(before) !== JSON.stringify(data.price)
  }, [data.price, isNew, service, defaults])

  const set = <K extends keyof ServiceInput>(key: K, value: ServiceInput[K]) => setData((d) => ({ ...d, [key]: value }))
  const setPrice = <K extends keyof PriceInput>(key: K, value: PriceInput[K]) =>
    setData((d) => ({ ...d, price: { ...(d.price ?? emptyPrice(defaults)), [key]: value } }))

  const price = data.price ?? emptyPrice(defaults)
  const preview = priceLabel({
    pricing_mode: price.pricing_mode,
    base_price: price.base_price === '' ? null : Number((price.base_price ?? '').replace(',', '.')),
    currency: price.currency,
    unit: price.unit,
  })

  function submit() {
    setShowErrors(true)
    if (Object.keys(errors).length > 0) return
    onSave(data, { withPrice: isNew || priceChanged })
  }

  return (
    <Modal
      open={open}
      title={isNew ? t('services.editor.newTitle') : t('services.editor.editTitle')}
      description={service ? `${service.code} · ${service.name_es}` : undefined}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('services.actions.cancel')}
          </Button>
          <Button onClick={submit} disabled={busy}>
            {t('services.actions.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            {error}
          </p>
        )}

        <Section title={t('services.editor.sections.identity')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label={t('services.editor.code')}
              hint={isNew ? t('services.editor.codeHint') : undefined}
              value={data.code}
              onChange={(e) => set('code', normalizeCode(e.target.value))}
              disabled={!isNew}
              required
              error={err('code')}
            />
            <SelectField
              label={t('services.editor.category')}
              value={data.category_id ?? ''}
              onChange={(e) => set('category_id', e.target.value || null)}
              placeholder={t('services.editor.noCategory')}
              options={categories.map((c) => ({ value: c.id, label: c.name_es }))}
            />
            <TextField label={t('services.editor.nameEs')} value={data.name_es} required error={err('name_es')} onChange={(e) => set('name_es', e.target.value)} />
            <TextField label={t('services.editor.nameEn')} value={data.name_en ?? ''} onChange={(e) => set('name_en', e.target.value)} />
            <TextareaField label={t('services.editor.descriptionEs')} rows={2} value={data.description_es ?? ''} onChange={(e) => set('description_es', e.target.value)} className="sm:col-span-2" />
            <TextareaField label={t('services.editor.descriptionEn')} rows={2} value={data.description_en ?? ''} onChange={(e) => set('description_en', e.target.value)} className="sm:col-span-2" />
          </div>
        </Section>

        <Section title={t('services.editor.sections.price')}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SelectField
              label={t('services.editor.pricingMode')}
              value={price.pricing_mode}
              onChange={(e) => setPrice('pricing_mode', e.target.value as PriceInput['pricing_mode'])}
              options={PRICING_MODES.map((m) => ({ value: m, label: t(`services.modes.${m}`) }))}
              error={err('price.pricing_mode')}
            />
            <TextField
              label={t('services.editor.basePrice')}
              inputMode="decimal"
              value={price.base_price}
              disabled={price.pricing_mode === 'on_assessment'}
              onChange={(e) => setPrice('base_price', e.target.value)}
              error={err('price.base_price')}
            />
            <TextField label={t('services.editor.currency')} value={price.currency} onChange={(e) => setPrice('currency', e.target.value.toUpperCase())} error={err('price.currency')} />
            <SelectField
              label={t('services.editor.taxType')}
              value={price.tax_type}
              onChange={(e) => setPrice('tax_type', e.target.value as PriceInput['tax_type'])}
              options={TAX_TYPES.map((x) => ({ value: x, label: x }))}
              error={err('price.tax_type')}
            />
            <TextField label={t('services.editor.taxRate')} inputMode="decimal" value={price.tax_rate} onChange={(e) => setPrice('tax_rate', e.target.value)} error={err('price.tax_rate')} />
            <TextField
              label={t('services.editor.unit')}
              hint={t('services.editor.unitHint')}
              value={price.unit ?? ''}
              onChange={(e) => setPrice('unit', e.target.value)}
              error={err('price.unit')}
            />
            <TextField label={t('services.editor.minPrice')} inputMode="decimal" value={price.min_price ?? ''} onChange={(e) => setPrice('min_price', e.target.value)} error={err('price.min_price')} />
            <TextField label={t('services.editor.maxPrice')} inputMode="decimal" value={price.max_price ?? ''} onChange={(e) => setPrice('max_price', e.target.value)} error={err('price.max_price')} />
            <SelectField
              label={t('services.editor.urgency')}
              value={price.urgency_surcharge_type}
              onChange={(e) => setPrice('urgency_surcharge_type', e.target.value as PriceInput['urgency_surcharge_type'])}
              options={URGENCY_TYPES.map((u) => ({ value: u, label: t(`services.urgency.${u}`) }))}
            />
            {price.urgency_surcharge_type !== 'none' && (
              <TextField
                label={t('services.editor.urgencyValue')}
                inputMode="decimal"
                value={price.urgency_surcharge_value ?? ''}
                onChange={(e) => setPrice('urgency_surcharge_value', e.target.value)}
                error={err('price.urgency_surcharge_value')}
              />
            )}
            <TextField
              label={t('services.editor.validFrom')}
              type="date"
              hint={t('services.editor.validFromHint')}
              value={price.valid_from ?? ''}
              onChange={(e) => setPrice('valid_from', e.target.value)}
              error={err('price.valid_from')}
            />
          </div>
          <CostList items={price.external_costs ?? []} onChange={(items) => setPrice('external_costs', items)} />
          <p className="mt-3 text-sm text-slate-600">{t('services.editor.preview', { value: preview })}</p>
          {!isNew && priceChanged && <p className="mt-1 text-sm font-medium text-amber-700">{t('services.editor.willCreateVersion')}</p>}
        </Section>

        <Section title={t('services.editor.sections.requirements')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label={t('services.editor.duration')}
              inputMode="numeric"
              value={data.estimated_duration_minutes ?? ''}
              onChange={(e) => set('estimated_duration_minutes', e.target.value)}
              error={err('estimated_duration_minutes')}
            />
            <fieldset className="sm:col-span-2">
              <legend className="mb-2 text-sm font-medium text-slate-700">{t('services.editor.prerequisites')}</legend>
              <div className="flex flex-wrap gap-4">
                {PREREQUISITES.map((p) => (
                  <CheckboxField
                    key={p}
                    label={t(`services.prerequisites.${p}`)}
                    checked={(data.prerequisites ?? []).includes(p)}
                    onChange={(checked) =>
                      set('prerequisites', (checked ? [...(data.prerequisites ?? []), p] : (data.prerequisites ?? []).filter((x) => x !== p)) as Prerequisite[])
                    }
                  />
                ))}
              </div>
            </fieldset>
            <div className="sm:col-span-2">
              <ToggleField
                label={t('services.editor.requiresHumanReview')}
                checked={data.requires_human_review}
                onChange={(v) => set('requires_human_review', v)}
              />
            </div>
          </div>
          <LabelList title={t('services.editor.minInfo')} items={data.min_info} prefix="i" onChange={(items) => set('min_info', items)} />
          <LabelList title={t('services.editor.requiredDocuments')} items={data.required_documents} prefix="d" onChange={(items) => set('required_documents', items)} />
          <QuestionList items={data.client_questions} onChange={(items) => set('client_questions', items)} />
        </Section>

        <Section title={t('services.editor.sections.scope')}>
          <ActionList title={t('services.editor.includedActions')} items={data.included_actions} onChange={(items) => set('included_actions', items)} />
          <ActionList title={t('services.editor.excludedActions')} items={data.excluded_actions} onChange={(items) => set('excluded_actions', items)} />
        </Section>

        <Section title={t('services.editor.sections.validity')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label={t('services.editor.effectiveFrom')} type="date" value={data.effective_from ?? ''} onChange={(e) => set('effective_from', e.target.value)} error={err('effective_from')} />
            <TextField label={t('services.editor.effectiveTo')} type="date" value={data.effective_to ?? ''} onChange={(e) => set('effective_to', e.target.value)} error={err('effective_to')} />
          </div>
        </Section>
      </div>
    </Modal>
  )
}

function blank(defaults: ServiceEditorProps['defaults']): ServiceInput {
  return {
    code: '',
    name_es: '',
    name_en: '',
    description_es: '',
    description_en: '',
    category_id: null,
    effective_from: '',
    effective_to: '',
    estimated_duration_minutes: '',
    prerequisites: [],
    requires_human_review: true,
    min_info: [],
    required_documents: [],
    client_questions: [],
    included_actions: [],
    excluded_actions: [],
    price: emptyPrice(defaults),
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 p-4">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      {children}
    </section>
  )
}

function RowActions({ onRemove, label }: { onRemove: () => void; label: string }) {
  return (
    <button type="button" onClick={onRemove} aria-label={label} className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600">
      <Trash2 className="h-4 w-4" aria-hidden="true" />
    </button>
  )
}

function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Button variant="ghost" size="sm" leading={<Plus className="h-4 w-4" aria-hidden="true" />} onClick={onClick}>
      {label}
    </Button>
  )
}

function LabelList({ title, items, prefix, onChange }: { title: string; items: LabelItem[]; prefix: string; onChange: (items: LabelItem[]) => void }) {
  const { t } = useTranslation()
  return (
    <div className="mt-4">
      <p className="mb-2 text-sm font-medium text-slate-700">{title}</p>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={`${prefix}${i}`} className="flex flex-wrap items-end gap-2">
            <TextField
              label={t('services.editor.labelEs')}
              className="min-w-[10rem] flex-1"
              value={item.label_es}
              onChange={(e) => onChange(items.map((x, n) => (n === i ? { ...x, label_es: e.target.value } : x)))}
            />
            <TextField
              label={t('services.editor.labelEn')}
              className="min-w-[10rem] flex-1"
              value={item.label_en ?? ''}
              onChange={(e) => onChange(items.map((x, n) => (n === i ? { ...x, label_en: e.target.value } : x)))}
            />
            <CheckboxField label={t('services.editor.required')} checked={item.required} onChange={(c) => onChange(items.map((x, n) => (n === i ? { ...x, required: c } : x)))} />
            <RowActions label={t('services.actions.remove')} onRemove={() => onChange(items.filter((_, n) => n !== i))} />
          </li>
        ))}
      </ul>
      <AddButton label={t('services.actions.add')} onClick={() => onChange([...items, { key: `${prefix}${items.length + 1}`, label_es: '', label_en: '', required: true }])} />
    </div>
  )
}

function QuestionList({ items, onChange }: { items: QuestionItem[]; onChange: (items: QuestionItem[]) => void }) {
  const { t } = useTranslation()
  return (
    <div className="mt-4">
      <p className="mb-2 text-sm font-medium text-slate-700">{t('services.editor.clientQuestions')}</p>
      <ul className="space-y-2">
        {items.map((q, i) => (
          <li key={`q${i}`} className="flex flex-wrap items-end gap-2">
            <TextField label={t('services.editor.itemEs')} className="min-w-[10rem] flex-1" value={q.text_es} onChange={(e) => onChange(items.map((x, n) => (n === i ? { ...x, text_es: e.target.value } : x)))} />
            <TextField label={t('services.editor.itemEn')} className="min-w-[10rem] flex-1" value={q.text_en ?? ''} onChange={(e) => onChange(items.map((x, n) => (n === i ? { ...x, text_en: e.target.value } : x)))} />
            <SelectField
              label={t('services.editor.answerType')}
              className="w-40"
              value={q.answer_type}
              onChange={(e) => onChange(items.map((x, n) => (n === i ? { ...x, answer_type: e.target.value as QuestionItem['answer_type'] } : x)))}
              options={ANSWER_TYPES.map((a) => ({ value: a, label: t(`services.answerTypes.${a}`) }))}
            />
            <RowActions label={t('services.actions.remove')} onRemove={() => onChange(items.filter((_, n) => n !== i))} />
          </li>
        ))}
      </ul>
      <AddButton label={t('services.actions.add')} onClick={() => onChange([...items, { key: `q${items.length + 1}`, text_es: '', text_en: '', answer_type: 'text', required: true }])} />
    </div>
  )
}

function ActionList({ title, items, onChange }: { title: string; items: ActionItem[]; onChange: (items: ActionItem[]) => void }) {
  const { t } = useTranslation()
  return (
    <div className="mt-4">
      <p className="mb-2 text-sm font-medium text-slate-700">{title}</p>
      <ul className="space-y-2">
        {items.map((a, i) => (
          <li key={`a${i}`} className="flex flex-wrap items-end gap-2">
            <TextField label={t('services.editor.itemEs')} className="min-w-[10rem] flex-1" value={a.es} onChange={(e) => onChange(items.map((x, n) => (n === i ? { ...x, es: e.target.value } : x)))} />
            <TextField label={t('services.editor.itemEn')} className="min-w-[10rem] flex-1" value={a.en ?? ''} onChange={(e) => onChange(items.map((x, n) => (n === i ? { ...x, en: e.target.value } : x)))} />
            <RowActions label={t('services.actions.remove')} onRemove={() => onChange(items.filter((_, n) => n !== i))} />
          </li>
        ))}
      </ul>
      <AddButton label={t('services.actions.add')} onClick={() => onChange([...items, { es: '', en: '' }])} />
    </div>
  )
}

function CostList({ items, onChange }: { items: ExternalCost[]; onChange: (items: ExternalCost[]) => void }) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  return (
    <div className="mt-4">
      <p className="mb-2 text-sm font-medium text-slate-700">{t('services.editor.externalCosts')}</p>
      <ul className="space-y-2">
        {items.map((c, i) => (
          <li key={`c${i}`} className="flex flex-wrap items-end gap-2">
            <TextField label={t('services.editor.externalCostLabel')} className="min-w-[10rem] flex-1" value={c.label_es} onChange={(e) => onChange(items.map((x, n) => (n === i ? { ...x, label_es: e.target.value } : x)))} />
            <TextField
              label={t('services.editor.externalCostAmount')}
              className="w-32"
              inputMode="decimal"
              lang={lang}
              value={c.amount === null || c.amount === undefined ? '' : String(c.amount)}
              onChange={(e) => onChange(items.map((x, n) => (n === i ? { ...x, amount: e.target.value === '' ? null : Number(e.target.value.replace(',', '.')) } : x)))}
            />
            <CheckboxField label={t('services.editor.externalCostEstimated')} checked={c.estimated} onChange={(v) => onChange(items.map((x, n) => (n === i ? { ...x, estimated: v } : x)))} />
            <CheckboxField label={t('services.editor.externalCostIncluded')} checked={c.included} onChange={(v) => onChange(items.map((x, n) => (n === i ? { ...x, included: v } : x)))} />
            <RowActions label={t('services.actions.remove')} onRemove={() => onChange(items.filter((_, n) => n !== i))} />
          </li>
        ))}
      </ul>
      <AddButton label={t('services.actions.add')} onClick={() => onChange([...items, { label_es: '', label_en: '', amount: null, estimated: true, included: false }])} />
    </div>
  )
}
