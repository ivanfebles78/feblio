import { useState } from 'react'
import { Download, FileText, History } from 'lucide-react'
import { Card, CardHeader, EmptyState, StatusPill } from '../../../components/v2/Card'
import { Button } from '../../../components/v2/Button'
import { FileUploader } from '../../../components/solicitudes/FileUploader'
import { BASE_FIELDS } from '../../../lib/solicitudes/analysis'
import { formatBytes, signedUrl } from '../../../lib/solicitudes/files'
import { formatDateTime } from '../../../lib/solicitudes/format'
import { REQUISITO_LABEL, STATUS_LABEL } from '../../../lib/solicitudes/status'
import type { SolicitudDocumento, SolicitudEvento, SolicitudRequisito, SolicitudStatus } from '../../../lib/solicitudes/types'
import type { SolicitudDetalle } from '../../../lib/solicitudes/api'

/* ---------------- Datos recibidos ---------------- */

const EXTRA_FIELDS = [{ key: 'budget', label: 'Presupuesto orientativo' }]

export function DatosRecibidos({ formData, template, submittedAt }: { formData: Record<string, unknown>; template: SolicitudDetalle['template']; submittedAt: string | null }) {
  const defs = [...BASE_FIELDS, ...EXTRA_FIELDS, ...(template?.fields ?? []).map((f) => ({ key: f.key, label: f.label }))]
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
      <CardHeader title="Datos recibidos" description={submittedAt ? `Formulario enviado el ${formatDateTime(submittedAt)}` : 'El cliente todavía no ha enviado el formulario.'} />
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Sin datos todavía.</p>
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
  const open = requisitos.filter((r) => r.status === 'pending' || r.status === 'received')
  const done = requisitos.filter((r) => r.status === 'resolved' || r.status === 'waived')
  const tone = (s: SolicitudRequisito['status']) => (s === 'pending' ? 'pending' : s === 'received' ? 'info' : s === 'resolved' ? 'success' : 'neutral')
  const Row = ({ r }: { r: SolicitudRequisito }) => (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2">
      <div className="min-w-0">
        <p className="text-sm text-slate-800">{r.label}</p>
        <p className="text-xs text-slate-500">
          {r.kind === 'document' ? 'Documento' : 'Dato'} · pedido {formatDateTime(r.requested_at)}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <StatusPill tone={tone(r.status)}>{REQUISITO_LABEL[r.status]}</StatusPill>
        {(r.status === 'pending' || r.status === 'received') && (
          <>
            <Button size="sm" variant="secondary" onClick={() => onResolve(r.id, 'resolved')} disabled={busy}>
              Resuelto
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onResolve(r.id, 'waived')} disabled={busy}>
              No necesario
            </Button>
          </>
        )}
        {(r.status === 'resolved' || r.status === 'waived') && (
          <Button size="sm" variant="ghost" onClick={() => onResolve(r.id, 'pending')} disabled={busy}>
            Volver a pedir
          </Button>
        )}
      </div>
    </li>
  )
  return (
    <Card className="p-5">
      <CardHeader title="Información pendiente" description="Requisitos pedidos al cliente. Marca como resuelto lo que ya tengas." />
      {requisitos.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No se ha pedido información adicional.</p>
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
                {done.length} resueltos o no necesarios
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
  const [opening, setOpening] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  async function open(d: SolicitudDocumento) {
    setOpening(d.id)
    setError(null)
    try {
      const url = await signedUrl(d.storage_path)
      window.open(url, '_blank', 'noopener')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir el archivo.')
    } finally {
      setOpening(null)
    }
  }
  const reqLabel = (id: string | null) => (id ? requisitos.find((r) => r.id === id)?.label : undefined)
  return (
    <Card className="p-5">
      <CardHeader title="Documentos" description="Archivos privados. Los enlaces de descarga caducan a los 5 minutos." />
      {documentos.length === 0 ? (
        <div className="mt-3">
          <EmptyState icon={<FileText className="h-5 w-5" aria-hidden="true" />} title="Sin documentos" description="Los archivos que suba el cliente o tu equipo aparecerán aquí." />
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
                    {formatBytes(d.size_bytes)} · {d.uploaded_by_kind === 'cliente' ? 'Cliente' : 'Tu equipo'} · {formatDateTime(d.created_at)}
                    {reqLabel(d.requisito_id) && <> · {reqLabel(d.requisito_id)}</>}
                  </p>
                </div>
              </div>
              <Button size="sm" variant="secondary" onClick={() => void open(d)} disabled={opening === d.id} leading={<Download className="h-4 w-4" aria-hidden="true" />} aria-label={`Descargar ${d.original_name}`}>
                {opening === d.id ? 'Abriendo…' : 'Descargar'}
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
          <FileUploader onUpload={onUpload} label="Adjuntar archivo (visible para el cliente)" compact />
        </div>
      )}
    </Card>
  )
}

/* ---------------- Cronología ---------------- */

const EVENT_LABEL: Record<string, string> = {
  'solicitud.created': 'Solicitud creada',
  'solicitud.link_created': 'Enlace del cliente generado',
  'solicitud.links_revoked': 'Enlaces revocados',
  'solicitud.info_requested': 'Información solicitada al cliente',
  'solicitud.analyzed': 'Comprobación de suficiencia',
  'solicitud.message': 'Mensaje enviado al cliente',
  'solicitud.client_message': 'El cliente escribió un mensaje',
  'solicitud.submitted': 'El cliente envió el formulario',
  'solicitud.document.added': 'Documento adjuntado',
}

function eventText(e: SolicitudEvento): string {
  const m = e.metadata ?? {}
  if (e.action.startsWith('solicitud.status.')) {
    const to = e.action.slice('solicitud.status.'.length) as SolicitudStatus
    if (m.reason === 'reopen') return `Solicitud reabierta (${STATUS_LABEL[to] ?? to})`
    return `Estado: ${STATUS_LABEL[to] ?? to}${typeof m.reason === 'string' && m.reason ? ` · ${m.reason}` : ''}`
  }
  if (e.action.startsWith('solicitud.requirement.')) return `Requisito marcado como ${REQUISITO_LABEL[e.action.slice('solicitud.requirement.'.length) as keyof typeof REQUISITO_LABEL] ?? e.action}`
  const base = EVENT_LABEL[e.action] ?? e.action.replace('solicitud.', '').replace(/[._]/g, ' ')
  if (e.action === 'solicitud.analyzed' && typeof m.completeness === 'number') return `${base}: ${m.completeness}%`
  if (e.action === 'solicitud.submitted' && typeof m.completeness === 'number') return `${base} (${m.completeness}%)`
  if (e.action === 'solicitud.document.added') return m.by === 'cliente' ? 'El cliente adjuntó un documento' : 'Tu equipo adjuntó un documento'
  return base
}

export function Cronologia({ eventos }: { eventos: SolicitudEvento[] }) {
  return (
    <Card className="p-5">
      <CardHeader title="Cronología" as="h3" />
      {eventos.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Sin actividad registrada.</p>
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
