/** Formateadores de fecha en español para solicitudes y notificaciones. */

const DATE_FMT = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
const DATETIME_FMT = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : DATE_FMT.format(d)
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : DATETIME_FMT.format(d)
}

/** «hace 5 min», «hace 3 h», «ayer», «hace 4 días»; fechas futuras → «en N días». */
export function formatRelative(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return '—'
  const diff = now - t
  const abs = Math.abs(diff)
  const min = Math.round(abs / 60_000)
  const h = Math.round(abs / 3_600_000)
  const days = Math.round(abs / 86_400_000)
  if (diff >= 0) {
    if (min < 1) return 'ahora mismo'
    if (min < 60) return `hace ${min} min`
    if (h < 24) return `hace ${h} h`
    if (days === 1) return 'ayer'
    if (days < 30) return `hace ${days} días`
    return formatDate(iso)
  }
  if (days < 1) return 'hoy'
  if (days === 1) return 'mañana'
  return `en ${days} días`
}
