/**
 * Registro de adaptadores de integración (lado cliente).
 *
 * Describe cada proveedor: cómo se conecta, qué variables de entorno necesita
 * el backend y qué capacidades ofrece. La conexión real se ejecuta siempre en
 * la Edge Function `integrations` (supabase/functions/integrations); aquí no
 * hay secretos ni llamadas a proveedores.
 *
 * Los textos visibles (label, description, capacidades, campos de credenciales)
 * se resuelven con getters en el momento de leerlos, según el idioma activo.
 */
import { t } from '../../i18n'
import type { IntegrationKind, IntegrationStatus } from '../onboarding/types'

export type ConnectionMode = 'oauth' | 'credentials' | 'internal' | 'manual'

export interface CredentialField {
  key: string
  readonly label: string
  secret: boolean
  readonly hint?: string
}

export interface AdapterDescriptor {
  id: string
  kind: IntegrationKind
  readonly label: string
  readonly description: string
  mode: ConnectionMode
  /** Variables que debe configurar el administrador de Feblio en Supabase (secrets) */
  requiredEnv: string[]
  /** Campos que introduce la propia empresa (se cifran en backend) */
  credentialFields?: CredentialField[]
  /** Códigos de capacidad (ver `capabilityLabel`) */
  capabilities: string[]
  docsUrl?: string
}

type AdapterSpec = Omit<AdapterDescriptor, 'label' | 'description' | 'credentialFields'> & {
  credentialFields?: { key: string; secret: boolean; hintKey?: string }[]
}

export function adapterLabel(id: string): string {
  return t(`integrations.adapters.${id}.label`, { defaultValue: id })
}
export function adapterDescription(id: string): string {
  return t(`integrations.adapters.${id}.description`, { defaultValue: '' })
}
export function capabilityLabel(code: string): string {
  return t(`integrations.capabilities.${code}`, { defaultValue: code })
}
export function credentialFieldLabel(key: string): string {
  return t(`integrations.credentialFields.${key}`, { defaultValue: key })
}

function credentialField(f: { key: string; secret: boolean; hintKey?: string }): CredentialField {
  return {
    key: f.key,
    secret: f.secret,
    get label() {
      return credentialFieldLabel(f.key)
    },
    get hint() {
      return f.hintKey ? t(`integrations.credentialFields.${f.hintKey}`) : undefined
    },
  }
}

function defineAdapter(spec: AdapterSpec): AdapterDescriptor {
  const { credentialFields, ...rest } = spec
  return {
    ...rest,
    ...(credentialFields ? { credentialFields: credentialFields.map(credentialField) } : {}),
    get label() {
      return adapterLabel(spec.id)
    },
    get description() {
      return adapterDescription(spec.id)
    },
  }
}

export const ADAPTERS: AdapterDescriptor[] = [
  /* --- Repositorio documental --- */
  defineAdapter({
    id: 'google_drive', kind: 'document_repository', mode: 'oauth',
    requiredEnv: ['APP_ENCRYPTION_KEY', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'],
    capabilities: ['create_folders', 'upload_documents', 'share_with_client'],
  }),
  defineAdapter({
    id: 'onedrive', kind: 'document_repository', mode: 'oauth',
    requiredEnv: ['APP_ENCRYPTION_KEY', 'MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET', 'MICROSOFT_REDIRECT_URI'],
    capabilities: ['create_folders', 'upload_documents'],
  }),
  defineAdapter({
    id: 'feblio_storage', kind: 'document_repository', mode: 'internal',
    requiredEnv: [],
    capabilities: ['create_folders', 'upload_documents', 'temporary_links'],
  }),
  /* --- Correo --- */
  defineAdapter({
    id: 'gmail', kind: 'email', mode: 'oauth',
    requiredEnv: ['APP_ENCRYPTION_KEY', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'],
    capabilities: ['read_labels', 'create_drafts', 'send_with_approval'],
  }),
  defineAdapter({
    id: 'm365', kind: 'email', mode: 'oauth',
    requiredEnv: ['APP_ENCRYPTION_KEY', 'MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET', 'MICROSOFT_REDIRECT_URI'],
    capabilities: ['read_folders', 'create_drafts', 'send_with_approval'],
  }),
  defineAdapter({
    id: 'feblio_inbox', kind: 'email', mode: 'internal',
    requiredEnv: ['RESEND_API_KEY'],
    capabilities: ['receive_forwards', 'send_from_feblio_with_approval'],
  }),
  defineAdapter({
    id: 'imap', kind: 'email', mode: 'credentials',
    requiredEnv: ['APP_ENCRYPTION_KEY'],
    credentialFields: [
      { key: 'username', secret: false },
      { key: 'password', secret: true, hintKey: 'passwordHint' },
    ],
    capabilities: ['read_folders', 'send_with_approval'],
  }),
  /* --- WhatsApp --- */
  defineAdapter({
    id: 'meta', kind: 'whatsapp', mode: 'credentials',
    requiredEnv: ['APP_ENCRYPTION_KEY', 'WHATSAPP_APP_ID', 'WHATSAPP_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN'],
    credentialFields: [{ key: 'access_token', secret: true, hintKey: 'accessTokenHint' }],
    capabilities: ['receive_messages_webhook', 'send_templates', 'escalate_to_person'],
  }),
  /* --- SMS --- */
  defineAdapter({
    id: 'twilio', kind: 'sms', mode: 'credentials',
    requiredEnv: ['APP_ENCRYPTION_KEY', 'SMS_PROVIDER'],
    credentialFields: [
      { key: 'account_sid', secret: false },
      { key: 'auth_token', secret: true },
    ],
    capabilities: ['send_sms', 'receive_replies_webhook', 'opt_out_management'],
  }),
  /* --- Llamadas --- */
  defineAdapter({
    id: 'manual_log', kind: 'voice', mode: 'manual',
    requiredEnv: [],
    capabilities: ['create_request_from_call', 'send_form_via_channels'],
  }),
  defineAdapter({
    id: 'voice_provider', kind: 'voice', mode: 'credentials',
    requiredEnv: ['APP_ENCRYPTION_KEY', 'VOICE_PROVIDER', 'VOICE_API_KEY'],
    capabilities: ['virtual_number', 'recording', 'transcription', 'voice_agent', 'forwarding'],
  }),
  /* --- Pagos --- */
  defineAdapter({
    id: 'stripe', kind: 'payments', mode: 'oauth',
    requiredEnv: ['APP_ENCRYPTION_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
    capabilities: ['payment_links', 'auto_confirmation_webhook'],
  }),
]

export function adaptersFor(kind: IntegrationKind): AdapterDescriptor[] {
  return ADAPTERS.filter((a) => a.kind === kind)
}

export function adapterById(id: string | null | undefined): AdapterDescriptor | undefined {
  return ADAPTERS.find((a) => a.id === id)
}

export function kindLabel(kind: IntegrationKind): string {
  return t(`integrations.kinds.${kind}`)
}

export function integrationStatusLabel(status: IntegrationStatus): string {
  return t(`integrations.status.${status}`)
}

const KINDS: IntegrationKind[] = ['document_repository', 'email', 'whatsapp', 'sms', 'voice', 'payments']
const STATUSES: IntegrationStatus[] = ['not_configured', 'pending_credentials', 'connecting', 'connected', 'degraded', 'expired', 'error', 'disconnected']

function lazyLabels<K extends string>(keys: K[], resolve: (k: K) => string): Record<K, string> {
  const out = {} as Record<K, string>
  for (const k of keys) Object.defineProperty(out, k, { enumerable: true, get: () => resolve(k) })
  return out
}

/** Etiqueta por tipo de integración (getters: sigue al idioma activo). Preferir `kindLabel()`. */
export const KIND_LABEL: Record<IntegrationKind, string> = lazyLabels(KINDS, kindLabel)

/** Etiqueta por estado de conexión (getters). Preferir `integrationStatusLabel()`. */
export const STATUS_LABEL: Record<IntegrationStatus, string> = lazyLabels(STATUSES, integrationStatusLabel)

/** Icono textual (no depende solo del color) */
export const STATUS_GLYPH: Record<IntegrationStatus, string> = {
  not_configured: '○',
  pending_credentials: '◔',
  connecting: '◐',
  connected: '●',
  degraded: '◑',
  expired: '◷',
  error: '✕',
  disconnected: '◌',
}
