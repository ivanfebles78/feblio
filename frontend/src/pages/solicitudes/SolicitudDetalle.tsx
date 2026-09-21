import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Link2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/v2/Button'
import { Card, CardHeader, StatusPill } from '../../components/v2/Card'
import { MessageThread } from '../../components/solicitudes/MessageThread'
import { CompletenessCard } from './detalle/CompletenessCard'
import { CloseDialog, LinkDialog, RequestInfoDialog, type RequestInfoItem } from './detalle/Dialogs'
import { Cronologia, DatosRecibidos, DocumentosPanel, RequisitosPanel } from './detalle/Panels'
import * as api from '../../lib/solicitudes/api'
import { empresaObjectPath, uploadSolicitudFile } from '../../lib/solicitudes/files'
import { formatDate, formatDateTime } from '../../lib/intl'
import { channelLabel, empresaActions, statusLabel, STATUS_TONE } from '../../lib/solicitudes/status'
import type { SolicitudStatus } from '../../lib/solicitudes/types'
import { appUrl } from '../../lib/env'
import { clientLinkPath, EMPRESA_PATHS } from '../../lib/routing'

type Dialog = 'link' | 'request' | 'close' | null
interface LinkState {
  enlace?: { token: string; expires_at: string }
}

function buildClientUrl(token: string): string {
  return `${appUrl().replace(/\/$/, '')}${clientLinkPath(token)}`
}

export default function SolicitudDetalle({ empresaId }: { empresaId: string }) {
  const { t } = useTranslation()
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [data, setData] = useState<api.SolicitudDetalle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [freshLink, setFreshLink] = useState<{ url: string; expires_at: string } | null>(() => {
    const st = location.state as LinkState | null
    return st?.enlace ? { url: buildClientUrl(st.enlace.token), expires_at: st.enlace.expires_at } : null
  })
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const d = await api.getSolicitud(id)
      setData(d)
      setError(null)
      if (d.mensajes.some((m) => m.author_kind !== 'empresa' && !m.read_by_empresa_at)) await api.marcarLeida(id).catch(() => undefined)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('requests.api.loadOne'))
    }
  }, [id, t])

  useEffect(() => {
    void load()
    // Actividad del cliente en tiempo real + recarga al volver a la pestaña (respaldo)
    const unsubscribe = api.subscribeSolicitud(id, () => void load())
    const onFocus = () => void load()
    window.addEventListener('focus', onFocus)
    return () => {
      unsubscribe()
      window.removeEventListener('focus', onFocus)
    }
  }, [id, load])

  useEffect(() => {
    // Enlace recién creado desde «Nueva solicitud»: se muestra una sola vez y se limpia del historial
    if (freshLink) {
      setDialog('link')
      navigate(location.pathname, { replace: true, state: null })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function run(action: () => Promise<unknown>, okMessage?: string) {
    setBusy(true)
    setNotice(null)
    try {
      await action()
      await load()
      if (okMessage) setNotice(okMessage)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('requests.detail.actionFailed'))
    } finally {
      setBusy(false)
    }
  }

  const changeStatus = (to: SolicitudStatus, motivo?: string) => run(() => api.cambiarEstado(id, to, motivo), t('requests.detail.statusUpdated', { status: statusLabel(to) }))

  async function generateLink() {
    setBusy(true)
    try {
      const r = await api.generarEnlace(id)
      setFreshLink({ url: buildClientUrl(r.token), expires_at: r.expires_at })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('requests.api.generateLink'))
    } finally {
      setBusy(false)
    }
  }

  async function revokeLinks() {
    await run(() => api.revocarEnlaces(id), t('requests.detail.accessRevoked'))
    setFreshLink(null)
    setDialog(null)
  }

  async function requestInfo(items: RequestInfoItem[], message: string) {
    await api.solicitarInformacion(id, items, message || undefined)
    await load()
    setDialog(null)
    setNotice(t('requests.detail.requestSent'))
  }

  async function closeWithReason(reason: string) {
    await api.cambiarEstado(id, 'closed', reason)
    await load()
    setDialog(null)
    setNotice(t('requests.detail.closed'))
  }

  async function uploadEmpresaFile(file: File, mime: string, ext: string) {
    const path = empresaObjectPath(empresaId, id, ext)
    await uploadSolicitudFile(path, file, mime)
    await api.registrarDocumentoEmpresa(id, path, file.name, mime, file.size)
    await load()
  }

  if (error && !data) {
    return (
      <div className="space-y-4">
        <Link to={EMPRESA_PATHS.solicitudes} className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t('requests.backToList')}
        </Link>
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      </div>
    )
  }
  if (!data) return <p className="text-sm text-slate-500">{t('requests.detail.loading')}</p>

  const { solicitud: s, cliente } = data
  const latest = data.analisis[0] ?? null
  const activeAccess = data.accesos.find((a) => !a.revoked_at && new Date(a.expires_at).getTime() > Date.now()) ?? null
  const actions = empresaActions(s.status)
  const conversationClosed = s.status === 'closed'
  const activeLinkText = !activeAccess
    ? t('requests.detail.summary.noActiveLink')
    : activeAccess.last_used_at
      ? t('requests.detail.summary.activeLinkUsed', { date: formatDate(activeAccess.expires_at), lastUsed: formatDateTime(activeAccess.last_used_at) })
      : t('requests.detail.summary.activeLink', { date: formatDate(activeAccess.expires_at) })

  return (
    <div className="space-y-5">
      <Link to={EMPRESA_PATHS.solicitudes} className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t('requests.backToList')}
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{s.title}</h1>
            <StatusPill tone={STATUS_TONE[s.status]}>{statusLabel(s.status)}</StatusPill>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {cliente?.name ?? s.contact_name}
            {cliente && cliente.name !== s.contact_name && ` · ${s.contact_name}`} · {channelLabel(s.source_channel)} · {t('requests.detail.createdOn', { date: formatDate(s.created_at) })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('requests.actions.groupLabel')}>
          {actions.map((a) => {
            if (a.key === 'link')
              return (
                <Button key={a.key} variant="secondary" size="sm" onClick={() => setDialog('link')} disabled={busy} leading={<Link2 className="h-4 w-4" aria-hidden="true" />}>
                  {a.label}
                </Button>
              )
            if (a.key === 'request_info')
              return (
                <Button key={a.key} variant="secondary" size="sm" onClick={() => setDialog('request')} disabled={busy}>
                  {a.label}
                </Button>
              )
            if (a.key === 'reanalyze') return null // vive en la tarjeta de completitud
            if (a.key === 'close')
              return (
                <Button key={a.key} variant="ghost" size="sm" onClick={() => setDialog('close')} disabled={busy}>
                  {a.label}
                </Button>
              )
            if (a.key === 'reopen')
              return (
                <Button key={a.key} size="sm" onClick={() => void changeStatus('under_review', 'reopen')} disabled={busy}>
                  {a.label}
                </Button>
              )
            return (
              <Button key={a.key} variant={a.key === 'ready' ? 'primary' : 'secondary'} size="sm" onClick={() => a.to && void changeStatus(a.to)} disabled={busy}>
                {a.label}
              </Button>
            )
          })}
        </div>
      </header>

      {notice && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <CompletenessCard analysis={latest} completeness={s.completeness} onReanalyze={actions.some((a) => a.key === 'reanalyze') ? () => void run(() => api.analizarSolicitud(id), t('requests.detail.checkUpdated')) : undefined} busy={busy} />
          <DatosRecibidos formData={s.form_data} template={data.template} submittedAt={s.form_submitted_at} />
          <RequisitosPanel requisitos={data.requisitos} onResolve={(rid, estado) => void run(() => api.resolverRequisito(rid, estado))} busy={busy} />
          <DocumentosPanel documentos={data.documentos} requisitos={data.requisitos} onUpload={uploadEmpresaFile} canUpload={!conversationClosed} />
          <Card className="p-5">
            <CardHeader title={t('requests.detail.conversation.title')} description={t('requests.detail.conversation.description')} />
            <div className="mt-3">
              <MessageThread
                viewer="empresa"
                messages={data.mensajes.map((m) => ({ id: m.id, author_kind: m.author_kind, author_name: m.author_name, kind: m.kind, body: m.body, created_at: m.created_at, read: m.author_kind === 'empresa' ? !!m.read_by_cliente_at : undefined }))}
                onSend={async (body) => {
                  await api.enviarMensaje(id, body)
                  await load()
                }}
                disabled={conversationClosed}
                disabledReason={t('requests.detail.conversation.closed')}
              />
            </div>
          </Card>
        </div>

        <aside className="space-y-5">
          <Card className="p-5">
            <CardHeader title={t('requests.detail.summary.title')} as="h3" />
            <dl className="mt-3 space-y-2.5 text-sm">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('requests.detail.summary.client')}</dt>
                <dd className="text-slate-800">{cliente?.name ?? t('requests.detail.summary.noClientRecord')}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('requests.detail.summary.contact')}</dt>
                <dd className="text-slate-800">
                  {s.contact_name}
                  {s.contact_email && <span className="block text-slate-600">{s.contact_email}</span>}
                  {s.contact_phone && <span className="block text-slate-600">{s.contact_phone}</span>}
                </dd>
              </div>
              {s.service_type && (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('requests.detail.summary.service')}</dt>
                  <dd className="text-slate-800">{s.service_type}</dd>
                </div>
              )}
              {s.description && (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('requests.detail.summary.notes')}</dt>
                  <dd className="whitespace-pre-wrap text-slate-800">{s.description}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('requests.detail.summary.deadline')}</dt>
                <dd className="text-slate-800">{s.deadline ? formatDate(s.deadline) : t('requests.detail.summary.noDeadline')}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('requests.detail.summary.lastActivity')}</dt>
                <dd className="text-slate-800">{formatDateTime(s.last_activity_at)}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('requests.detail.summary.clientLink')}</dt>
                <dd className="text-slate-800">{activeLinkText}</dd>
              </div>
              {s.status === 'closed' && s.closed_reason && (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('requests.detail.summary.closeReason')}</dt>
                  <dd className="text-slate-800">{s.closed_reason}</dd>
                </div>
              )}
            </dl>
          </Card>
          <Cronologia eventos={data.eventos} />
        </aside>
      </div>

      <LinkDialog open={dialog === 'link'} onClose={() => setDialog(null)} link={freshLink} activeExpiresAt={activeAccess?.expires_at ?? null} onGenerate={generateLink} onRevoke={revokeLinks} busy={busy} />
      <RequestInfoDialog open={dialog === 'request'} onClose={() => setDialog(null)} suggestedFields={latest?.missing ?? []} suggestedDocuments={latest?.missing_documents ?? []} onSubmit={requestInfo} busy={busy} />
      <CloseDialog open={dialog === 'close'} onClose={() => setDialog(null)} onSubmit={closeWithReason} busy={busy} />
    </div>
  )
}
