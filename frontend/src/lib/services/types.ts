// Feblio · Catálogo de servicios y precios por empresa (migración 0018).
// Los precios están versionados por vigencia: cada servicio tiene como mucho una versión aplicable en
// una fecha dada y, opcionalmente, otra programada a futuro.

export const PRICING_MODES = ['fixed', 'hourly', 'per_unit', 'from', 'on_assessment'] as const
export type PricingMode = (typeof PRICING_MODES)[number]

export const TAX_TYPES = ['IVA', 'IGIC', 'IPSI', 'EXENTO', 'OTRO'] as const
export type TaxType = (typeof TAX_TYPES)[number]

export const URGENCY_TYPES = ['none', 'percent', 'fixed'] as const
export type UrgencySurchargeType = (typeof URGENCY_TYPES)[number]

export const PREREQUISITES = ['visit', 'meeting', 'assessment'] as const
export type Prerequisite = (typeof PREREQUISITES)[number]

export const ANSWER_TYPES = ['text', 'yes_no', 'number', 'date', 'choice'] as const
export type AnswerType = (typeof ANSWER_TYPES)[number]

/** Rol interno dentro de la empresa; solo tiene sentido para cuentas con role = 'empresa'. */
export type CompanyRole = 'owner' | 'manager' | 'member'

export interface ServiceCategory {
  id: string
  empresa_id: string
  code: string
  name_es: string
  name_en: string | null
  sort_order: number
  is_active: boolean
}

export interface LabelItem {
  key: string
  label_es: string
  label_en: string | null
  required: boolean
}

export interface QuestionItem {
  key: string
  text_es: string
  text_en: string | null
  answer_type: AnswerType
  required: boolean
}

export interface ActionItem {
  es: string
  en: string | null
}

export interface ExternalCost {
  label_es: string
  label_en: string | null
  amount: number | null
  estimated: boolean
  included: boolean
}

export interface PriceVersion {
  id: string
  service_id: string
  empresa_id: string
  version_no: number
  pricing_mode: PricingMode
  base_price: number | null
  currency: string
  tax_type: TaxType
  tax_rate: number
  tax_note: string | null
  unit: string | null
  min_price: number | null
  max_price: number | null
  urgency_surcharge_type: UrgencySurchargeType
  urgency_surcharge_value: number
  external_costs: ExternalCost[]
  valid_from: string
  valid_to: string | null
  superseded_at: string | null
  note: string | null
  created_at: string
}

/** Fila de services_catalog_v: servicio + versión de precio vigente hoy (+ la próxima programada). */
export interface CatalogRow {
  id: string
  empresa_id: string
  code: string
  category_id: string | null
  category_code: string | null
  category_name_es: string | null
  category_name_en: string | null
  name_es: string
  name_en: string | null
  description_es: string | null
  description_en: string | null
  is_active: boolean
  effective_from: string | null
  effective_to: string | null
  estimated_duration_minutes: number | null
  prerequisites: Prerequisite[]
  requires_human_review: boolean
  min_info: LabelItem[]
  required_documents: LabelItem[]
  client_questions: QuestionItem[]
  included_actions: ActionItem[]
  excluded_actions: ActionItem[]
  usage_count: number
  sort_order: number
  created_at: string
  updated_at: string
  price_version_id: string | null
  version_no: number | null
  pricing_mode: PricingMode | null
  base_price: number | null
  currency: string | null
  tax_type: TaxType | null
  tax_rate: number | null
  tax_note: string | null
  unit: string | null
  min_price: number | null
  max_price: number | null
  urgency_surcharge_type: UrgencySurchargeType | null
  urgency_surcharge_value: number | null
  external_costs: ExternalCost[] | null
  valid_from: string | null
  valid_to: string | null
  next_price_version_id: string | null
  next_valid_from: string | null
  next_pricing_mode: PricingMode | null
  next_base_price: number | null
}

/** Datos económicos de una versión (lo que se envía al crear o cambiar el precio). */
export interface PriceInput {
  pricing_mode: PricingMode
  base_price: string
  currency: string
  tax_type: TaxType
  tax_rate: string
  tax_note?: string
  unit?: string
  min_price?: string
  max_price?: string
  urgency_surcharge_type: UrgencySurchargeType
  urgency_surcharge_value?: string
  external_costs?: ExternalCost[]
  valid_from?: string
  note?: string
}

/** Payload de alta/edición de un servicio. `price` solo se envía si hay que crear o cambiar la versión. */
export interface ServiceInput {
  id?: string
  code: string
  category_id?: string | null
  category_code?: string | null
  name_es: string
  name_en?: string
  description_es?: string
  description_en?: string
  effective_from?: string
  effective_to?: string
  estimated_duration_minutes?: string
  prerequisites: Prerequisite[]
  requires_human_review: boolean
  min_info: LabelItem[]
  required_documents: LabelItem[]
  client_questions: QuestionItem[]
  included_actions: ActionItem[]
  excluded_actions: ActionItem[]
  price?: PriceInput
}

export type ImportAction = 'create' | 'update' | 'new_price_version' | 'error'

export interface ImportRowResult {
  index: number
  code: string | null
  action: ImportAction
  error: string | null
}

export interface ImportResult {
  ok: boolean
  committed: boolean
  total: number
  errors: number
  created?: number
  updated?: number
  new_price_versions?: number
  rows: ImportRowResult[]
}
