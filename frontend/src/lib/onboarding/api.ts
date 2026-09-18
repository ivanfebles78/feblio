/**
 * Acceso a Supabase para el onboarding. Toda la lógica de tenant y validación
 * vive en RPCs SECURITY DEFINER (migración 0009); aquí solo se llaman y se
 * traducen los errores a mensajes accionables en español.
 */
import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '../supabase'
import type { Empresa, Profile } from '../types'
import type {
  AutomationSettings,
  BillingSettings,
  Blocker,
  ChannelRule,
  FolderTemplate,
  IntakeFormTemplate,
  IntegrationConnection,
  IntegrationKind,
  IntegrationStatus,
  OnboardingSnapshot,
  OnboardingStepKey,
  OnboardingStepRow,
  StepStatus,
} from './types'

export class OnboardingApiError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message)
    this.name = 'OnboardingApiError'
  }
}

function friendly(error: PostgrestError | Error | null | undefined, fallback: string): OnboardingApiError {
  if (!error) return new OnboardingApiError(fallback)
  const msg = error.message ?? ''
  const code = 'code' in error ? (error as PostgrestError).code : undefined
  if (code === '42501' || /permission denied|row-level security/i.test(msg)) {
    return new OnboardingApiError('No tienes permiso para realizar esta acción.', code)
  }
  if (code === 'PGRST202' || /could not find the function/i.test(msg)) {
    return new OnboardingApiError(
      'Falta aplicar la migración 0009 en Supabase (función no encontrada). Consulta docs/onboarding.md.',
      code,
    )
  }
  if (/Failed to fetch|NetworkError|network/i.test(msg)) {
    return new OnboardingApiError('Sin conexión. Comprueba tu red e inténtalo de nuevo.', 'network')
  }
  return new OnboardingApiError(msg || fallback, code)
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}, fallback = 'No se pudo completar la operación.'): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw friendly(error, fallback)
  return data as T
}

/* ------------------------------------------------------------------ */
/* Onboarding                                                           */
/* ------------------------------------------------------------------ */

export const getOnboarding = () => rpc<OnboardingSnapshot>('get_onboarding', {}, 'No se pudo cargar la configuración.')

export const saveStep = (key: OnboardingStepKey, data: Record<string, unknown>) =>
  rpc<OnboardingStepRow>('save_onboarding_step', { p_step_key: key, p_data: data }, 'No se pudo guardar el paso.')

export const completeStep = (key: OnboardingStepKey, data?: Record<string, unknown>) =>
  rpc<OnboardingStepRow>('complete_onboarding_step', { p_step_key: key, p_data: data ?? null }, 'No se pudo completar el paso.')

export const skipStep = (key: OnboardingStepKey, reason?: string) =>
  rpc<OnboardingStepRow>('skip_onboarding_step', { p_step_key: key, p_reason: reason ?? null }, 'No se pudo omitir el paso.')

export const reopenStep = (key: OnboardingStepKey) =>
  rpc<OnboardingStepRow>('reopen_onboarding_step', { p_step_key: key }, 'No se pudo reabrir el paso.')

export const flagStep = (key: OnboardingStepKey, status: Extract<StepStatus, 'error' | 'requires_attention' | 'in_progress'>, errors: unknown[] = []) =>
  rpc<OnboardingStepRow>('flag_onboarding_step', { p_step_key: key, p_status: status, p_errors: errors }, 'No se pudo actualizar el paso.')

export const reopenOnboarding = () => rpc<{ ok: boolean }>('reopen_onboarding', {}, 'No se pudo reabrir la configuración inicial.')

export const getBlockers = () => rpc<Blocker[]>('get_onboarding_blockers', {}, 'No se pudieron comprobar los requisitos.')

export const activateOnboarding = () =>
  rpc<{ ok: boolean; blockers?: Blocker[] }>('activate_onboarding', {}, 'No se pudo activar Feblio.')

export const runOnboardingTest = () =>
  rpc<{ ok: boolean; run_id: string; steps: unknown[]; project_id: string; intake_token: string }>(
    'run_onboarding_test',
    {},
    'La prueba guiada falló.',
  )

export const cleanupTestData = () =>
  rpc<{ ok: boolean; deleted: Record<string, number> }>('cleanup_onboarding_test_data', {}, 'No se pudieron eliminar los datos de prueba.')

export const createRequestFromCall = (data: Record<string, unknown>) =>
  rpc<{ ok: boolean; token: string; intake_id: string; cliente_id: string; task_id: string }>(
    'create_request_from_call',
    { p_data: data },
    'No se pudo crear la solicitud.',
  )

export const logAudit = (action: string, entityType?: string, entityId?: string, result: 'ok' | 'error' | 'blocked' = 'ok', metadata: Record<string, unknown> = {}) =>
  rpc<string>('log_audit_event', { p_action: action, p_entity_type: entityType ?? null, p_entity_id: entityId ?? null, p_result: result, p_metadata: metadata }, 'No se pudo registrar la auditoría.')

/* ------------------------------------------------------------------ */
/* Verificación de email                                                */
/* ------------------------------------------------------------------ */

export interface VerificationState {
  has_empresa: boolean
  email_verified: boolean
  mode: 'otp' | 'native'
}

export const getVerificationState = () => rpc<VerificationState>('get_verification_state', {}, 'No se pudo comprobar la verificación.')
export const claimNativeVerification = () => rpc<{ ok: boolean; error?: string }>('claim_native_email_verification')

/**
 * Estado de acceso de la empresa: verificación + onboarding.
 * Si la migración 0009 no está aplicada todavía, degrada al comportamiento anterior
 * (solo email_verified; onboarding considerado completado) en vez de bloquear el acceso.
 */
export async function getEmpresaAccessState(empresaId: string) {
  const [verificationRes, empresa] = await Promise.all([
    getVerificationState().then((v) => ({ ok: true as const, v })).catch((e: OnboardingApiError) => ({ ok: false as const, e })),
    supabase.from('empresas').select('onboarding_status, onboarding_current_step, email_verified').eq('id', empresaId).single(),
  ])
  if (empresa.error) {
    if (empresa.error.code === '42703') {
      // Columnas de onboarding inexistentes (0009 pendiente): comportamiento previo
      const legacy = await supabase.from('empresas').select('email_verified').eq('id', empresaId).single()
      const verified = legacy.error ? true : ((legacy.data as { email_verified?: boolean }).email_verified ?? true)
      return { verification: { has_empresa: true, email_verified: verified, mode: 'otp' as const }, onboarding_status: 'completed' as const, onboarding_current_step: null }
    }
    throw friendly(empresa.error, 'No se pudo cargar la empresa.')
  }
  const row = empresa.data as { onboarding_status: Empresa['onboarding_status']; onboarding_current_step: string | null; email_verified?: boolean }
  const verification: VerificationState = verificationRes.ok
    ? verificationRes.v
    : { has_empresa: true, email_verified: row.email_verified ?? true, mode: 'otp' }
  return {
    verification,
    onboarding_status: row.onboarding_status ?? 'not_started',
    onboarding_current_step: row.onboarding_current_step,
  }
}

/* ------------------------------------------------------------------ */
/* Empresa / propietario                                                */
/* ------------------------------------------------------------------ */

export type EmpresaPatch = Partial<
  Pick<
    Empresa,
    | 'name' | 'trade_name' | 'entity_type' | 'tax_type' | 'cif' | 'address' | 'country' | 'province' | 'city'
    | 'postal_code' | 'timezone' | 'language' | 'currency' | 'phone' | 'email' | 'website' | 'logo_url'
    | 'primary_color' | 'iban' | 'disclosures' | 'intake_config'
  >
>

export async function updateEmpresa(empresaId: string, patch: EmpresaPatch) {
  const { error } = await supabase.from('empresas').update(patch).eq('id', empresaId)
  if (error) throw friendly(error, 'No se pudieron guardar los datos de la empresa.')
}

export type ProfilePatch = Partial<Pick<Profile, 'full_name' | 'contact_email' | 'phone' | 'job_title' | 'is_onboarding_owner'>>

export async function updateProfile(userId: string, patch: ProfilePatch) {
  const { error } = await supabase.from('profiles').update(patch).eq('id', userId)
  if (error) throw friendly(error, 'No se pudieron guardar los datos del propietario.')
}

/* ------------------------------------------------------------------ */
/* Integraciones (sin secretos; estados externos solo vía Edge Function)*/
/* ------------------------------------------------------------------ */

export const upsertIntegration = (
  kind: IntegrationKind,
  provider: string,
  status: Extract<IntegrationStatus, 'not_configured' | 'pending_credentials' | 'disconnected' | 'connected'>,
  settings: Record<string, unknown> = {},
  accountIdentifier?: string,
  displayName?: string,
) =>
  rpc<IntegrationConnection>(
    'upsert_integration_connection',
    {
      p_kind: kind,
      p_provider: provider,
      p_status: status,
      p_settings: settings,
      p_account_identifier: accountIdentifier ?? null,
      p_display_name: displayName ?? null,
    },
    'No se pudo guardar la integración.',
  )

export const updateIntegrationSettings = (kind: IntegrationKind, settings: Record<string, unknown>, accountIdentifier?: string) =>
  rpc<IntegrationConnection>('update_integration_settings', { p_kind: kind, p_settings: settings, p_account_identifier: accountIdentifier ?? null }, 'No se pudieron guardar los ajustes del canal.')

export const recordInternalHealthCheck = (kind: IntegrationKind, ok: boolean, result: Record<string, unknown> = {}) =>
  rpc<{ ok: boolean }>('record_internal_health_check', { p_kind: kind, p_ok: ok, p_result: result }, 'No se pudo registrar la prueba.')

export async function listIntegrations(): Promise<IntegrationConnection[]> {
  const { data, error } = await supabase.from('integration_connections').select('*').order('kind')
  if (error) throw friendly(error, 'No se pudieron cargar las integraciones.')
  return (data as IntegrationConnection[]) ?? []
}

/* ------------------------------------------------------------------ */
/* Configuraciones con RLS directa                                      */
/* ------------------------------------------------------------------ */

export async function saveAutomation(empresaId: string, patch: Partial<AutomationSettings>) {
  const { error } = await supabase.from('automation_settings').update(patch).eq('empresa_id', empresaId)
  if (error) throw friendly(error, 'No se pudieron guardar las automatizaciones.')
}

export async function saveBilling(empresaId: string, patch: Partial<BillingSettings>) {
  const { error } = await supabase.from('billing_settings').update(patch).eq('empresa_id', empresaId)
  if (error) {
    if (/billing_settings_series_distinct/.test(error.message)) throw new OnboardingApiError('Las series no pueden repetirse.')
    if (/billing_settings_exempt_rate/.test(error.message)) throw new OnboardingApiError('Si el impuesto es Exento, el porcentaje debe ser 0.')
    throw friendly(error, 'No se pudo guardar la facturación.')
  }
}

export async function saveFolderTemplate(t: Partial<FolderTemplate> & { empresa_id: string }) {
  const q = t.id
    ? supabase.from('folder_templates').update({ name: t.name, root_pattern: t.root_pattern, folders: t.folders, is_default: t.is_default }).eq('id', t.id)
    : supabase.from('folder_templates').insert({ empresa_id: t.empresa_id, name: t.name, root_pattern: t.root_pattern, folders: t.folders, is_default: t.is_default ?? false })
  const { error } = await q
  if (error) throw friendly(error, 'No se pudo guardar la plantilla de carpetas.')
}

export async function saveFormTemplate(t: Partial<IntakeFormTemplate> & { empresa_id: string }) {
  const payload = {
    key: t.key,
    name: t.name,
    description: t.description ?? null,
    fields: t.fields ?? [],
    required_documents: t.required_documents ?? [],
    consents: t.consents ?? [],
    link_expiry_days: t.link_expiry_days ?? 30,
    reminders: t.reminders ?? { enabled: true, after_days: [3, 7] },
    is_active: t.is_active ?? true,
  }
  const q = t.id
    ? supabase.from('intake_form_templates').update(payload).eq('id', t.id)
    : supabase.from('intake_form_templates').insert({ ...payload, empresa_id: t.empresa_id })
  const { error } = await q
  if (error) {
    if (/intake_form_templates_empresa_id_key_key|duplicate key/.test(error.message)) throw new OnboardingApiError('Ya existe un formulario con esa clave.')
    throw friendly(error, 'No se pudo guardar el formulario.')
  }
}

export async function setDefaultFormTemplate(empresaId: string, id: string) {
  const a = await supabase.from('intake_form_templates').update({ is_default: false }).eq('empresa_id', empresaId)
  if (a.error) throw friendly(a.error, 'No se pudo actualizar el formulario predeterminado.')
  const b = await supabase.from('intake_form_templates').update({ is_default: true }).eq('id', id)
  if (b.error) throw friendly(b.error, 'No se pudo actualizar el formulario predeterminado.')
}

export async function deleteFormTemplate(id: string) {
  const { error } = await supabase.from('intake_form_templates').delete().eq('id', id)
  if (error) throw friendly(error, 'No se pudo eliminar el formulario.')
}

export async function saveChannelRule(empresaId: string, channel: ChannelRule['channel'], patch: Partial<ChannelRule>) {
  const { error } = await supabase
    .from('channel_rules')
    .upsert({ empresa_id: empresaId, channel, ...patch }, { onConflict: 'empresa_id,channel' })
  if (error) throw friendly(error, 'No se pudo guardar la regla del canal.')
}

/* ------------------------------------------------------------------ */
/* Almacenamiento interno (Supabase Storage, bucket privado)            */
/* ------------------------------------------------------------------ */

export const INTERNAL_BUCKET = 'empresa-docs'

/** Prueba real de lectura/escritura: sube y borra un marcador en la carpeta de la empresa. */
export async function testInternalStorage(empresaId: string): Promise<{ ok: boolean; error?: string }> {
  const path = `${empresaId}/_health/${Date.now()}.txt`
  const up = await supabase.storage.from(INTERNAL_BUCKET).upload(path, new Blob(['feblio health check']), { upsert: true })
  if (up.error) return { ok: false, error: up.error.message }
  const list = await supabase.storage.from(INTERNAL_BUCKET).list(`${empresaId}/_health`)
  if (list.error) return { ok: false, error: list.error.message }
  const del = await supabase.storage.from(INTERNAL_BUCKET).remove([path])
  if (del.error) return { ok: false, error: del.error.message }
  return { ok: true }
}

/** Crea la estructura de carpetas de un proyecto en el almacenamiento interno (marcadores .keep). */
export async function createInternalProjectFolders(empresaId: string, projectFolder: string, folders: string[]) {
  const safe = projectFolder.replace(/[^\w\-. ]/g, '_')
  const results = await Promise.all(
    folders.map((f) =>
      supabase.storage.from(INTERNAL_BUCKET).upload(`${empresaId}/Proyectos/${safe}/${f}/.keep`, new Blob(['']), { upsert: true }),
    ),
  )
  const failed = results.find((r) => r.error)
  if (failed?.error) throw new OnboardingApiError(`No se pudo crear la carpeta: ${failed.error.message}`)
  return `${empresaId}/Proyectos/${safe}/`
}
