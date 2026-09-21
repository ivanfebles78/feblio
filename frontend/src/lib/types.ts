import { t } from '../i18n'
import { formatCurrency } from './intl'

export type UserRole = 'admin' | 'empresa' | 'cliente'
export const USER_ROLES: readonly UserRole[] = ['admin', 'empresa', 'cliente']

export type ProjectStatus = 'borrador' | 'en_progreso' | 'completado' | 'cancelado'
export const PROJECT_STATUSES: readonly ProjectStatus[] = ['borrador', 'en_progreso', 'completado', 'cancelado']

export type DocumentType =
  | 'presupuesto'
  | 'provision'
  | 'factura'
  | 'contrato'
  | 'otro'
export const DOCUMENT_TYPES: readonly DocumentType[] = ['presupuesto', 'provision', 'factura', 'contrato', 'otro']

export type EntityType = 'company' | 'self_employed'
export const ENTITY_TYPES: readonly EntityType[] = ['company', 'self_employed']
export type TaxType = 'CIF' | 'NIF'

/* ------------------------------------------------------------------ */
/* Etiquetas traducidas: los códigos internos no cambian; el texto se  */
/* resuelve con t() en el momento de uso (nunca al cargar el módulo).  */
/* ------------------------------------------------------------------ */
export function entityTypeLabel(entity: EntityType): string {
  return t(`dashboard.entityType.${entity}`)
}
export function projectStatusLabel(status: ProjectStatus): string {
  return t(`dashboard.projectStatus.${status}`)
}
export function roleLabel(role: UserRole): string {
  return t(`common.roles.${role}`)
}
/** «Presupuesto», «Factura»… */
export function documentTypeLabel(type: DocumentType): string {
  return t(`dashboard.documentType.${type}`)
}
/** «Presupuestos», «Facturas»… (cabeceras de grupo). */
export function documentTypePluralLabel(type: DocumentType): string {
  return t(`dashboard.documentTypePlural.${type}`)
}

/**
 * Mapa de compatibilidad para el código que sigue indexando `LABEL[code]`: cada propiedad
 * es un getter que llama a t() al leerse, así el texto sigue al idioma activo.
 * Preferir las funciones `xxxLabel()` en código nuevo.
 */
function lazyLabelMap<K extends string>(keys: readonly K[], resolve: (key: K) => string): Readonly<Record<K, string>> {
  const map = {} as Record<K, string>
  for (const key of keys) Object.defineProperty(map, key, { get: () => resolve(key), enumerable: true })
  return Object.freeze(map)
}

export const ENTITY_TYPE_LABEL: Readonly<Record<EntityType, string>> = lazyLabelMap(ENTITY_TYPES, entityTypeLabel)

/** Compatibilidad: tax_type sigue usándose en empresas.tax_type. */
export function taxTypeForEntity(entity: EntityType): TaxType {
  return entity === 'company' ? 'CIF' : 'NIF'
}

export interface Profile {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  empresa_id: string | null
  cliente_id: string | null
  contact_email?: string | null
  phone?: string | null
  job_title?: string | null
  is_onboarding_owner?: boolean
}

export type OnboardingStatus = 'not_started' | 'in_progress' | 'completed' | 'requires_attention'

export interface Empresa {
  id: string
  name: string
  cif: string | null
  tax_type: string | null
  entity_type?: EntityType | null
  trade_name?: string | null
  logo_url: string | null
  address: string | null
  country?: string
  province?: string | null
  city?: string | null
  postal_code?: string | null
  timezone?: string
  language?: string
  currency?: string
  primary_color?: string | null
  phone: string | null
  email: string | null
  website: string | null
  iban: string | null
  disclosures: string | null
  intake_config: { project_types?: string[] } | null
  email_verified?: boolean
  trial_ends_at?: string | null
  subscription_status?: string
  onboarding_status?: OnboardingStatus
  onboarding_current_step?: string | null
  onboarding_started_at?: string | null
  onboarding_completed_at?: string | null
  onboarding_version?: number
  created_at: string
  updated_at?: string
}

export interface Template {
  id: string
  empresa_id: string
  type: DocumentType
  name: string
  content: Record<string, unknown>
  is_default: boolean
  created_at: string
}

export interface ClientIntake {
  id: string
  empresa_id: string
  token: string
  status: 'pendiente' | 'completado'
  client_email: string | null
  submitted: Record<string, unknown> | null
  cliente_id: string | null
  form_template_id?: string | null
  channel?: string | null
  expires_at?: string | null
  is_test?: boolean
  created_at: string
  completed_at: string | null
}

export interface Task {
  id: string
  empresa_id: string
  type: string
  title: string
  detail: string | null
  priority: number
  status: 'pendiente' | 'resuelto'
  related_id: string | null
  is_test?: boolean
  created_at: string
  resolved_at: string | null
}

/** Tipos de documento con plantilla editable (etiqueta: `documentTypePluralLabel(type)`). */
export const TEMPLATE_TYPES: readonly DocumentType[] = ['presupuesto', 'provision', 'factura']

export interface Cliente {
  id: string
  empresa_id: string
  name: string
  email: string | null
  phone: string | null
  is_test?: boolean
  created_at: string
}

export interface Project {
  id: string
  empresa_id: string
  cliente_id: string | null
  name: string
  status: ProjectStatus
  budget_total: number
  invoiced: number
  provision_funds: number
  pending_payments: number
  progress: number
  is_test?: boolean
  created_at: string
}

export interface DocumentRow {
  id: string
  empresa_id: string
  project_id: string | null
  type: DocumentType
  name: string
  amount: number | null
  status: string | null
  storage_path: string | null
  created_at: string
}

export const ROLE_LABEL: Readonly<Record<UserRole, string>> = lazyLabelMap(USER_ROLES, roleLabel)

export const STATUS_LABEL: Readonly<Record<ProjectStatus, string>> = lazyLabelMap(PROJECT_STATUSES, projectStatusLabel)

/** Compatibilidad: importe en EUR con el formato del idioma activo (delega en lib/intl). */
export function formatEUR(n: number | null | undefined): string {
  return formatCurrency(n ?? 0)
}
