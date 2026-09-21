import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { businessDayLabel, type BusinessHours } from '../../lib/validation'
import { FieldMessage } from './Field'

interface BusinessHoursEditorProps {
  value: BusinessHours
  onChange: (v: BusinessHours) => void
  error?: string
  legend?: string
}

const TIME_CLS = 'rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50 disabled:text-slate-400'

/** Editor de horario semanal accesible (tabla con checkbox y horas). */
export function BusinessHoursEditor({ value, onChange, error, legend }: BusinessHoursEditorProps) {
  const { t } = useTranslation()
  const id = useId()
  const msgId = `${id}-msg`
  function update(day: string, patch: Partial<BusinessHours[string]>) {
    onChange({ ...value, [day]: { ...value[day], ...patch } })
  }
  return (
    <fieldset aria-describedby={error ? msgId : undefined}>
      <legend className="mb-2 text-xs font-medium text-slate-600">{legend ?? t('auth.forms.businessHours.legend')}</legend>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sr-only">
            <tr>
              <th scope="col">{t('auth.forms.businessHours.day')}</th>
              <th scope="col">{t('auth.forms.businessHours.active')}</th>
              <th scope="col">{t('auth.forms.businessHours.from')}</th>
              <th scope="col">{t('auth.forms.businessHours.to')}</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(value).map(([day, h]) => {
              const cid = `${id}-${day}`
              const dayLabel = businessDayLabel(day)
              return (
                <tr key={day} className="border-b border-slate-100 last:border-0">
                  <th scope="row" className="py-1.5 pr-2 text-left text-xs font-medium capitalize text-slate-700">
                    <label htmlFor={cid}>{dayLabel}</label>
                  </th>
                  <td className="py-1.5 pr-2">
                    <input id={cid} type="checkbox" checked={h.enabled} onChange={(e) => update(day, { enabled: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-300" />
                  </td>
                  <td className="py-1.5 pr-2">
                    <label className="sr-only" htmlFor={`${cid}-from`}>
                      {t('auth.forms.businessHours.fromDay', { day: dayLabel })}
                    </label>
                    <input id={`${cid}-from`} type="time" value={h.from} disabled={!h.enabled} onChange={(e) => update(day, { from: e.target.value })} className={TIME_CLS} />
                  </td>
                  <td className="py-1.5">
                    <label className="sr-only" htmlFor={`${cid}-to`}>
                      {t('auth.forms.businessHours.toDay', { day: dayLabel })}
                    </label>
                    <input id={`${cid}-to`} type="time" value={h.to} disabled={!h.enabled} onChange={(e) => update(day, { to: e.target.value })} className={TIME_CLS} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <FieldMessage id={msgId} error={error} />
    </fieldset>
  )
}
