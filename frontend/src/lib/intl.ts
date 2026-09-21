import { currentLanguage, INTL_LOCALE, t, type Language } from '../i18n'

/**
 * Formatos regionales centralizados (Intl). Cambiar de idioma solo cambia la presentación:
 * los importes, la moneda (EUR), la zona horaria de la empresa y los cálculos no varían.
 *   es → es-ES · en → en-GB
 */
export function intlLocale(lang: Language = currentLanguage()): string {
  return INTL_LOCALE[lang]
}

const cache = new Map<string, Intl.DateTimeFormat | Intl.NumberFormat>()
function dateFormatter(options: Intl.DateTimeFormatOptions, lang: Language, timeZone?: string): Intl.DateTimeFormat {
  const key = `d:${lang}:${timeZone ?? ''}:${JSON.stringify(options)}`
  let f = cache.get(key) as Intl.DateTimeFormat | undefined
  if (!f) {
    f = new Intl.DateTimeFormat(intlLocale(lang), { ...options, ...(timeZone ? { timeZone } : {}) })
    cache.set(key, f)
  }
  return f
}
function numberFormatter(options: Intl.NumberFormatOptions, lang: Language): Intl.NumberFormat {
  const key = `n:${lang}:${JSON.stringify(options)}`
  let f = cache.get(key) as Intl.NumberFormat | undefined
  if (!f) {
    f = new Intl.NumberFormat(intlLocale(lang), options)
    cache.set(key, f)
  }
  return f
}

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export interface DateOptions {
  lang?: Language
  /** Zona horaria configurada por la empresa (IANA). Si falta, la del navegador. */
  timeZone?: string
}

/** 19 sept 2026 · 19 Sept 2026 */
export function formatDate(value: string | number | Date | null | undefined, opts: DateOptions = {}): string {
  const d = toDate(value)
  return d ? dateFormatter({ day: 'numeric', month: 'short', year: 'numeric' }, opts.lang ?? currentLanguage(), opts.timeZone).format(d) : '—'
}

/** 19 sept, 22:54 · 19 Sept, 22:54 */
export function formatDateTime(value: string | number | Date | null | undefined, opts: DateOptions = {}): string {
  const d = toDate(value)
  return d ? dateFormatter({ day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }, opts.lang ?? currentLanguage(), opts.timeZone).format(d) : '—'
}

/** 19/09/2026 · 19/09/2026 (numérica, para tablas) */
export function formatShortDate(value: string | number | Date | null | undefined, opts: DateOptions = {}): string {
  const d = toDate(value)
  return d ? dateFormatter({ day: '2-digit', month: '2-digit', year: 'numeric' }, opts.lang ?? currentLanguage(), opts.timeZone).format(d) : '—'
}

/** 22:54 */
export function formatTime(value: string | number | Date | null | undefined, opts: DateOptions = {}): string {
  const d = toDate(value)
  return d ? dateFormatter({ hour: '2-digit', minute: '2-digit' }, opts.lang ?? currentLanguage(), opts.timeZone).format(d) : '—'
}

export function formatNumber(value: number, options: Intl.NumberFormatOptions = {}, lang: Language = currentLanguage()): string {
  return numberFormatter(options, lang).format(value)
}

/** Importes siempre en EUR (la moneda no cambia con el idioma). */
export function formatCurrency(value: number, lang: Language = currentLanguage(), currency = 'EUR'): string {
  return numberFormatter({ style: 'currency', currency, maximumFractionDigits: 2 }, lang).format(value)
}

export function formatPercent(value: number, lang: Language = currentLanguage()): string {
  return numberFormatter({ style: 'percent', maximumFractionDigits: 0 }, lang).format(value / 100)
}

/** «hace 5 min», «ayer», «en 3 días» · "5 min ago", "yesterday", "in 3 days" */
export function formatRelative(value: string | number | Date | null | undefined, now: number = Date.now()): string {
  const d = toDate(value)
  if (!d) return '—'
  const diff = now - d.getTime()
  const abs = Math.abs(diff)
  const min = Math.round(abs / 60_000)
  const h = Math.round(abs / 3_600_000)
  const days = Math.round(abs / 86_400_000)
  if (diff >= 0) {
    if (min < 1) return t('common.relative.now')
    if (min < 60) return t('common.relative.minutesAgo', { count: min })
    if (h < 24) return t('common.relative.hoursAgo', { count: h })
    if (days === 1) return t('common.relative.yesterday')
    if (days < 30) return t('common.relative.daysAgo', { count: days })
    return formatDate(d)
  }
  if (days < 1) return t('common.relative.today')
  if (days === 1) return t('common.relative.tomorrow')
  return t('common.relative.inDays', { count: days })
}
