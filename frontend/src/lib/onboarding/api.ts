/**
 * Acceso a Supabase para el onboarding. Toda la lógica de tenant y validación
 * vive en RPCs SECURITY DEFINER (migración 0009); aquí solo se llaman y se
 * traducen los errores a mensajes accionables en el idioma de la interfaz.
 */
import type { PostgrestError } from '@supabase/supabase-js'
import { t } from '../../i18n'
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
    return new OnboardingApiError(t('onboarding.api.permission'), code)
  }
  if (code === 'PGRST202' || /could not find the function/i.test(msg)) {
    return new OnboardingApiError(t('onboarding.api.migrationMissing'), code)
  }
  if (/Failed to fetch|NetworkError|network/i.test(msg)) {
    return new OnboardingApiError(t('onboarding.api.network'), 'network')
  }
  return new OnboardingApiError(msg || fallback, code)
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}, fallback?: string): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw friendly(error, fallback ?? t('onboarding.api.generic'))
  return data as T
}

/* ------------------------------------------------------------------ */
/* Onboarding                                                           */
/* ------------------------------------------------------------------ */

export const getOnboarding = () => rpc<OnboardingSnapshot>('get_onboarding', {}, t('onboarding.api.loadConfig'))

export const saveStep = (key: OnboardingStepKey, data: Record<string, unknown>) =>
  rpc<OnboardingStepRow>('save_onboarding_step', { p_step_key: key, p_data: data }, t('onboarding.api.saveStep'))

export const completeStep = (key: OnboardingStepKey, data?: Record<string, unknown>) =>
  rpc<OnboardingStepRow>('complete_onboarding_step', { p_step_key: key, p_data: data ?? null }, t('onboarding.api.completeStep'))

export const skipStep = (key: OnboardingStepKey, reason?: string) =>
  rpc<OnboardingStepRow>('skip_onboarding_step', { p_step_key: key, p_reason: reason ?? null }, t('onboarding.api.skipStep'))

export const reopenStep = (key: OnboardingStepKey) =>
  rpc<OnboardingStepRow>('reopen_onboarding_step', { p_step_key: key }, t('onboarding.api.reopenStep'))

export const flagStep = (key: OnboardingStepKey, status: Extract<StepStatus, 'error' | 'requires_attention' | 'in_progress'>, errors: unknown[] = []) =>
  rpc<OnboardingStepRow>('flag_onboarding_step', { p_step_key: key, p_status: status, p_errors: errors }, t('onboarding.api.updateStep'))

export const reopenOnboarding = () => rpc<{ ok: boolean }>('reopen_onboarding', {}, t('onboarding.api.reopenOnboarding'))

export const getBlockers = () => rpc<Blocker[]>('get_onboarding_blockers', {}, t('onboarding.api.blockers'))

export const activateOnboarding = () =>
  rpc<{ ok: boolean; blockers?: Blocker[] }>('activate_onboarding', {}, t('onboarding.api.activate'))

export const runOnboardingTest = () =>
  rpc<{ ok: boolean; run_id: string; steps: unknown[]; project_id: string; intake_token: string }>(
    'run_onboarding_test',
    {},
    t('onboarding.api.testRun'),
  )

export const cleanupTestData = () =>
  rpc<{ ok: boolean; deleted: Record<string, number> }>('cleanup_onboarding_test_data', {}, t('onboarding.api.cleanup'))

export const createRequestFromCall = (data: Record<string, unknown>) =>
  rpc<{ ok: boolean; token: string; intake_id: string; cliente_id: string; task_id: string }>(
    'create_request_from_call',
    { p_data: data },
    t('onboarding.api.createRequest'),
  )

export const logAudit = (action: string, entityType?: string, entityId?: string, result: 'ok' | 'error' | 'blocked' = 'ok', metadata: Record<string, unknown> = {}) =>
  rpc<string>('log_audit_event', { p_action: action, p_entity_type: entityType ?? null, p_entity_id: entityId ?? null, p_result: result, p_metadata: metadata }, t('onboarding.api.audit'))

/* ------------------------------------------------------------------ */
/* Verificación de email                                                */
/* ------------------------------------------------------------------ */

export interface VerificationState {
  has_empresa: boolean
  email_verified: boolean
  mode: 'otp' | 'native'
}

export const getVerificationState = () => rpc<VerificationState>('get_verification_state', {}, t('onboarding.api.verification'))
export const claimNativeVerification = () => rpc<{ ok: boolean; error?: string }>('claim_native_email_verification')

/**
 * Estado de acceso de la empresa: verificación + onboarding.
 * Si la migración 0009 no está aplicada todavía, degrada al comportamiento anterior
 * (solo email_verified; onboarding considerado completado) en vez de bloquear el acceso.
 */
export async function getEmpresaAccessState(empresaId: string) {
  const [verificationRes, empresa] = await Promise.all([
    getVerificationState().then((v) => ({ ok: true as const, v })).catch((e: OnboardingApiError) => ({ ok: false as const, e })),
    supabase.from('empresas').select('onboarding_status, onboarding_current_step, email_verified, onboarding_welcome_seen_at').eq('id', empresaId).single(),
  ])
  if (empresa.error) {
    if (empresa.error.code === '42703') {
      // Columnas de onboarding inexistentes (0009 pendiente): comportamiento previo
      const legacy = await supabase.from('empresas').select('email_verified').eq('id', empresaId).single()
      const verified = legacy.error ? true : ((legacy.data as { email_verified?: boolean }).email_verified ?? true)
      return { verification: { has_empresa: true, email_verified: verified, mode: 'otp' as const }, onboarding_status: 'completed' as const, onboarding_current_step: null, welcome_seen: true }
    }
    throw friendly(empresa.error, t('onboarding.api.loadCompany'))
  }
  const row = empresa.data as {
    onboarding_status: Empresa['onboarding_status']
    onboarding_current_step: string | null
    email_verified?: boolean
    onboarding_welcome_seen_at?: string | null
  }
  const verification: VerificationState = verificationRes.ok
    ? verificationRes.v
    : { has_empresa: true, email_verified: row.email_verified ?? true, mode: 'otp' }
  return {
    verification,
    onboarding_status: row.onboarding_status ?? 'not_started',
    onboarding_current_step: row.onboarding_current_step,
    /** Bienvenida de primera entrada ya mostrada (0013). Sin la columna, se considera vista. */
    welcome_seen: !('onboarding_welcome_seen_at' in row) || row.onboarding_welcome_seen_at != null,
  }
}

/** Marca la bienvenida de primera entrada como vista (idempotente; RPC de 0013). */
export const markWelcomeSeen = () =>
  rpc<{ ok: boolean; seen_at: string | null; onboarding_status: string }>('mark_onboarding_welcome_seen', {}, t('onboarding.api.welcome'))

/**
 * Estados reales de los pasos del wizard para la tarjeta de configuración del dashboard.
 * Solo lectura (RLS: la empresa ve sus filas). Los pasos sin fila cuentan como pendientes.
 */
export async function getStepStatuses(empresaId: string): Promise<Partial<Record<OnboardingStepKey, StepStatus>>> {
  const { data, error } = await supabase.from('onboarding_steps').select('step_key, status').eq('empresa_id', empresaId)
  if (error) throw friendly(error, t('onboarding.api.loadProgress'))
  const out: Partial<Record<OnboardingStepKey, StepStatus>> = {}
  for (const row of (data ?? []) as { step_key: OnboardingStepKey; status: StepStatus }[]) out[row.step_key] = row.status
  return out
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
  if (error) throw friendly(error, t('onboarding.api.saveCompany'))
}

export type ProfilePatch = Partial<Pick<Profile, 'full_name' | 'contact_email' | 'phone' | 'job_title' | 'is_onboarding_owner'>>

export async function updateProfile(userId: string, patch: ProfilePatch) {
  const { error } = await supabase.from('profiles').update(patch).eq('id', userId)
  if (error) throw friendly(error, t('onboarding.api.saveOwner'))
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
    t('onboarding.api.saveIntegration'),
  )

export const updateIntegrationSettings = (kind: IntegrationKind, settings: Record<string, unknown>, accountIdentifier?: string) =>
  rpc<IntegrationConnection>('update_integration_settings', { p_kind: kind, p_settings: settings, p_account_identifier: accountIdentifier ?? null }, t('onboarding.api.saveChannelSettings'))

export const recordInternalHealthCheck = (kind: IntegrationKind, ok: boolean, result: Record<string, unknown> = {}) =>
  rpc<{ ok: boolean }>('record_internal_health_check', { p_kind: kind, p_ok: ok, p_result: result }, t('onboarding.api.recordTest'))

export async function listIntegrations(): Promise<IntegrationConnection[]> {
  const { data, error } = await supabase.from('integration_connections').select('*').order('kind')
  if (error) throw friendly(error, t('onboarding.api.loadIntegrations'))
  return (data as IntegrationConnection[]) ?? []
}

/* ------------------------------------------------------------------ */
/* Configuraciones con RLS directa                                      */
/* ------------------------------------------------------------------ */

export async function saveAutomation(empresaId: string, patch: Partial<AutomationSettings>) {
  const { error } = await supabase.from('automation_settings').update(patch).eq('empresa_id', empresaId)
  if (error) throw friendly(error, t('onboarding.api.saveAutomation'))
}

export async function saveBilling(empresaId: string, patch: Partial<BillingSettings>) {
  const { error } = await supabase.from('billing_settings').update(patch).eq('empresa_id', empresaId)
  if (error) {
    if (/billing_settings_series_distinct/.test(error.message)) throw new OnboardingApiError(t('onboarding.api.seriesDistinct'))
    if (/billing_settings_exempt_rate/.test(error.message)) throw new OnboardingApiError(t('onboarding.api.exemptRateZero'))
    throw friendly(error, t('onboarding.api.saveBilling'))
  }
}

export async function saveFolderTemplate(tpl: Partial<FolderTemplate> & { empresa_id: string }) {
  const q = tpl.id
    ? supabase.from('folder_templates').update({ name: tpl.name, root_pattern: tpl.root_pattern, folders: tpl.folders, is_default: tpl.is_default }).eq('id', tpl.id)
    : supabase.from('folder_templates').insert({ empresa_id: tpl.empresa_id, name: tpl.name, root_pattern: tpl.root_pattern, folders: tpl.folders, is_default: tpl.is_default ?? false })
  const { error } = await q
  if (error) throw friendly(error, t('onboarding.api.saveFolderTemplate'))
}

export async function saveFormTemplate(tpl: Partial<IntakeFormTemplate> & { empresa_id: string }) {
  const payload = {
    key: tpl.key,
    name: tpl.name,
    description: tpl.description ?? null,
    fields: tpl.fields ?? [],
    required_documents: tpl.required_documents ?? [],
    consents: tpl.consents ?? [],
    link_expiry_days: tpl.link_expiry_days ?? 30,
    reminders: tpl.reminders ?? { enabled: true, after_days: [3, 7] },
    is_active: tpl.is_active ?? true,
  }
  const q = tpl.id
    ? supabase.from('intake_form_templates').update(payload).eq('id', tpl.id)
    : supabase.from('intake_form_templates').insert({ ...payload, empresa_id: tpl.empresa_id })
  const { error } = await q
  if (error) {
    if (/intake_form_templates_empresa_id_key_key|duplicate key/.test(error.message)) throw new OnboardingApiError(t('onboarding.api.formKeyExists'))
    throw friendly(error, t('onboarding.api.saveForm'))
  }
}

export async function setDefaultFormTemplate(empresaId: string, id: string) {
  const a = await supabase.from('intake_form_templates').update({ is_default: false }).eq('empresa_id', empresaId)
  if (a.error) throw friendly(a.error, t('onboarding.api.setDefaultForm'))
  const b = await supabase.from('intake_form_templates').update({ is_default: true }).eq('id', id)
  if (b.error) throw friendly(b.error, t('onboarding.api.setDefaultForm'))
}

export async function deleteFormTemplate(id: string) {
  const { error } = await supabase.from('intake_form_templates').delete().eq('id', id)
  if (error) throw friendly(error, t('onboarding.api.deleteForm'))
}

export async function saveChannelRule(empresaId: string, channel: ChannelRule['channel'], patch: Partial<ChannelRule>) {
  const { error } = await supabase
    .from('channel_rules')
    .upsert({ empresa_id: empresaId, channel, ...patch }, { onConflict: 'empresa_id,channel' })
  if (error) throw friendly(error, t('onboarding.api.saveChannelRule'))
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
  if (failed?.error) throw new OnboardingApiError(t('onboarding.api.createFolder', { error: failed.error.message }))
  return `${empresaId}/Proyectos/${safe}/`
}
