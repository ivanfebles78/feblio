import type { IntakeFormTemplate } from '../../../../lib/onboarding/types'
import { INPUT_CLS } from '../../../../components/forms/Field'

/** Vista previa de un formulario (solo lectura), con el mismo aspecto que el formulario público. */
export function FormPreview({ template, empresaName, projectTypes = [] }: { template: IntakeFormTemplate; empresaName: string; projectTypes?: string[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-brand-50 via-white to-slate-100 p-4" aria-label={`Vista previa de ${template.name}`}>
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
        <p className="text-sm font-semibold text-slate-500">{empresaName}</p>
        <h3 className="mt-1 text-base font-bold text-slate-800">{template.name}</h3>
        {template.description && <p className="mt-1 text-xs text-slate-500">{template.description}</p>}
        <fieldset disabled className="mt-4 space-y-3">
          {template.fields.map((f) => (
            <label key={f.key} className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">
                {f.label}
                {f.required && <span aria-hidden="true"> *</span>}
                {f.condition && <span className="ml-1 text-[10px] text-slate-400">(si {f.condition.field} = {f.condition.equals})</span>}
              </span>
              {f.type === 'textarea' ? (
                <textarea rows={3} className={INPUT_CLS + ' border-slate-200'} readOnly />
              ) : f.type === 'select' ? (
                <select className={INPUT_CLS + ' border-slate-200'}>
                  <option>Selecciona una opción…</option>
                  {(f.options ?? (f.key === 'project_type' ? projectTypes : [])).map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              ) : (
                <input type={f.type} className={INPUT_CLS + ' border-slate-200'} readOnly />
              )}
            </label>
          ))}
          {template.required_documents.length > 0 && (
            <div>
              <span className="mb-1 block text-xs font-medium text-slate-500">Documentos</span>
              <ul className="space-y-1">
                {template.required_documents.map((d) => (
                  <li key={d.key} className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    {d.label}
                    {d.required && ' *'}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {template.consents.map((c) => (
            <label key={c.key} className="flex items-start gap-2 text-xs text-slate-600">
              <input type="checkbox" className="mt-0.5" readOnly /> {c.label}
              {c.required && ' *'}
            </label>
          ))}
          <button type="button" className="btn-primary w-full !py-2.5 text-sm opacity-70">
            Enviar mis datos
          </button>
        </fieldset>
        <p className="mt-3 text-center text-[11px] text-slate-400">
          Enlace válido {template.link_expiry_days} días · Recordatorios: {template.reminders.enabled ? `días ${template.reminders.after_days.join(', ')}` : 'desactivados'}
        </p>
      </div>
    </div>
  )
}
