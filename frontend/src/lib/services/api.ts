// Feblio · Acceso al catálogo de servicios. Lectura por RLS (solo la empresa de la sesión) y escritura
// exclusivamente por RPC `security definer` (migración 0018): el cliente nunca envía `empresa_id`.
import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '../supabase'
import i18n, { t } from '../../i18n'
import type {
  CatalogRow,
  CompanyRole,
  ImportResult,
  PriceInput,
  PriceVersion,
  ServiceCategory,
  ServiceInput,
} from './types'

export class CatalogApiError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message)
    this.name = 'CatalogApiError'
  }
}

const CODE_RE = /^[a-z_]{3,40}$/

/** Código estable devuelto por el servidor en `details` (0018), si está en el catálogo de traducciones. */
export function catalogErrorCode(error: { details?: unknown } | null | undefined): string | null {
  const details = typeof error?.details === 'string' ? error.details.trim() : ''
  if (!CODE_RE.test(details)) return null
  return i18n.exists(`services.errors.${details}`) ? details : null
}

function friendly(error: PostgrestError | Error | null | undefined, fallback: string): CatalogApiError {
  if (!error) return new CatalogApiError(fallback)
  const msg = error.message ?? ''
  const code = catalogErrorCode(error as { details?: unknown })
  if (code) return new CatalogApiError(t(`services.errors.${code}`), code)
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return new CatalogApiError(t('common.errors.network'), 'network')
  if ((error as PostgrestError).code === 'PGRST202') return new CatalogApiError(t('services.errors.migrationMissing'), 'PGRST202')
  if ((error as PostgrestError).code === '42501') return new CatalogApiError(t('common.errors.permission'), '42501')
  return new CatalogApiError(msg || fallback)
}

async function rpc<T>(fn: string, args: Record<string, unknown>, fallback: string): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw friendly(error, fallback)
  return data as T
}

/* ------------------------------------------------------------------ */
/* Lectura                                                             */
/* ------------------------------------------------------------------ */

export async function listCatalog(): Promise<CatalogRow[]> {
  const { data, error } = await supabase.from('services_catalog_v').select('*').order('sort_order').order('code')
  if (error) throw friendly(error, t('services.errors.loadList'))
  return (data as CatalogRow[]) ?? []
}

export async function listCategories(): Promise<ServiceCategory[]> {
  const { data, error } = await supabase.from('service_categories').select('*').order('sort_order').order('code')
  if (error) throw friendly(error, t('services.errors.loadCategories'))
  return (data as ServiceCategory[]) ?? []
}

export async function listPriceHistory(serviceId: string): Promise<PriceVersion[]> {
  const { data, error } = await supabase
    .from('service_price_versions')
    .select('*')
    .eq('service_id', serviceId)
    .order('version_no', { ascending: false })
  if (error) throw friendly(error, t('services.errors.loadHistory'))
  return (data as PriceVersion[]) ?? []
}

/** Rol interno de la sesión: decide si la interfaz muestra las acciones de escritura. */
export async function currentCompanyRole(): Promise<CompanyRole | null> {
  const { data, error } = await supabase.rpc('current_company_role')
  if (error) return null
  return (data as CompanyRole | null) ?? null
}

export function canManageCatalog(role: CompanyRole | null): boolean {
  return role === 'owner' || role === 'manager'
}

/* ------------------------------------------------------------------ */
/* Escritura (RPC)                                                     */
/* ------------------------------------------------------------------ */

export const upsertCategory = (input: Partial<ServiceCategory>) =>
  rpc<string>('service_category_upsert', { p: input }, t('services.errors.saveCategory'))

export const deleteCategory = (id: string, mode: 'block' | 'clear' | 'reassign' = 'block', reassignTo?: string) =>
  rpc<{ ok: boolean; services_updated: number }>(
    'service_category_delete',
    { p_id: id, p_mode: mode, p_reassign_to: reassignTo ?? null },
    t('services.errors.deleteCategory'),
  )

export const upsertService = (input: ServiceInput) =>
  rpc<{ id: string; code: string; action: string; new_price_version: boolean }>(
    'service_upsert',
    { p: input },
    t('services.errors.saveService'),
  )

export const setServicePrice = (serviceId: string, price: PriceInput) =>
  rpc<{ id: string; version_no: number; valid_from: string }>(
    'service_set_price',
    { p_service: serviceId, p: price },
    t('services.errors.savePrice'),
  )

export const cancelScheduledPrice = (serviceId: string) =>
  rpc<{ ok: boolean; version_no: number }>('service_cancel_scheduled_price', { p_service: serviceId }, t('services.errors.savePrice'))

export const setServiceActive = (serviceId: string, active: boolean) =>
  rpc<{ ok: boolean; is_active: boolean }>('service_set_active', { p_service: serviceId, p_active: active }, t('services.errors.saveService'))

export const deleteService = (serviceId: string) =>
  rpc<{ ok: boolean }>('service_delete', { p_service: serviceId }, t('services.errors.deleteService'))

/** Importación: `commit = false` solo previsualiza (el servidor no escribe nada). */
export const importServices = (rows: unknown[], commit: boolean) =>
  rpc<ImportResult>('services_import', { p_rows: rows, p_commit: commit }, t('services.errors.import'))
