// Feblio · Validación del editor de servicios (misma semántica que la migración 0018; el servidor
// vuelve a validar todo). Devuelve claves de traducción por campo, como el resto del onboarding.
import type { PriceInput, ServiceInput } from './types'
import { PRICING_MODES, TAX_TYPES, URGENCY_TYPES } from './types'

export type CatalogErrors = Record<string, string>

export const SERVICE_CODE_RE = /^[A-Z0-9][A-Z0-9_-]{1,29}$/
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function normalizeCode(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '-')
    .replace(/-{2,}/g, '-')
    .slice(0, 30)
}

const num = (v: string | undefined): number | null => {
  const s = (v ?? '').trim().replace(',', '.')
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
}

export function validatePrice(price: PriceInput | undefined, today = new Date()): CatalogErrors {
  const e: CatalogErrors = {}
  if (!price) return { 'price.base_price': 'services.errors.invalid_price' }
  if (!PRICING_MODES.includes(price.pricing_mode)) e['price.pricing_mode'] = 'services.errors.invalid_mode'
  const base = num(price.base_price)
  if (price.pricing_mode !== 'on_assessment') {
    if (base === null || Number.isNaN(base) || base < 0) e['price.base_price'] = 'services.errors.invalid_price'
  }
  if (!/^[A-Za-z]{3}$/.test((price.currency ?? '').trim())) e['price.currency'] = 'services.errors.invalid_currency'
  if (!TAX_TYPES.includes(price.tax_type)) e['price.tax_type'] = 'services.errors.invalid_tax'
  const rate = num(price.tax_rate)
  if (rate === null || Number.isNaN(rate) || rate < 0 || rate > 100) e['price.tax_rate'] = 'services.errors.invalid_tax'
  else if (price.tax_type === 'EXENTO' && rate !== 0) e['price.tax_rate'] = 'services.errors.invalid_tax'
  if (['hourly', 'per_unit'].includes(price.pricing_mode) && !(price.unit ?? '').trim()) e['price.unit'] = 'services.errors.invalid_unit'
  const min = num(price.min_price)
  const max = num(price.max_price)
  if (min !== null && (Number.isNaN(min) || min < 0)) e['price.min_price'] = 'services.errors.invalid_range'
  if (max !== null && (Number.isNaN(max) || max < 0)) e['price.max_price'] = 'services.errors.invalid_range'
  if (min !== null && max !== null && !Number.isNaN(min) && !Number.isNaN(max) && max < min) e['price.max_price'] = 'services.errors.invalid_range'
  if (base !== null && !Number.isNaN(base)) {
    if (min !== null && !Number.isNaN(min) && base < min) e['price.base_price'] = 'services.errors.invalid_range'
    if (max !== null && !Number.isNaN(max) && base > max) e['price.base_price'] = 'services.errors.invalid_range'
  }
  if (!URGENCY_TYPES.includes(price.urgency_surcharge_type)) e['price.urgency_surcharge_type'] = 'services.errors.invalid_mode'
  const surcharge = num(price.urgency_surcharge_value)
  if (price.urgency_surcharge_type !== 'none') {
    if (surcharge === null || Number.isNaN(surcharge) || surcharge < 0) e['price.urgency_surcharge_value'] = 'services.errors.invalid_price'
    else if (price.urgency_surcharge_type === 'percent' && surcharge > 100) e['price.urgency_surcharge_value'] = 'services.errors.invalid_price'
  }
  if (price.valid_from) {
    if (!ISO_DATE_RE.test(price.valid_from)) e['price.valid_from'] = 'services.errors.invalid_date'
    else {
      const from = new Date(`${price.valid_from}T00:00:00`)
      const ref = new Date(today.getFullYear(), today.getMonth(), today.getDate())
      if (from < ref) e['price.valid_from'] = 'services.errors.price_past_date'
    }
  }
  return e
}

export function validateService(input: Partial<ServiceInput>, opts: { requirePrice: boolean; today?: Date }): CatalogErrors {
  const e: CatalogErrors = {}
  const code = (input.code ?? '').trim()
  if (!SERVICE_CODE_RE.test(code)) e.code = 'services.errors.invalid_code'
  const name = (input.name_es ?? '').trim()
  if (!name || name.length > 200) e.name_es = 'services.errors.invalid_name'
  for (const field of ['effective_from', 'effective_to'] as const) {
    const v = (input[field] ?? '').trim()
    if (v && !ISO_DATE_RE.test(v)) e[field] = 'services.errors.invalid_date'
  }
  if (input.effective_from && input.effective_to && ISO_DATE_RE.test(input.effective_from) && ISO_DATE_RE.test(input.effective_to)
      && input.effective_to < input.effective_from) {
    e.effective_to = 'services.errors.invalid_date'
  }
  const duration = (input.estimated_duration_minutes ?? '').trim()
  if (duration && (!/^\d+$/.test(duration) || Number(duration) < 1 || Number(duration) > 100000)) {
    e.estimated_duration_minutes = 'services.errors.invalid_duration'
  }
  for (const item of input.min_info ?? []) if (!item.label_es.trim()) e.min_info = 'services.errors.invalid_items'
  for (const item of input.required_documents ?? []) if (!item.label_es.trim()) e.required_documents = 'services.errors.invalid_items'
  for (const q of input.client_questions ?? []) if (!q.text_es.trim()) e.client_questions = 'services.errors.invalid_items'
  for (const a of input.included_actions ?? []) if (!a.es.trim()) e.included_actions = 'services.errors.invalid_items'
  for (const a of input.excluded_actions ?? []) if (!a.es.trim()) e.excluded_actions = 'services.errors.invalid_items'
  if (opts.requirePrice || input.price) Object.assign(e, validatePrice(input.price, opts.today))
  return e
}

/** Quita los campos vacíos para que la RPC reciba solo lo que hay que guardar. */
export function toServicePayload(input: ServiceInput, opts: { withPrice: boolean }): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    code: normalizeCode(input.code),
    name_es: input.name_es.trim(),
    name_en: (input.name_en ?? '').trim(),
    description_es: (input.description_es ?? '').trim(),
    description_en: (input.description_en ?? '').trim(),
    category_id: input.category_id ?? null,
    effective_from: (input.effective_from ?? '').trim(),
    effective_to: (input.effective_to ?? '').trim(),
    estimated_duration_minutes: (input.estimated_duration_minutes ?? '').trim(),
    prerequisites: input.prerequisites ?? [],
    requires_human_review: input.requires_human_review,
    min_info: input.min_info ?? [],
    required_documents: input.required_documents ?? [],
    client_questions: input.client_questions ?? [],
    included_actions: input.included_actions ?? [],
    excluded_actions: input.excluded_actions ?? [],
  }
  if (input.id) payload.id = input.id
  if (opts.withPrice && input.price) {
    payload.price = {
      ...input.price,
      base_price: (input.price.base_price ?? '').trim().replace(',', '.'),
      tax_rate: (input.price.tax_rate ?? '').trim().replace(',', '.'),
      min_price: (input.price.min_price ?? '').trim().replace(',', '.'),
      max_price: (input.price.max_price ?? '').trim().replace(',', '.'),
      urgency_surcharge_value: (input.price.urgency_surcharge_value ?? '').trim().replace(',', '.'),
      currency: (input.price.currency ?? '').trim().toUpperCase(),
      unit: (input.price.unit ?? '').trim(),
      valid_from: (input.price.valid_from ?? '').trim(),
    }
  }
  return payload
}
