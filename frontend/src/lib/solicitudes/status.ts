import type { PillTone } from '../../components/v2/Card'
import { t } from '../../i18n'
import type { RequisitoStatus, SolicitudStatus, SourceChannel } from './types'

/** Etiqueta traducida del estado (se resuelve en el momento de uso, nunca al cargar el módulo). */
export function statusLabel(status: SolicitudStatus): string {
  return t(`requests.status.${status}`)
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

/** Canales de entrada en el orden en que se muestran (los códigos no cambian con el idioma). */
export const CHANNEL_ORDER: SourceChannel[] = ['llamada', 'email', 'sms', 'whatsapp', 'portal', 'otro']

export function isSourceChannel(value: string): value is SourceChannel {
  return (CHANNEL_ORDER as string[]).includes(value)
}

export function channelLabel(channel: SourceChannel): string {
  return t(`requests.channel.${channel}`)
}

export function requisitoLabel(status: RequisitoStatus): string {
  return t(`requests.requisito.${status}`)
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
export type EmpresaActionKey = 'review' | 'request_info' | 'ready' | 'close' | 'reopen' | 'reanalyze' | 'link'

export interface EmpresaAction {
  key: EmpresaActionKey
  label: string
  to?: SolicitudStatus
}

const ACTION_LABEL_KEY: Record<EmpresaActionKey, string> = {
  link: 'requests.actions.link',
  review: 'requests.actions.review',
  request_info: 'requests.actions.requestInfo',
  reanalyze: 'requests.actions.reanalyze',
  ready: 'requests.actions.ready',
  close: 'requests.actions.close',
  reopen: 'requests.actions.reopen',
}

export function actionLabel(key: EmpresaActionKey): string {
  return t(ACTION_LABEL_KEY[key])
}

export function empresaActions(status: SolicitudStatus): EmpresaAction[] {
  const acts: EmpresaAction[] = []
  const add = (key: EmpresaActionKey, to?: SolicitudStatus) => acts.push({ key, label: actionLabel(key), ...(to ? { to } : {}) })
  if (status !== 'closed') add('link')
  if (canTransition(status, 'under_review') && status !== 'closed') add('review', 'under_review')
  if (['submitted', 'under_review', 'missing_information', 'ready_for_scope'].includes(status)) add('request_info')
  if (['submitted', 'under_review', 'missing_information', 'ready_for_scope'].includes(status)) add('reanalyze')
  if (canTransition(status, 'ready_for_scope')) add('ready', 'ready_for_scope')
  if (canTransition(status, 'closed')) add('close', 'closed')
  if (status === 'closed') add('reopen', 'under_review')
  return acts
}
