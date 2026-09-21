import { useTranslation } from 'react-i18next'
import { SelectField, TextareaField } from '../../../../components/forms/Field'
import type { ChannelKey, ChannelRule, IntakeFormTemplate } from '../../../../lib/onboarding/types'
import { DEFAULT_FORM_MESSAGE } from '../../../../lib/onboarding/steps'
import { t as translate } from '../../../../i18n'

export const CHANNEL_KEYS: ChannelKey[] = ['public_form', 'email', 'whatsapp', 'sms', 'voice', 'manual']

export function channelLabel(channel: ChannelKey): string {
  return translate(`onboarding.channelMapping.channels.${channel}`)
}

const SELECTION_RULE_KEYS = [
  { value: 'default', key: 'ruleDefault' },
  { value: 'keyword', key: 'ruleKeyword' },
  { value: 'ask', key: 'ruleAsk' },
]

interface ChannelFormMappingProps {
  rules: ChannelRule[]
  templates: IntakeFormTemplate[]
  onChange: (channel: ChannelKey, patch: Partial<ChannelRule>) => void
}

/** Asignación de formulario por canal: predeterminado, regla de selección y mensaje con la URL. */
export function ChannelFormMapping({ rules, templates, onChange }: ChannelFormMappingProps) {
  const { t } = useTranslation()
  const channels = CHANNEL_KEYS
  const selectionRules = SELECTION_RULE_KEYS.map((r) => ({ value: r.value, label: t(`onboarding.channelMapping.${r.key}`) }))
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
            <th scope="col" className="pb-2 pr-3 font-medium">{t('onboarding.channelMapping.channel')}</th>
            <th scope="col" className="pb-2 pr-3 font-medium">{t('onboarding.channelMapping.defaultForm')}</th>
            <th scope="col" className="pb-2 pr-3 font-medium">{t('onboarding.channelMapping.selectionRule')}</th>
            <th scope="col" className="pb-2 font-medium">{t('onboarding.channelMapping.message')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 align-top">
          {channels.map((ch) => {
            const rule = rules.find((r) => r.channel === ch)
            const selection = (rule?.form_selection_rule?.mode as string | undefined) ?? 'default'
            return (
              <tr key={ch}>
                <th scope="row" className="py-3 pr-3 text-left font-medium text-slate-700">
                  {channelLabel(ch)}
                </th>
                <td className="py-3 pr-3">
                  <SelectField label={<span className="sr-only">{t('onboarding.channelMapping.formFor', { channel: channelLabel(ch) })}</span>} value={rule?.default_form_template_id ?? ''} onChange={(e) => onChange(ch, { default_form_template_id: e.target.value || null })} options={templates.map((tpl) => ({ value: tpl.id, label: tpl.name }))} placeholder={t('onboarding.channelMapping.companyDefault')} />
                </td>
                <td className="py-3 pr-3">
                  <SelectField label={<span className="sr-only">{t('onboarding.channelMapping.ruleFor', { channel: channelLabel(ch) })}</span>} value={selection} onChange={(e) => onChange(ch, { form_selection_rule: { mode: e.target.value } })} options={selectionRules} />
                </td>
                <td className="py-3">
                  <TextareaField label={<span className="sr-only">{t('onboarding.channelMapping.messageFor', { channel: channelLabel(ch) })}</span>} rows={2} value={rule?.send_message_template ?? DEFAULT_FORM_MESSAGE} onChange={(e) => onChange(ch, { send_message_template: e.target.value })} hint={t('onboarding.channelMapping.messageHint')} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
