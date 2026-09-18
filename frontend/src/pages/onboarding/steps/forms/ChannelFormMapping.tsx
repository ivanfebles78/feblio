import { SelectField, TextareaField } from '../../../../components/forms/Field'
import type { ChannelKey, ChannelRule, IntakeFormTemplate } from '../../../../lib/onboarding/types'
import { DEFAULT_FORM_MESSAGE } from '../../../../lib/onboarding/steps'

export const CHANNEL_LABEL: Record<ChannelKey, string> = {
  public_form: 'Formulario público',
  email: 'Correo electrónico',
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  voice: 'Llamadas',
  manual: 'Entrada manual',
}

const SELECTION_RULES = [
  { value: 'default', label: 'Siempre el formulario predeterminado del canal' },
  { value: 'keyword', label: 'Según palabras clave del mensaje (presupuesto, requerimiento, visita…)' },
  { value: 'ask', label: 'Preguntar al cliente qué necesita' },
]

interface ChannelFormMappingProps {
  rules: ChannelRule[]
  templates: IntakeFormTemplate[]
  onChange: (channel: ChannelKey, patch: Partial<ChannelRule>) => void
}

/** Asignación de formulario por canal: predeterminado, regla de selección y mensaje con la URL. */
export function ChannelFormMapping({ rules, templates, onChange }: ChannelFormMappingProps) {
  const channels = Object.keys(CHANNEL_LABEL) as ChannelKey[]
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
            <th scope="col" className="pb-2 pr-3 font-medium">Canal</th>
            <th scope="col" className="pb-2 pr-3 font-medium">Formulario predeterminado</th>
            <th scope="col" className="pb-2 pr-3 font-medium">Regla de selección</th>
            <th scope="col" className="pb-2 font-medium">Mensaje para enviar la URL</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 align-top">
          {channels.map((ch) => {
            const rule = rules.find((r) => r.channel === ch)
            const selection = (rule?.form_selection_rule?.mode as string | undefined) ?? 'default'
            return (
              <tr key={ch}>
                <th scope="row" className="py-3 pr-3 text-left font-medium text-slate-700">
                  {CHANNEL_LABEL[ch]}
                </th>
                <td className="py-3 pr-3">
                  <SelectField label={<span className="sr-only">Formulario para {CHANNEL_LABEL[ch]}</span>} value={rule?.default_form_template_id ?? ''} onChange={(e) => onChange(ch, { default_form_template_id: e.target.value || null })} options={templates.map((t) => ({ value: t.id, label: t.name }))} placeholder="Predeterminado de la empresa" />
                </td>
                <td className="py-3 pr-3">
                  <SelectField label={<span className="sr-only">Regla para {CHANNEL_LABEL[ch]}</span>} value={selection} onChange={(e) => onChange(ch, { form_selection_rule: { mode: e.target.value } })} options={SELECTION_RULES} />
                </td>
                <td className="py-3">
                  <TextareaField label={<span className="sr-only">Mensaje para {CHANNEL_LABEL[ch]}</span>} rows={2} value={rule?.send_message_template ?? DEFAULT_FORM_MESSAGE} onChange={(e) => onChange(ch, { send_message_template: e.target.value })} hint="Variables: {nombre}, {empresa}, {url}" />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
