import { useState } from 'react'
import { Download, FileText, History } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { t } from '../../../i18n'
import { Card, CardHeader, EmptyState, StatusPill } from '../../../components/v2/Card'
import { Button } from '../../../components/v2/Button'
import { FileUploader } from '../../../components/solicitudes/FileUploader'
import { baseFieldLabel, baseFields } from '../../../lib/solicitudes/analysis'
import { formatBytes, signedUrl } from '../../../lib/solicitudes/files'
import { formatDateTime } from '../../../lib/intl'
import { requisitoLabel, STATUS_ORDER, statusLabel } from '../../../lib/solicitudes/status'
import type { RequisitoStatus, SolicitudDocumento, SolicitudEvento, SolicitudRequisito, SolicitudStatus } from '../../../lib/solicitudes/types'
import type { SolicitudDetalle } from '../../../lib/solicitudes/api'

/* ---------------- Datos recibidos ---------------- */

export function DatosRecibidos({ formData, template, submittedAt }: { formData: Record<string, unknown>; template: SolicitudDetalle['template']; submittedAt: string | null }) {
  const { t } = useTranslation()
  const defs = [...baseFields(), { key: 'budget', label: baseFieldLabel('budget') }, ...(template?.fields ?? []).map((f) => ({ key: f.key, label: f.label }))]
  const seen = new Set<string>()
  const rows = defs
    .filter((d) => {
      if (seen.has(d.key)) return false
      seen.add(d.key)
      return true
    })
    .map((d) => ({ ...d, value: formData[d.key] }))
    .filter((r) => r.value !== undefined && r.value !== null && String(r.value).trim() !== '')
  return (
    <Card className="p-5">
      <CardHeader title={t('requests.panels.data.title')} description={submittedAt ? t('requests.panels.data.submittedOn', { date: formatDateTime(submittedAt) }) : t('requests.panels.data.notSubmitted')} />
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">{t('requests.panels.data.empty')}</p>
      ) : (
        <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {rows.map((r) => (
            <div key={r.key} className={String(r.value).length > 80 ? 'sm:col-span-2' : ''}>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{r.label}</dt>
              <dd className="mt-0.5 whitespace-pre-wrap break-words text-sm text-slate-800">{String(r.value)}</dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  )
}

/* ---------------- Información pendiente ---------------- */

export function RequisitosPanel({ requisitos, onResolve, busy }: { requisitos: SolicitudRequisito[]; onResolve: (id: string, estado: 'resolved' | 'waived' | 'pending') => void; busy: boolean }) {
  const { t } = useTranslation()
  const open = requisitos.filter((r) => r.status === 'pending' || r.status === 'received')
  const done = requisitos.filter((r) => r.status === 'resolved' || r.status === 'waived')
  const tone = (s: SolicitudRequisito['status']) => (s === 'pending' ? 'pending' : s === 'received' ? 'info' : s === 'resolved' ? 'success' : 'neutral')
  const Row = ({ r }: { r: SolicitudRequisito }) => (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2">
      <div className="min-w-0">
        <p className="text-sm text-slate-800">{r.label}</p>
        <p className="text-xs text-slate-500">
          {t('requests.panels.requisitos.requestedAt', { kind: t(`requests.kind.${r.kind}`), date: formatDateTime(r.requested_at) })}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <StatusPill tone={tone(r.status)}>{requisitoLabel(r.status)}</StatusPill>
        {(r.status === 'pending' || r.status === 'received') && (
          <>
            <Button size="sm" variant="secondary" onClick={() => onResolve(r.id, 'resolved')} disabled={busy}>
              {t('requests.panels.requisitos.resolve')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onResolve(r.id, 'waived')} disabled={busy}>
              {t('requests.panels.requisitos.waive')}
            </Button>
          </>
        )}
        {(r.status === 'resolved' || r.status === 'waived') && (
          <Button size="sm" variant="ghost" onClick={() => onResolve(r.id, 'pending')} disabled={busy}>
            {t('requests.panels.requisitos.reask')}
          </Button>
        )}
      </div>
    </li>
  )
  return (
    <Card className="p-5">
      <CardHeader title={t('requests.panels.requisitos.title')} description={t('requests.panels.requisitos.description')} />
      {requisitos.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">{t('requests.panels.requisitos.empty')}</p>
      ) : (
        <>
          <ul className="mt-2 divide-y divide-slate-100">
            {open.map((r) => (
              <Row key={r.id} r={r} />
            ))}
          </ul>
          {done.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-sm text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                {t('requests.panels.requisitos.doneCount', { count: done.length })}
              </summary>
              <ul className="divide-y divide-slate-100">
                {done.map((r) => (
                  <Row key={r.id} r={r} />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </Card>
  )
}

/* ---------------- Documentos ---------------- */

export function DocumentosPanel({ documentos, requisitos, onUpload, canUpload }: { documentos: SolicitudDocumento[]; requisitos: SolicitudRequisito[]; onUpload: (file: File, mime: string, ext: string) => Promise<void>; canUpload: boolean }) {
  const { t } = useTranslation()
  const [opening, setOpening] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  async function open(d: SolicitudDocumento) {
    setOpening(d.id)
    setError(null)
    try {
      const url = await signedUrl(d.storage_path)
      window.open(url, '_blank', 'noopener')
    } catch (e) {
      setError(e instanceof Error ? e.message : t('requests.panels.documents.openFailed'))
    } finally {
      setOpening(null)
    }
  }
  const reqLabel = (id: string | null) => (id ? requisitos.find((r) => r.id === id)?.label : undefined)
  return (
    <Card className="p-5">
      <CardHeader title={t('requests.panels.documents.title')} description={t('requests.panels.documents.description')} />
      {documentos.length === 0 ? (
        <div className="mt-3">
          <EmptyState icon={<FileText className="h-5 w-5" aria-hidden="true" />} title={t('requests.panels.documents.empty')} description={t('requests.panels.documents.emptyHint')} />
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {documentos.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 py-2">
              <div className="flex min-w-0 items-center gap-3">
                <FileText className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{d.original_name}</p>
                  <p className="text-xs text-slate-500">
                    {formatBytes(d.size_bytes)} · {d.uploaded_by_kind === 'cliente' ? t('requests.panels.documents.byClient') : t('requests.panels.documents.byTeam')} · {formatDateTime(d.created_at)}
                    {reqLabel(d.requisito_id) && <> · {reqLabel(d.requisito_id)}</>}
                  </p>
                </div>
              </div>
              <Button size="sm" variant="secondary" onClick={() => void open(d)} disabled={opening === d.id} leading={<Download className="h-4 w-4" aria-hidden="true" />} aria-label={t('requests.panels.documents.download', { name: d.original_name })}>
                {opening === d.id ? t('requests.panels.documents.opening') : t('common.actions.download')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      {canUpload && (
        <div className="mt-4">
          <FileUploader onUpload={onUpload} label={t('requests.panels.documents.attach')} compact />
        </div>
      )}
    </Card>
  )
}

/* ---------------- Cronología ---------------- */

/** Clave de traducción por acción de auditoría (los códigos de acción son estables). */
const EVENT_KEY: Record<string, string> = {
  'solicitud.created': 'requests.events.created',
  'solicitud.link_created': 'requests.events.linkCreated',
  'solicitud.links_revoked': 'requests.events.linksRevoked',
  'solicitud.info_requested': 'requests.events.infoRequested',
  'solicitud.analyzed': 'requests.events.analyzed',
  'solicitud.message': 'requests.events.message',
  'solicitud.client_message': 'requests.events.clientMessage',
  'solicitud.submitted': 'requests.events.submitted',
  'solicitud.document.added': 'requests.events.documentAdded',
}
const REQUISITO_STATUSES: RequisitoStatus[] = ['pending', 'received', 'resolved', 'waived']

/** Texto de un evento en el idioma actual (se llama en cada render, por lo que sigue al cambio de idioma). */
export function eventText(e: SolicitudEvento): string {
  const m = e.metadata ?? {}
  if (e.action.startsWith('solicitud.status.')) {
    const to = e.action.slice('solicitud.status.'.length)
    const status = (STATUS_ORDER as string[]).includes(to) ? statusLabel(to as SolicitudStatus) : to
    if (m.reason === 'reopen') return t('requests.events.reopened', { status })
    return typeof m.reason === 'string' && m.reason ? t('requests.events.statusChangedReason', { status, reason: m.reason }) : t('requests.events.statusChanged', { status })
  }
  if (e.action.startsWith('solicitud.requirement.')) {
    const st = e.action.slice('solicitud.requirement.'.length)
    return t('requests.events.requirement', { status: (REQUISITO_STATUSES as string[]).includes(st) ? requisitoLabel(st as RequisitoStatus) : e.action })
  }
  const base = EVENT_KEY[e.action] ? t(EVENT_KEY[e.action]) : e.action.replace('solicitud.', '').replace(/[._]/g, ' ')
  if (e.action === 'solicitud.analyzed' && typeof m.completeness === 'number') return t('requests.events.analyzedPct', { label: base, pct: m.completeness })
  if (e.action === 'solicitud.submitted' && typeof m.completeness === 'number') return t('requests.events.submittedPct', { label: base, pct: m.completeness })
  if (e.action === 'solicitud.document.added') return m.by === 'cliente' ? t('requests.events.clientDocument') : t('requests.events.teamDocument')
  return base
}

export function Cronologia({ eventos }: { eventos: SolicitudEvento[] }) {
  const { t } = useTranslation()
  return (
    <Card className="p-5">
      <CardHeader title={t('requests.panels.timeline.title')} as="h3" />
      {eventos.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">{t('requests.panels.timeline.empty')}</p>
      ) : (
        <ol className="mt-3 space-y-3 border-l border-slate-200 pl-4">
          {eventos.map((e) => (
            <li key={e.id} className="relative text-sm">
              <span className="absolute -left-[21px] top-1 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-white ring-2 ring-slate-300" aria-hidden="true" />
              <p className={e.result === 'ok' ? 'text-slate-800' : 'text-red-700'}>{eventText(e)}</p>
              <p className="text-xs text-slate-500">
                <History className="mr-1 inline h-3 w-3" aria-hidden="true" />
                <time dateTime={e.created_at}>{formatDateTime(e.created_at)}</time>
              </p>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}
