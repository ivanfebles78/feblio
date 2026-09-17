/**
 * Registro de adaptadores de integración (lado cliente).
 *
 * Describe cada proveedor: cómo se conecta, qué variables de entorno necesita
 * el backend y qué capacidades ofrece. La conexión real se ejecuta siempre en
 * la Edge Function `integrations` (supabase/functions/integrations); aquí no
 * hay secretos ni llamadas a proveedores.
 */
import type { IntegrationKind, IntegrationStatus } from '../onboarding/types'

export type ConnectionMode = 'oauth' | 'credentials' | 'internal' | 'manual'

export interface AdapterDescriptor {
  id: string
  kind: IntegrationKind
  label: string
  description: string
  mode: ConnectionMode
  /** Variables que debe configurar el administrador de Feblio en Supabase (secrets) */
  requiredEnv: string[]
  /** Campos que introduce la propia empresa (se cifran en backend) */
  credentialFields?: { key: string; label: string; secret: boolean; hint?: string }[]
  capabilities: string[]
  docsUrl?: string
}

export const ADAPTERS: AdapterDescriptor[] = [
  /* --- Repositorio documental --- */
  {
    id: 'google_drive', kind: 'document_repository', label: 'Google Drive',
    description: 'Carpetas de proyecto en tu Drive o unidad compartida.', mode: 'oauth',
    requiredEnv: ['APP_ENCRYPTION_KEY', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'],
    capabilities: ['Crear carpetas', 'Subir documentos', 'Compartir con el cliente'],
  },
  {
    id: 'onedrive', kind: 'document_repository', label: 'Microsoft OneDrive / SharePoint',
    description: 'Carpetas de proyecto en OneDrive o una biblioteca de SharePoint.', mode: 'oauth',
    requiredEnv: ['APP_ENCRYPTION_KEY', 'MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET', 'MICROSOFT_REDIRECT_URI'],
    capabilities: ['Crear carpetas', 'Subir documentos'],
  },
  {
    id: 'feblio_storage', kind: 'document_repository', label: 'Almacenamiento interno de Feblio',
    description: 'Sin configuración. Archivos cifrados en reposo, aislados por empresa y proyecto.', mode: 'internal',
    requiredEnv: [],
    capabilities: ['Crear carpetas', 'Subir documentos', 'Enlaces temporales'],
  },
  /* --- Correo --- */
  {
    id: 'gmail', kind: 'email', label: 'Google Workspace / Gmail',
    description: 'Lee etiquetas concretas y prepara borradores en tu cuenta.', mode: 'oauth',
    requiredEnv: ['APP_ENCRYPTION_KEY', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'],
    capabilities: ['Leer etiquetas', 'Crear borradores', 'Enviar con aprobación'],
  },
  {
    id: 'm365', kind: 'email', label: 'Microsoft 365 / Outlook',
    description: 'Lee carpetas concretas y prepara borradores en tu buzón.', mode: 'oauth',
    requiredEnv: ['APP_ENCRYPTION_KEY', 'MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET', 'MICROSOFT_REDIRECT_URI'],
    capabilities: ['Leer carpetas', 'Crear borradores', 'Enviar con aprobación'],
  },
  {
    id: 'feblio_inbox', kind: 'email', label: 'Dirección de entrada de Feblio',
    description: 'Te damos una dirección propia; reenvía allí los correos que quieras que Feblio procese.', mode: 'internal',
    requiredEnv: ['RESEND_API_KEY'],
    capabilities: ['Recibir reenvíos', 'Enviar desde Feblio con aprobación'],
  },
  {
    id: 'imap', kind: 'email', label: 'IMAP / SMTP',
    description: 'Cualquier proveedor con IMAP y SMTP. Las credenciales se cifran en el servidor.', mode: 'credentials',
    requiredEnv: ['APP_ENCRYPTION_KEY'],
    credentialFields: [
      { key: 'username', label: 'Usuario', secret: false },
      { key: 'password', label: 'Contraseña o contraseña de aplicación', secret: true, hint: 'Nunca se muestra ni se guarda en el navegador.' },
    ],
    capabilities: ['Leer carpetas', 'Enviar con aprobación'],
  },
  /* --- WhatsApp --- */
  {
    id: 'meta', kind: 'whatsapp', label: 'WhatsApp Business Platform (Meta)',
    description: 'API oficial de Meta. Requiere una cuenta de WhatsApp Business verificada.', mode: 'credentials',
    requiredEnv: ['APP_ENCRYPTION_KEY', 'WHATSAPP_APP_ID', 'WHATSAPP_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN'],
    credentialFields: [
      { key: 'access_token', label: 'Token de acceso permanente (System User)', secret: true, hint: 'Se cifra en el servidor y nunca vuelve al navegador.' },
    ],
    capabilities: ['Recibir mensajes (webhook)', 'Enviar plantillas', 'Escalar a persona'],
  },
  /* --- SMS --- */
  {
    id: 'twilio', kind: 'sms', label: 'Twilio SMS',
    description: 'Envío de formularios y recordatorios por SMS.', mode: 'credentials',
    requiredEnv: ['APP_ENCRYPTION_KEY', 'SMS_PROVIDER'],
    credentialFields: [
      { key: 'account_sid', label: 'Account SID', secret: false },
      { key: 'auth_token', label: 'Auth Token', secret: true },
    ],
    capabilities: ['Enviar SMS', 'Recibir respuestas (webhook)', 'Gestión de bajas'],
  },
  /* --- Llamadas --- */
  {
    id: 'manual_log', kind: 'voice', label: 'Registro manual',
    description: 'Atiendes las llamadas y registras la solicitud en Feblio en un clic.', mode: 'manual',
    requiredEnv: [],
    capabilities: ['Crear solicitud desde llamada', 'Enviar formulario por SMS/WhatsApp/email'],
  },
  {
    id: 'voice_provider', kind: 'voice', label: 'Telefonía integrada / agente de voz',
    description: 'Número virtual, grabación, transcripción y agente de voz. Requiere proveedor.', mode: 'credentials',
    requiredEnv: ['APP_ENCRYPTION_KEY', 'VOICE_PROVIDER', 'VOICE_API_KEY'],
    capabilities: ['Número virtual', 'Grabación', 'Transcripción', 'Agente de voz', 'Desvío'],
  },
  /* --- Pagos --- */
  {
    id: 'stripe', kind: 'payments', label: 'Stripe',
    description: 'Cobro de anticipos y facturas con enlace de pago.', mode: 'oauth',
    requiredEnv: ['APP_ENCRYPTION_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
    capabilities: ['Enlaces de pago', 'Confirmación automática (webhook)'],
  },
]

export function adaptersFor(kind: IntegrationKind): AdapterDescriptor[] {
  return ADAPTERS.filter((a) => a.kind === kind)
}

export function adapterById(id: string | null | undefined): AdapterDescriptor | undefined {
  return ADAPTERS.find((a) => a.id === id)
}

export const KIND_LABEL: Record<IntegrationKind, string> = {
  document_repository: 'Repositorio documental',
  email: 'Correo electrónico',
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  voice: 'Llamadas',
  payments: 'Pagos',
}

export const STATUS_LABEL: Record<IntegrationStatus, string> = {
  not_configured: 'Sin configurar',
  pending_credentials: 'Requiere configuración del administrador de Feblio',
  connecting: 'Conectando',
  connected: 'Conectado',
  degraded: 'Degradado',
  expired: 'Caducado',
  error: 'Error',
  disconnected: 'Desconectado',
}

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
