import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Inbox, Plus, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button, ButtonLink } from '../../components/v2/Button'
import { Card, EmptyState, StatusPill } from '../../components/v2/Card'
import { INPUT_CLS } from '../../components/forms/Field'
import { listSolicitudes } from '../../lib/solicitudes/api'
import { CHANNEL_ORDER, channelLabel, isSourceChannel, PENDING_FOR_EMPRESA, statusLabel, STATUS_ORDER, STATUS_TONE } from '../../lib/solicitudes/status'
import { formatRelative } from '../../lib/intl'
import type { SolicitudResumen, SolicitudStatus, SourceChannel } from '../../lib/solicitudes/types'
import { EMPRESA_PATHS, solicitudPath } from '../../lib/routing'

const FIELD_CLS = `${INPUT_CLS} border-slate-200 focus:border-brand-400 focus:ring-brand-100`

export interface InboxFilter {
  q: string
  status: SolicitudStatus | ''
  channel: SourceChannel | ''
  pending: boolean
}

/** Filtra la bandeja en cliente (búsqueda por cliente, contacto, asunto y tipo). */
export function filterInbox(rows: SolicitudResumen[], f: InboxFilter): SolicitudResumen[] {
  const q = f.q.trim().toLowerCase()
  return rows.filter((r) => {
    if (f.status && r.status !== f.status) return false
    if (f.channel && r.source_channel !== f.channel) return false
    if (f.pending && !(PENDING_FOR_EMPRESA.includes(r.status) || r.unread_count > 0)) return false
    if (!q) return true
    const hay = [r.cliente_name, r.contact_name, r.contact_email, r.title, r.service_type].filter(Boolean).join(' ').toLowerCase()
    return hay.includes(q)
  })
}

function readFilter(p: URLSearchParams): InboxFilter {
  const status = p.get('estado') ?? ''
  const channel = p.get('canal') ?? ''
  return {
    q: p.get('q') ?? '',
    status: (STATUS_ORDER as string[]).includes(status) ? (status as SolicitudStatus) : '',
    channel: isSourceChannel(channel) ? channel : '',
    pending: p.get('pendientes') === '1',
  }
}

function Completeness({ value }: { value: number }) {
  const { t } = useTranslation()
  const v = Math.max(0, Math.min(100, value))
  const tone = v >= 80 ? 'bg-emerald-500' : v >= 40 ? 'bg-amber-500' : 'bg-slate-400'
  return (
    <div className="flex items-center gap-2" role="img" aria-label={t('requests.inbox.completenessLabel', { value: v })}>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${v}%` }} />
      </div>
      <span className="text-xs tabular-nums text-slate-600" aria-hidden="true">
        {v}%
      </span>
    </div>
  )
}

function UnreadBadge({ n }: { n: number }) {
  const { t } = useTranslation()
  if (n <= 0) return null
  return (
    <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-600 px-1.5 text-[11px] font-semibold text-white" aria-label={t('requests.inbox.unreadMessages', { count: n })}>
      {n}
    </span>
  )
}

export default function SolicitudesInbox() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const filter = useMemo(() => readFilter(params), [params])
  const [rows, setRows] = useState<SolicitudResumen[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    listSolicitudes()
      .then((r) => alive && setRows(r))
      .catch((e: Error) => alive && setError(e.message))
    return () => {
      alive = false
    }
  }, [])

  function update(patch: Partial<InboxFilter>) {
    const next = { ...filter, ...patch }
    const p = new URLSearchParams()
    if (next.q) p.set('q', next.q)
    if (next.status) p.set('estado', next.status)
    if (next.channel) p.set('canal', next.channel)
    if (next.pending) p.set('pendientes', '1')
    setParams(p, { replace: true })
  }

  const visible = rows ? filterInbox(rows, filter) : []
  const hasFilters = !!(filter.q || filter.status || filter.channel || filter.pending)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t('requests.inbox.title')}</h1>
          <p className="mt-1 text-sm text-slate-600">{t('requests.inbox.subtitle')}</p>
        </div>
        <ButtonLink to={EMPRESA_PATHS.nuevaSolicitud} leading={<Plus className="h-4 w-4" aria-hidden="true" />}>
          {t('requests.inbox.new')}
        </ButtonLink>
      </div>

      <Card className="p-3 sm:p-4">
        <form role="search" className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto]" onSubmit={(e) => e.preventDefault()}>
          <label className="relative block">
            <span className="sr-only">{t('requests.inbox.searchLabel')}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input type="search" value={filter.q} onChange={(e) => update({ q: e.target.value })} placeholder={t('requests.inbox.searchPlaceholder')} className={`${FIELD_CLS} pl-9`} />
          </label>
          <label className="block">
            <span className="sr-only">{t('requests.inbox.statusFilter')}</span>
            <select value={filter.status} onChange={(e) => update({ status: e.target.value as InboxFilter['status'] })} className={FIELD_CLS}>
              <option value="">{t('requests.inbox.allStatuses')}</option>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="sr-only">{t('requests.inbox.channelFilter')}</span>
            <select value={filter.channel} onChange={(e) => update({ channel: e.target.value as InboxFilter['channel'] })} className={FIELD_CLS}>
              <option value="">{t('requests.inbox.allChannels')}</option>
              {CHANNEL_ORDER.map((c) => (
                <option key={c} value={c}>
                  {channelLabel(c)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => update({ pending: !filter.pending })}
            aria-pressed={filter.pending}
            className={`inline-flex h-[42px] items-center justify-center rounded-xl border px-4 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
              filter.pending ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {t('requests.inbox.onlyPending')}
          </button>
        </form>
      </Card>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}

      {rows === null && !error && (
        <p className="text-sm text-slate-500" aria-live="polite">
          {t('requests.inbox.loading')}
        </p>
      )}

      {rows !== null && visible.length === 0 && (
        <EmptyState
          icon={<Inbox className="h-5 w-5" aria-hidden="true" />}
          title={hasFilters ? t('requests.inbox.emptyFiltered') : t('requests.inbox.empty')}
          description={hasFilters ? t('requests.inbox.emptyFilteredHint') : t('requests.inbox.emptyHint')}
          action={
            hasFilters ? (
              <Button variant="secondary" size="sm" onClick={() => setParams({}, { replace: true })}>
                {t('common.actions.clearFilters')}
              </Button>
            ) : (
              <ButtonLink to={EMPRESA_PATHS.nuevaSolicitud} size="sm" leading={<Plus className="h-4 w-4" aria-hidden="true" />}>
                {t('requests.inbox.new')}
              </ButtonLink>
            )
          }
        />
      )}

      {visible.length > 0 && (
        <>
          <p className="text-xs text-slate-500" aria-live="polite">
            {t('requests.inbox.count', { visible: visible.length, total: rows?.length ?? 0 })}
          </p>
          {/* Tabla en escritorio */}
          <Card className="hidden overflow-hidden md:block">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3">{t('requests.inbox.columns.client')}</th>
                  <th scope="col" className="px-4 py-3">{t('requests.inbox.columns.subject')}</th>
                  <th scope="col" className="px-4 py-3">{t('requests.inbox.columns.completeness')}</th>
                  <th scope="col" className="px-4 py-3">{t('requests.inbox.columns.status')}</th>
                  <th scope="col" className="px-4 py-3">{t('requests.inbox.columns.lastActivity')}</th>
                  <th scope="col" className="px-4 py-3 text-right">
                    <span className="sr-only">{t('requests.inbox.columns.unread')}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => navigate(solicitudPath(r.id))}
                    className={`cursor-pointer hover:bg-slate-50 ${r.unread_count > 0 ? 'bg-brand-50/30' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <Link to={solicitudPath(r.id)} className="font-medium text-slate-900 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" onClick={(e) => e.stopPropagation()}>
                        {r.cliente_name ?? r.contact_name}
                      </Link>
                      {r.cliente_name && r.cliente_name !== r.contact_name && <p className="text-xs text-slate-500">{r.contact_name}</p>}
                      <p className="text-xs text-slate-500">{channelLabel(r.source_channel)}</p>
                    </td>
                    <td className="max-w-[26rem] px-4 py-3">
                      <p className="truncate text-slate-800">{r.title}</p>
                      {r.service_type && <p className="truncate text-xs text-slate-500">{r.service_type}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <Completeness value={r.completeness} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill tone={STATUS_TONE[r.status]}>{statusLabel(r.status)}</StatusPill>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatRelative(r.last_activity_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <UnreadBadge n={r.unread_count} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          {/* Tarjetas en móvil */}
          <ul className="space-y-2 md:hidden">
            {visible.map((r) => (
              <li key={r.id}>
                <Link to={solicitudPath(r.id)} className={`block rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,.04)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${r.unread_count > 0 ? 'border-l-4 border-l-brand-600' : ''}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{r.cliente_name ?? r.contact_name}</p>
                      <p className="truncate text-sm text-slate-700">{r.title}</p>
                    </div>
                    <UnreadBadge n={r.unread_count} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <StatusPill tone={STATUS_TONE[r.status]}>{statusLabel(r.status)}</StatusPill>
                    <Completeness value={r.completeness} />
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    {channelLabel(r.source_channel)} · {formatRelative(r.last_activity_at)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
