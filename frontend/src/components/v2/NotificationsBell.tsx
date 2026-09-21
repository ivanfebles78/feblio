import { useEffect, useRef, useState } from 'react'
import { Bell, CheckCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Notificacion } from '../../lib/solicitudes/types'
import { formatRelative } from '../../lib/intl'

type TFn = (key: string, opts?: Record<string, unknown>) => string

/**
 * Los títulos los genera el servidor con un prefijo fijo en español seguido, en su caso, del título de
 * la solicitud («Formulario recibido: Reforma»). El prefijo se traduce por el código `type`; el título de
 * la solicitud (texto de la empresa) se conserva tal cual. Tipos desconocidos se muestran sin cambios.
 */
export function notificationTitle(n: Pick<Notificacion, 'type' | 'title'>, t: TFn): string {
  const code = n.type.startsWith('solicitud.') ? n.type.slice('solicitud.'.length) : ''
  const key = `dashboard.notifications.types.${code}`
  const translated = code ? t(key, { defaultValue: '' }) : ''
  if (!translated) return n.title
  const idx = n.title.indexOf(': ')
  return idx > 0 ? `${translated}: ${n.title.slice(idx + 2)}` : translated
}

/** Cuerpo: «Ana ha enviado el formulario (88% completo).» se traduce; el resto es texto del usuario o nombre de archivo. */
export function notificationBody(n: Pick<Notificacion, 'type' | 'body'>, t: TFn): string {
  const body = n.body ?? ''
  if (n.type === 'solicitud.submitted') {
    const m = /^(.*) ha enviado el formulario \((\d+)% completo\)\.$/.exec(body)
    if (m) return t('dashboard.notifications.submittedBody', { name: m[1], percent: m[2] })
  }
  return body
}

export interface NotificationsBellProps {
  items: Notificacion[]
  unread: number
  loading?: boolean
  error?: string | null
  onMarkOne: (id: string) => void
  onMarkAll: () => void
  /** Navegación al recurso enlazado (link_path relativo). */
  onOpen: (path: string) => void
}

/**
 * Campana del AppShell con panel desplegable: contador de no leídas, lista, marcar una o todas
 * y enlace al recurso. Panel accesible: aria-expanded, Escape cierra, clic fuera cierra.
 */
export function NotificationsBell({ items, unread, loading = false, error = null, onMarkOne, onMarkAll, onOpen }: NotificationsBellProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open])

  function activate(n: Notificacion) {
    if (!n.read_at) onMarkOne(n.id)
    if (n.link_path) {
      setOpen(false)
      onOpen(n.link_path)
    }
  }

  const label = unread > 0 ? t('common.a11y.notificationsUnread', { count: unread }) : t('common.a11y.notifications')
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        className="relative rounded-md p-2 text-slate-600 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-white" aria-hidden="true">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label={t('common.a11y.notifications')} className="absolute right-0 z-40 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <p className="text-sm font-semibold text-slate-900">{t('common.a11y.notifications')}</p>
            <button
              type="button"
              onClick={onMarkAll}
              disabled={unread === 0}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
            >
              <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
              {t('dashboard.notifications.markAllRead')}
            </button>
          </div>
          <ul className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto" aria-live="polite">
            {loading && items.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-500">{t('common.state.loading')}</li>}
            {error && (
              <li className="px-4 py-3 text-sm text-red-700" role="alert">
                {error}
              </li>
            )}
            {!loading && !error && items.length === 0 && <li className="px-4 py-8 text-center text-sm text-slate-500">{t('dashboard.notifications.empty')}</li>}
            {items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => activate(n)}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 focus:bg-slate-50 focus:outline-none ${n.read_at ? '' : 'bg-brand-50/40'}`}
                >
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? 'bg-transparent ring-1 ring-slate-300' : 'bg-brand-600'}`} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm ${n.read_at ? 'font-medium text-slate-700' : 'font-semibold text-slate-900'}`}>{notificationTitle(n, t)}</span>
                    {n.body && <span className="mt-0.5 line-clamp-2 block text-xs text-slate-600">{notificationBody(n, t)}</span>}
                    <span className="mt-1 block text-[11px] text-slate-500">
                      {formatRelative(n.created_at)}
                      {!n.read_at && <span className="sr-only"> · {t('dashboard.notifications.unread')}</span>}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
