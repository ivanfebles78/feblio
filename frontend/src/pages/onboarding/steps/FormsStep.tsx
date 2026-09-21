import { useState } from 'react'
import { Eye, Pencil, Plus, Star, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { useOnboarding } from '../../../lib/onboarding/OnboardingContext'
import { deleteFormTemplate, saveChannelRule, saveFormTemplate, setDefaultFormTemplate } from '../../../lib/onboarding/api'
import type { ChannelKey, ChannelRule, IntakeFormTemplate } from '../../../lib/onboarding/types'
import { FormPreview } from './forms/FormPreview'
import { FormTemplateEditor, emptyTemplate, type EditableTemplate } from './forms/FormTemplateEditor'
import { ChannelFormMapping } from './forms/ChannelFormMapping'
import type { StepProps } from './types'

export function FormsStep({ errors, showErrors }: StepProps) {
  const { t } = useTranslation()
  const ctx = useOnboarding()
  const empresaId = ctx.snapshot?.empresa.id ?? ''
  const templates = ctx.snapshot?.form_templates ?? []
  const rules = ctx.snapshot?.channel_rules ?? []
  const [editing, setEditing] = useState<EditableTemplate | null>(null)
  const [preview, setPreview] = useState<IntakeFormTemplate | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<IntakeFormTemplate | null>(null)
  const [busy, setBusy] = useState(false)
  const err = (k: string) => (showErrors ? errors[k] : undefined)

  async function save(t: EditableTemplate) {
    setBusy(true)
    const ok = await ctx.runAction(() => saveFormTemplate({ ...t, empresa_id: empresaId }))
    setBusy(false)
    if (ok) setEditing(null)
  }

  async function remove() {
    const t = confirmDelete
    setConfirmDelete(null)
    if (!t) return
    await ctx.runAction(() => deleteFormTemplate(t.id))
  }

  function updateRule(channel: ChannelKey, patch: Partial<ChannelRule>) {
    ctx.patchSnapshot((s) => ({
      ...s,
      channel_rules: s.channel_rules.some((r) => r.channel === channel)
        ? s.channel_rules.map((r) => (r.channel === channel ? { ...r, ...patch } : r))
        : [...s.channel_rules, { id: '', empresa_id: empresaId, channel, default_form_template_id: null, form_selection_rule: {}, send_message_template: null, rules: {}, created_at: '', updated_at: '', ...patch }],
    }))
    ctx.scheduleSave(`forms:rule:${channel}`, async () => {
      const current = ctx.snapshot?.channel_rules.find((r) => r.channel === channel)
      const merged = { ...current, ...patch }
      await saveChannelRule(empresaId, channel, {
        default_form_template_id: merged.default_form_template_id ?? null,
        form_selection_rule: merged.form_selection_rule ?? {},
        send_message_template: merged.send_message_template ?? null,
      })
    })
  }

  return (
    <div className="space-y-8">
      <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
        {t('onboarding.forms.intro')}
      </p>

      <section aria-labelledby="sec-forms-list">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="sec-forms-list" className="text-sm font-semibold text-slate-800">
            {t('onboarding.forms.templatesTitle')}
          </h2>
          <button type="button" onClick={() => setEditing(emptyTemplate())} className="btn-primary !px-3 !py-2 text-xs">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> {t('onboarding.forms.create')}
          </button>
        </div>
        {err('templates') && <p className="mb-2 text-xs text-red-600" role="alert">{errors.templates}</p>}
        {editing && !editing.id && <div className="mb-4"><FormTemplateEditor initial={editing} busy={busy} onSave={save} onCancel={() => setEditing(null)} /></div>}
        <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
          {templates.map((tpl) => (
            <li key={tpl.id} className="p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-slate-800">{tpl.name}</p>
                    {tpl.is_default && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">
                        <Star className="h-3 w-3" fill="currentColor" aria-hidden="true" /> {t('onboarding.forms.default')}
                      </span>
                    )}
                    {!tpl.is_active && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">{t('onboarding.forms.inactive')}</span>}
                  </div>
                  <p className="text-xs text-slate-500">
                    {t('onboarding.forms.meta', { fields: tpl.fields.length, documents: tpl.required_documents.length, days: tpl.link_expiry_days })}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button type="button" onClick={() => ctx.runAction(() => setDefaultFormTemplate(empresaId, tpl.id))} disabled={tpl.is_default} className={`grid h-8 w-8 place-items-center rounded-lg border ${tpl.is_default ? 'border-amber-200 bg-amber-50 text-amber-500' : 'border-slate-200 text-slate-300 hover:text-amber-400'}`} aria-label={tpl.is_default ? t('onboarding.forms.isDefault', { name: tpl.name }) : t('onboarding.forms.makeDefault', { name: tpl.name })}>
                    <Star className="h-4 w-4" fill={tpl.is_default ? 'currentColor' : 'none'} aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => setPreview(preview?.id === tpl.id ? null : tpl)} className="inline-flex items-center gap-1 rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100" aria-pressed={preview?.id === tpl.id}>
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" /> {t('onboarding.forms.preview')}
                  </button>
                  <button type="button" onClick={() => setEditing({ ...tpl })} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> {t('onboarding.forms.edit')}
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(tpl)} disabled={tpl.is_default} className="rounded-lg border border-slate-200 px-2 py-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-40" aria-label={t('onboarding.forms.delete', { name: tpl.name })}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
              {editing?.id === tpl.id && <div className="mt-3"><FormTemplateEditor initial={editing} busy={busy} onSave={save} onCancel={() => setEditing(null)} /></div>}
              {preview?.id === tpl.id && <div className="mt-3"><FormPreview template={tpl} empresaName={ctx.snapshot?.empresa.name ?? ''} projectTypes={ctx.snapshot?.empresa.intake_config?.project_types ?? []} /></div>}
            </li>
          ))}
          {templates.length === 0 && <li className="p-6 text-center text-sm text-slate-400">{t('onboarding.forms.empty')}</li>}
        </ul>
      </section>

      <section aria-labelledby="sec-forms-map">
        <h2 id="sec-forms-map" className="mb-1 text-sm font-semibold text-slate-800">
          {t('onboarding.forms.mappingTitle')}
        </h2>
        <p className="mb-3 text-xs text-slate-500">{t('onboarding.forms.mappingDescription')}</p>
        <ChannelFormMapping rules={rules} templates={templates} onChange={updateRule} companyLanguage={ctx.snapshot?.empresa.language} />
      </section>

      <ConfirmDialog open={confirmDelete !== null} title={t('onboarding.forms.deleteTitle', { name: confirmDelete?.name ?? '' })} tone="danger" confirmLabel={t('onboarding.forms.deleteConfirm')} onConfirm={remove} onCancel={() => setConfirmDelete(null)}>
        {t('onboarding.forms.deleteBody')}
      </ConfirmDialog>
    </div>
  )
}
