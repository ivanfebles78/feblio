// Feblio · Historial de precios de un servicio (solo lectura: las versiones son inmutables).
import { useTranslation } from 'react-i18next'
import { Modal } from '../v2/Modal'
import { Button } from '../v2/Button'
import { formatDate } from '../../lib/intl'
import { taxLabel, versionPrice } from '../../lib/services/format'
import type { PriceVersion } from '../../lib/services/types'

export interface PriceHistoryProps {
  open: boolean
  code: string
  versions: PriceVersion[]
  loading?: boolean
  error?: string | null
  onClose: () => void
  today?: string
}

/** Estado de una versión según su ventana de vigencia [valid_from, valid_to). */
export function versionState(v: Pick<PriceVersion, 'valid_from' | 'valid_to'>, today: string): 'current' | 'scheduled' | 'past' {
  if (v.valid_from > today) return 'scheduled'
  if (v.valid_to === null || today < v.valid_to) return 'current'
  return 'past'
}

const STATE_STYLES: Record<string, string> = {
  current: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  scheduled: 'bg-amber-50 text-amber-700 ring-amber-200',
  past: 'bg-slate-100 text-slate-600 ring-slate-200',
}

export function PriceHistory({ open, code, versions, loading, error, onClose, today }: PriceHistoryProps) {
  const { t } = useTranslation()
  const ref = today ?? new Date().toISOString().slice(0, 10)

  return (
    <Modal
      open={open}
      title={t('services.history.title', { code })}
      description={t('services.history.immutable')}
      onClose={onClose}
      size="lg"
      footer={<Button onClick={onClose}>{t('services.actions.close')}</Button>}
    >
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {error}
        </p>
      )}
      {!error && !loading && versions.length === 0 && <p className="text-sm text-slate-600">{t('services.history.empty')}</p>}
      {versions.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="py-2 pr-3 font-medium">{t('services.columns.version')}</th>
                <th scope="col" className="py-2 pr-3 font-medium">{t('services.columns.price')}</th>
                <th scope="col" className="py-2 pr-3 font-medium">{t('services.columns.tax')}</th>
                <th scope="col" className="py-2 pr-3 font-medium">{t('services.columns.validFrom')}</th>
                <th scope="col" className="py-2 pr-3 font-medium">{t('services.columns.validTo')}</th>
                <th scope="col" className="py-2 font-medium">{t('services.columns.status')}</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => {
                const state = versionState(v, ref)
                return (
                  <tr key={v.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-3 font-mono text-xs text-slate-500">v{v.version_no}</td>
                    <td className="py-2 pr-3 font-medium text-slate-900">
                      {versionPrice(v)}
                      <span className="ml-2 text-xs font-normal text-slate-500">{t(`services.modeShort.${v.pricing_mode}`)}</span>
                    </td>
                    <td className="py-2 pr-3 text-slate-600">
                      {taxLabel(v)}
                    </td>
                    <td className="py-2 pr-3 text-slate-600">{formatDate(v.valid_from)}</td>
                    <td className="py-2 pr-3 text-slate-600">{v.valid_to ? formatDate(v.valid_to) : '—'}</td>
                    <td className="py-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATE_STYLES[state]}`}>
                        {t(`services.history.${state}`)}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}
