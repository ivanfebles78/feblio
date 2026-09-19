import type { PillTone } from '../../components/v2/Card'
import type { RequisitoStatus, SolicitudStatus, SourceChannel } from './types'

export const STATUS_LABEL: Record<SolicitudStatus, string> = {
  draft: 'Borrador',
  awaiting_client: 'Esperando al cliente',
  submitted: 'Recibida',
  under_review: 'En revisión',
  missing_information: 'Falta información',
  ready_for_scope: 'Lista para alcance',
  closed: 'Cerrada',
}

export const STATUS_TONE: Record<SolicitudStatus, PillTone> = {
  draft: 'neutral',
  awaiting_client: 'pending',
  submitted: 'info',
  under_review: 'info',
  missing_information: 'pending',
  ready_for_scope: 'success',
  closed: 'neutral',
}

export const STATUS_ORDER: SolicitudStatus[] = ['draft', 'awaiting_client', 'submitted', 'under_review', 'missing_information', 'ready_for_scope', 'closed']

/** Estados que requieren acción de la empresa ("pendientes" en la bandeja). */
export const PENDING_FOR_EMPRESA: SolicitudStatus[] = ['submitted', 'under_review', 'missing_information']

export const CHANNEL_LABEL: Record<SourceChannel, string> = {
  llamada: 'Llamada',
  email: 'Email',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
  portal: 'Portal',
  otro: 'Otro',
}

export const REQUISITO_LABEL: Record<RequisitoStatus, string> = {
  pending: 'Pendiente',
  received: 'Recibido',
  resolved: 'Resuelto',
  waived: 'No necesario',
}

/**
 * Transiciones permitidas (espejo de sol_transicion_valida en 0014; el servidor es la autoridad).
 * Se usa solo para mostrar u ocultar acciones en la interfaz.
 */
const TRANSITIONS: Record<SolicitudStatus, SolicitudStatus[]> = {
  draft: ['awaiting_client', 'closed'],
  awaiting_client: ['submitted', 'closed'],
  submitted: ['under_review', 'missing_information', 'ready_for_scope', 'closed'],
  under_review: ['missing_information', 'ready_for_scope', 'closed'],
  missing_information: ['under_review', 'ready_for_scope', 'closed'],
  ready_for_scope: ['under_review', 'closed'],
  closed: ['under_review'],
}

export function canTransition(from: SolicitudStatus, to: SolicitudStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

/** Acciones de empresa disponibles según el estado. */
export interface EmpresaAction {
  key: 'review' | 'request_info' | 'ready' | 'close' | 'reopen' | 'reanalyze' | 'link'
  label: string
  to?: SolicitudStatus
}

export function empresaActions(status: SolicitudStatus): EmpresaAction[] {
  const acts: EmpresaAction[] = []
  if (status !== 'closed') acts.push({ key: 'link', label: 'Enlace del cliente' })
  if (canTransition(status, 'under_review') && status !== 'closed') acts.push({ key: 'review', label: 'Marcar en revisión', to: 'under_review' })
  if (['submitted', 'under_review', 'missing_information', 'ready_for_scope'].includes(status)) acts.push({ key: 'request_info', label: 'Solicitar información' })
  if (['submitted', 'under_review', 'missing_information', 'ready_for_scope'].includes(status)) acts.push({ key: 'reanalyze', label: 'Volver a comprobar' })
  if (canTransition(status, 'ready_for_scope')) acts.push({ key: 'ready', label: 'Lista para preparar alcance', to: 'ready_for_scope' })
  if (canTransition(status, 'closed')) acts.push({ key: 'close', label: 'Cerrar solicitud', to: 'closed' })
  if (status === 'closed') acts.push({ key: 'reopen', label: 'Reabrir', to: 'under_review' })
  return acts
}
