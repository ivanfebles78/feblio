import type { FormConsentDef, FormDocDef, FormFieldDef } from '../onboarding/types'

export type SolicitudStatus = 'draft' | 'awaiting_client' | 'submitted' | 'under_review' | 'missing_information' | 'ready_for_scope' | 'closed'
export type SourceChannel = 'llamada' | 'email' | 'sms' | 'whatsapp' | 'portal' | 'otro'
export type RequisitoStatus = 'pending' | 'received' | 'resolved' | 'waived'
export type RequisitoKind = 'field' | 'document'
export type AuthorKind = 'empresa' | 'cliente' | 'sistema'
export type MessageKind = 'message' | 'info_request' | 'system'

export interface Solicitud {
  id: string
  empresa_id: string
  cliente_id: string | null
  contact_name: string
  contact_email: string | null
  contact_phone: string | null
  source_channel: SourceChannel
  title: string
  service_type: string | null
  description: string | null
  deadline: string | null
  status: SolicitudStatus
  closed_reason: string | null
  form_template_id: string | null
  form_data: Record<string, unknown>
  form_submitted_at: string | null
  completeness: number
  last_activity_at: string
  created_at: string
  updated_at: string
  is_test: boolean
}

/** Fila de bandeja: solicitud + recuento de mensajes del cliente sin leer. */
export interface SolicitudResumen extends Solicitud {
  unread_count: number
  cliente_name: string | null
}

export interface SolicitudAcceso {
  id: string
  solicitud_id: string
  expires_at: string
  revoked_at: string | null
  last_used_at: string | null
  created_at: string
}

export interface SolicitudMensaje {
  id: string
  solicitud_id: string
  author_kind: AuthorKind
  author_user_id: string | null
  author_name: string
  kind: MessageKind
  body: string
  requisito_ids: string[]
  read_by_empresa_at: string | null
  read_by_cliente_at: string | null
  created_at: string
}

export interface SolicitudDocumento {
  id: string
  solicitud_id: string
  uploaded_by_kind: 'empresa' | 'cliente'
  original_name: string
  storage_path: string
  mime_type: string
  size_bytes: number
  requisito_id: string | null
  /** Visible en el enlace del cliente (los internos solo los ve la empresa). */
  visible_to_client: boolean
  /** Borrado lógico: nunca se muestra ni se descarga. */
  deleted_at: string | null
  created_at: string
}

export interface SolicitudRequisito {
  id: string
  solicitud_id: string
  kind: RequisitoKind
  key: string
  label: string
  required: boolean
  status: RequisitoStatus
  requested_at: string
  resolved_at: string | null
}

export interface AnalysisItem {
  key: string
  label: string
  kind?: 'field' | 'document'
}

export interface SolicitudAnalisis {
  id: string
  solicitud_id: string
  version: number
  provider: string
  completeness: number
  received: AnalysisItem[]
  missing: AnalysisItem[]
  missing_documents: AnalysisItem[]
  summary: string | null
  triggered_by: string
  created_at: string
}

export interface SolicitudEvento {
  id: string
  action: string
  result: string
  metadata: Record<string, unknown>
  user_id: string | null
  created_at: string
}

export interface Notificacion {
  id: string
  empresa_id: string
  recipient_kind: 'empresa' | 'cliente'
  solicitud_id: string | null
  type: string
  title: string
  body: string | null
  link_path: string | null
  read_at: string | null
  created_at: string
}

/** Vista del cliente devuelta por el acceso con token (sin identificadores internos de la empresa). */
export interface ClienteVista {
  access_id: string
  expires_at: string
  /** `language` ('es' | 'en') llega desde 0015; se usa para el idioma inicial del enlace público. */
  empresa: { name: string; logo_url: string | null; language?: string } | null
  solicitud: {
    title: string
    service_type: string | null
    description: string | null
    status: SolicitudStatus
    contact_name: string
    contact_email: string | null
    contact_phone: string | null
    form_data: Record<string, unknown>
    form_submitted_at: string | null
    completeness: number
  }
  template: { fields: FormFieldDef[]; required_documents: FormDocDef[]; consents: FormConsentDef[] } | null
  requisitos: { id: string; kind: RequisitoKind; key: string; label: string; status: RequisitoStatus; requested_at: string }[]
  documentos: { id: string; name: string; size_bytes: number; by: 'empresa' | 'cliente'; created_at: string; requisito_id: string | null }[]
  mensajes: { id: string; author_kind: AuthorKind; author_name: string; kind: MessageKind; body: string; created_at: string; read: boolean }[]
}

export interface NuevaSolicitudInput {
  cliente_id?: string | null
  contact_name: string
  contact_email?: string
  contact_phone?: string
  source_channel: SourceChannel
  title: string
  service_type?: string
  description?: string
  deadline?: string
  form_template_id?: string | null
}
