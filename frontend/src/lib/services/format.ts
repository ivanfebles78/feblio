// Feblio · Formato de los importes y precios del catálogo según el idioma de la interfaz.
import { formatCurrency } from '../intl'
import { currentLanguage } from '../../i18n'
import { t } from '../../i18n'
import type { CatalogRow, PriceVersion, PricingMode } from './types'

/** Importe en la moneda de la versión (la moneda la decide cada servicio, no la interfaz). */
export function money(amount: number | null | undefined, currency: string | null | undefined): string {
  if (amount === null || amount === undefined) return '—'
  return formatCurrency(Number(amount), currentLanguage(), (currency ?? 'EUR').toUpperCase())
}

/** Texto del precio: «150,00 €», «Desde 150,00 €», «90,00 € / hora» o «Bajo valoración». */
export function priceLabel(p: {
  pricing_mode?: PricingMode | null
  base_price?: number | null
  currency?: string | null
  unit?: string | null
}): string {
  if (!p.pricing_mode) return t('services.price.noVersion')
  if (p.pricing_mode === 'on_assessment') return t('services.price.onAssessment')
  const amount = money(p.base_price, p.currency)
  if (p.pricing_mode === 'from') return t('services.price.from', { amount })
  if (p.pricing_mode === 'hourly' || p.pricing_mode === 'per_unit') return t('services.price.perUnit', { amount, unit: p.unit || '—' })
  return amount
}

/** Texto del impuesto: «IGIC 7%» o «Exento». */
export function taxLabel(p: { tax_type?: string | null; tax_rate?: number | null }): string {
  if (!p.tax_type) return '—'
  if (p.tax_type === 'EXENTO') return t('services.price.exempt')
  return t('services.price.taxLine', { type: p.tax_type, rate: p.tax_rate ?? 0 })
}

export const rowPrice = (row: CatalogRow) => priceLabel(row)
export const versionPrice = (v: PriceVersion) => priceLabel(v)
