import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Building2,
  FileText,
  Wallet,
  Receipt,
  Save,
  Plus,
  Trash2,
  Link2,
  Copy,
  Mail,
  Check,
  Clock,
  Eye,
  EyeOff,
  X,
  Star,
} from 'lucide-react'
import { SectionCard, Badge, EmptyState } from '../components/ui'
import { supabase } from '../lib/supabase'
import { sendIntakeEmail } from '../lib/intakeEmail'
import { formatCurrency, formatDateTime } from '../lib/intl'
import { type Empresa, type Template, type ClientIntake } from '../lib/types'
import { createIntakeSignedUrl, intakeFilePath, type IntakeFileRef } from '../lib/intakeFiles'

/* Colores por pestaña (el nombre se resuelve con t(`dashboard.templates.tabs.${key}`) al renderizar) */
const SUBTABS = [
  {
    key: 'datos',
    icon: Building2,
    active: 'bg-slate-800 text-white',
    idle: 'border-l-4 border-l-slate-800 text-slate-700 hover:bg-slate-50',
    top: 'border-t-4 border-t-slate-800',
  },
  {
    key: 'presupuesto',
    icon: FileText,
    active: 'bg-blue-600 text-white',
    idle: 'border-l-4 border-l-blue-600 text-blue-700 hover:bg-blue-50',
    top: 'border-t-4 border-t-blue-600',
  },
  {
    key: 'provision',
    icon: Wallet,
    active: 'bg-amber-500 text-white',
    idle: 'border-l-4 border-l-amber-500 text-amber-700 hover:bg-amber-50',
    top: 'border-t-4 border-t-amber-500',
  },
  {
    key: 'factura',
    icon: Receipt,
    active: 'bg-violet-600 text-white',
    idle: 'border-l-4 border-l-violet-600 text-violet-700 hover:bg-violet-50',
    top: 'border-t-4 border-t-violet-600',
  },
  {
    key: 'formulario',
    icon: Link2,
    active: 'bg-teal-600 text-white',
    idle: 'border-l-4 border-l-teal-600 text-teal-700 hover:bg-teal-50',
    top: 'border-t-4 border-t-teal-600',
  },
] as const

type SubKey = (typeof SUBTABS)[number]['key']
type TemplateType = Extract<SubKey, 'presupuesto' | 'provision' | 'factura'>

export function PlantillasSection({ empresaId }: { empresaId: string }) {
  const { t } = useTranslation()
  const [sub, setSub] = useState<SubKey>('datos')
  const current = SUBTABS.find((s) => s.key === sub)!

  return (
    <div className="space-y-6">
      <div className="surface flex flex-wrap gap-2 p-2">
        {SUBTABS.map((item) => {
          const on = item.key === sub
          return (
            <button
              key={item.key}
              onClick={() => setSub(item.key)}
              className={`flex items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-semibold transition ${
                on ? item.active : `bg-white ${item.idle}`
              }`}
            >
              <item.icon className="h-4 w-4" />
              {t(`dashboard.templates.tabs.${item.key}`)}
            </button>
          )
        })}
      </div>

      <div className={`rounded-2xl ${current.top}`}>
        {sub === 'datos' && <DatosEmpresa empresaId={empresaId} />}
        {(sub === 'presupuesto' || sub === 'provision' || sub === 'factura') && (
          <TemplatesPanel empresaId={empresaId} type={sub} />
        )}
        {sub === 'formulario' && <FormularioClientes empresaId={empresaId} />}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Datos de empresa                                                    */
/* ------------------------------------------------------------------ */
function DatosEmpresa({ empresaId }: { empresaId: string }) {
  const { t } = useTranslation()
  const [form, setForm] = useState<Partial<Empresa>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.from('empresas').select('*').eq('id', empresaId).single()
      if (data) setForm(data as Empresa)
      setLoading(false)
    })()
  }, [empresaId])

  function set<K extends keyof Empresa>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }))
    setSaved(false)
  }

  async function save() {
    setSaving(true)
    await supabase
      .from('empresas')
      .update({
        name: form.name,
        cif: form.cif,
        logo_url: form.logo_url,
        address: form.address,
        phone: form.phone,
        email: form.email,
        website: form.website,
        iban: form.iban,
        disclosures: form.disclosures,
      })
      .eq('id', empresaId)
    setSaving(false)
    setSaved(true)
  }

  if (loading)
    return (
      <SectionCard title={t('dashboard.templates.company.title')}>
        <p className="text-slate-400">{t('common.state.loading')}</p>
      </SectionCard>
    )

  return (
    <SectionCard title={t('dashboard.templates.company.titleFull')}>
      <div className="grid gap-4 sm:grid-cols-2">
        <DatoField label={t('dashboard.templates.company.name')} value={form.name ?? ''} onChange={(v) => set('name', v)} placeholder={t('dashboard.templates.company.namePlaceholder')} />
        <DatoField label={t('dashboard.templates.company.taxId')} value={form.cif ?? ''} onChange={(v) => set('cif', v)} placeholder={t('dashboard.templates.company.taxIdPlaceholder')} />
        <DatoField label={t('dashboard.templates.company.email')} value={form.email ?? ''} onChange={(v) => set('email', v)} placeholder={t('dashboard.templates.company.emailPlaceholder')} />
        <DatoField label={t('dashboard.templates.company.phone')} value={form.phone ?? ''} onChange={(v) => set('phone', v)} placeholder={t('dashboard.templates.company.phonePlaceholder')} />
        <DatoField label={t('dashboard.templates.company.address')} value={form.address ?? ''} onChange={(v) => set('address', v)} placeholder={t('dashboard.templates.company.addressPlaceholder')} wide />
        <DatoField label={t('dashboard.templates.company.website')} value={form.website ?? ''} onChange={(v) => set('website', v)} placeholder={t('dashboard.templates.company.websitePlaceholder')} />
        <MaskedField label={t('dashboard.templates.company.iban')} value={form.iban ?? ''} onChange={(v) => set('iban', v)} placeholder={t('dashboard.templates.company.ibanPlaceholder')} />
        <DatoField label={t('dashboard.templates.company.logoUrl')} value={form.logo_url ?? ''} onChange={(v) => set('logo_url', v)} placeholder={t('dashboard.templates.company.logoUrlPlaceholder')} wide />
        <label className="sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-slate-500">{t('dashboard.templates.company.disclosures')}</span>
          <textarea
            rows={3}
            value={form.disclosures ?? ''}
            onChange={(e) => set('disclosures', e.target.value)}
            placeholder={t('dashboard.templates.company.disclosuresPlaceholder')}
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100"
          />
        </label>
      </div>
      <div className="mt-5 flex items-center gap-3">
        <button onClick={save} disabled={saving} className="btn-primary">
          <Save className="h-4 w-4" />
          {saving ? t('common.actions.saving') : t('dashboard.templates.company.save')}
        </button>
        {saved && (
          <span className="flex items-center gap-1 text-sm font-medium text-emerald-600">
            <Check className="h-4 w-4" /> {t('dashboard.templates.company.saved')}
          </span>
        )}
        {form.logo_url && (
          <img src={form.logo_url} alt={t('dashboard.templates.company.logoAlt')} className="ml-auto h-9 max-w-[120px] object-contain" onError={(e) => (e.currentTarget.style.display = 'none')} />
        )}
      </div>
    </SectionCard>
  )
}

/* Campos estables (definidos fuera del render → no pierden el foco) */
const DATO_INPUT =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100'

function DatoField({
  label,
  value,
  onChange,
  placeholder,
  wide,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  wide?: boolean
}) {
  return (
    <label className={wide ? 'sm:col-span-2' : ''}>
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={DATO_INPUT}
      />
    </label>
  )
}

function maskValue(v: string): string {
  const clean = v.trim()
  if (!clean) return ''
  if (clean.length <= 4) return '•'.repeat(clean.length)
  return '•'.repeat(clean.length - 4) + clean.slice(-4)
}

function MaskedField({
  label,
  value,
  onChange,
  placeholder,
  wide,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  wide?: boolean
}) {
  const { t } = useTranslation()
  const [show, setShow] = useState(false)
  return (
    <label className={wide ? 'sm:col-span-2' : ''}>
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 focus-within:border-brand-400 focus-within:ring-4 focus-within:ring-brand-100">
        <input
          type="text"
          value={show ? value : maskValue(value)}
          readOnly={!show}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent text-sm tracking-wide text-slate-800 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="shrink-0 text-slate-400 hover:text-slate-600"
          aria-label={show ? t('dashboard.templates.company.hide') : t('dashboard.templates.company.show')}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </label>
  )
}

/* ------------------------------------------------------------------ */
/* Plantillas por tipo                                                 */
/* ------------------------------------------------------------------ */
const emptyTpl = {
  name: '',
  moneda: 'EUR',
  impuesto: 'IGIC',
  tasa: '7',
  validez: '30',
  condiciones: '',
  notas: '',
  disclosures: '',
}

function TemplatesPanel({ empresaId, type }: { empresaId: string; type: TemplateType }) {
  const { t } = useTranslation()
  const [items, setItems] = useState<Template[]>([])
  const [empresa, setEmpresa] = useState<Empresa | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState({ ...emptyTpl })
  const [preview, setPreview] = useState<Template | null>(null)

  async function load() {
    const [t, e] = await Promise.all([
      supabase.from('document_templates').select('*').eq('type', type).order('created_at'),
      supabase.from('empresas').select('*').eq('id', empresaId).single(),
    ])
    setItems((t.data as Template[]) ?? [])
    setEmpresa((e.data as Empresa) ?? null)
    setLoading(false)
  }
  useEffect(() => {
    setLoading(true)
    load()
  }, [type]) // eslint-disable-line

  function startNew() {
    setEditing('new')
    setDraft({ ...emptyTpl })
  }
  function startEdit(t: Template) {
    setEditing(t.id)
    const c = t.content as Record<string, string>
    setDraft({
      name: t.name,
      moneda: c.moneda ?? 'EUR',
      impuesto: c.impuesto ?? 'IGIC',
      tasa: String(c.tasa ?? '7'),
      validez: String(c.validez ?? '30'),
      condiciones: c.condiciones ?? '',
      notas: c.notas ?? '',
      disclosures: c.disclosures ?? '',
    })
  }

  async function save() {
    if (!draft.name.trim()) return
    const content = {
      moneda: draft.moneda,
      impuesto: draft.impuesto,
      tasa: Number(draft.tasa) || 0,
      validez: Number(draft.validez) || 0,
      condiciones: draft.condiciones,
      notas: draft.notas,
      disclosures: draft.disclosures,
    }
    if (editing === 'new') {
      await supabase.from('document_templates').insert({ empresa_id: empresaId, type, name: draft.name.trim(), content })
    } else if (editing) {
      await supabase.from('document_templates').update({ name: draft.name.trim(), content }).eq('id', editing)
    }
    setEditing(null)
    load()
  }

  async function remove(id: string) {
    await supabase.from('document_templates').delete().eq('id', id)
    load()
  }

  async function setDefault(id: string, current: boolean) {
    // Solo una por defecto por tipo: primero desmarca todas, luego marca ésta
    await supabase.from('document_templates').update({ is_default: false }).eq('type', type)
    if (!current) await supabase.from('document_templates').update({ is_default: true }).eq('id', id)
    load()
  }

  return (
    <SectionCard
      title={t(`dashboard.templates.editor.title.${type}`)}
      action={
        <button onClick={startNew} className="btn-primary !px-3 !py-2 text-sm">
          <Plus className="h-4 w-4" /> {t('dashboard.templates.editor.new')}
        </button>
      }
    >
      {editing && (
        <div className="mb-5 rounded-2xl border border-brand-200 bg-brand-50/40 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <TplInput label={t('dashboard.templates.editor.name')} value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} wide />
            <label>
              <span className="mb-1 block text-xs font-medium text-slate-500">{t('dashboard.templates.editor.tax')}</span>
              <select
                value={draft.impuesto}
                onChange={(e) => setDraft({ ...draft, impuesto: e.target.value, tasa: e.target.value === 'IGIC' ? '7' : '21' })}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100"
              >
                <option value="IGIC">{t('dashboard.templates.editor.taxIgic')}</option>
                <option value="IVA">{t('dashboard.templates.editor.taxIva')}</option>
                <option value="EXENTO">{t('dashboard.templates.editor.taxExempt')}</option>
              </select>
            </label>
            <TplInput label={t('dashboard.templates.editor.rate', { tax: draft.impuesto })} value={draft.tasa} onChange={(v) => setDraft({ ...draft, tasa: v })} />
            <TplInput label={t('dashboard.templates.editor.currency')} value={draft.moneda} onChange={(v) => setDraft({ ...draft, moneda: v })} />
            {type === 'presupuesto' && (
              <TplInput label={t('dashboard.templates.editor.validity')} value={draft.validez} onChange={(v) => setDraft({ ...draft, validez: v })} />
            )}
            <TplTextarea label={t('dashboard.templates.editor.conditions')} value={draft.condiciones} onChange={(v) => setDraft({ ...draft, condiciones: v })} />
            <TplTextarea label={t('dashboard.templates.editor.footnotes')} value={draft.notas} onChange={(v) => setDraft({ ...draft, notas: v })} />
            <TplTextarea label={t('dashboard.templates.editor.disclosures')} value={draft.disclosures} onChange={(v) => setDraft({ ...draft, disclosures: v })} />
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={save} className="btn-primary !px-4 !py-2 text-sm">
              <Save className="h-4 w-4" /> {t('dashboard.templates.editor.save')}
            </button>
            <button onClick={() => setEditing(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
              {t('common.actions.cancel')}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-slate-400">{t('common.state.loading')}</p>
      ) : items.length === 0 ? (
        <EmptyState text={t('dashboard.templates.editor.empty')} />
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((tpl) => {
            const c = tpl.content as Record<string, unknown>
            const summaryVars = { tax: String(c.impuesto ?? 'IGIC'), rate: String(c.tasa ?? ''), currency: String(c.moneda ?? 'EUR'), days: String(c.validez ?? '') }
            return (
              <li key={tpl.id} className="flex items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-slate-800">{tpl.name}</p>
                    {tpl.is_default && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-600 ring-1 ring-amber-200">
                        <Star className="h-3 w-3" fill="currentColor" /> {t('dashboard.templates.editor.default')}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">
                    {type === 'presupuesto' && c.validez ? t('dashboard.templates.editor.summaryWithValidity', summaryVars) : t('dashboard.templates.editor.summary', summaryVars)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => setDefault(tpl.id, tpl.is_default)}
                    title={tpl.is_default ? t('dashboard.templates.editor.unsetDefault') : t('dashboard.templates.editor.setDefault')}
                    className={`grid h-8 w-8 place-items-center rounded-lg border transition ${
                      tpl.is_default
                        ? 'border-amber-200 bg-amber-50 text-amber-500'
                        : 'border-slate-200 text-slate-300 hover:text-amber-400'
                    }`}
                  >
                    <Star className="h-4 w-4" fill={tpl.is_default ? 'currentColor' : 'none'} />
                  </button>
                  <button onClick={() => setPreview(tpl)} className="flex items-center gap-1 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100">
                    <Eye className="h-3.5 w-3.5" /> {t('common.actions.view')}
                  </button>
                  <button onClick={() => startEdit(tpl)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                    {t('common.actions.edit')}
                  </button>
                  <button onClick={() => remove(tpl.id)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500" aria-label={t('dashboard.templates.editor.remove')}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {preview && <TemplatePreview template={preview} empresa={empresa} type={type} onClose={() => setPreview(null)} />}
    </SectionCard>
  )
}

/* Vista previa del documento */
function TemplatePreview({
  template,
  empresa,
  type,
  onClose,
}: {
  template: Template
  empresa: Empresa | null
  type: TemplateType
  onClose: () => void
}) {
  const { t } = useTranslation()
  const c = template.content as Record<string, string | number>
  const base = 1000
  const tasa = Number(c.tasa ?? 0)
  const exento = c.impuesto === 'EXENTO'
  const tax = exento ? 0 : (base * tasa) / 100
  const total = base + tax
  const disclosures = (c.disclosures as string) || empresa?.disclosures || ''

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-float" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white/90 px-5 py-3 backdrop-blur">
          <p className="text-sm font-semibold text-slate-700">{t('dashboard.templates.preview.title', { name: template.name })}</p>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label={t('common.actions.close')}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Documento */}
        <div className="p-8 text-slate-800">
          <div className="flex items-start justify-between">
            <div>
              {empresa?.logo_url ? (
                <img src={empresa.logo_url} alt="" className="mb-2 h-12 max-w-[160px] object-contain" onError={(e) => (e.currentTarget.style.display = 'none')} />
              ) : (
                <p className="text-lg font-extrabold text-brand-700">{empresa?.name ?? t('dashboard.templates.preview.yourCompany')}</p>
              )}
              <p className="text-sm font-semibold">{empresa?.name}</p>
              <p className="text-xs text-slate-500">
                {empresa?.cif && t('dashboard.templates.preview.taxId', { value: empresa.cif })}
                {empresa?.address ? ` · ${empresa.address}` : ''}
              </p>
              <p className="text-xs text-slate-500">
                {[empresa?.email, empresa?.phone].filter(Boolean).join(' · ')}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xl font-extrabold tracking-tight text-slate-900">{t(`dashboard.templates.docTitle.${type}`)}</p>
              <p className="text-xs text-slate-500">{t('dashboard.templates.preview.number', { number: `${type.slice(0, 3).toUpperCase()}-2026-001` })}</p>
              <p className="text-xs text-slate-500">{t('dashboard.templates.preview.date', { date: '16/07/2026' })}</p>
              {type === 'presupuesto' && c.validez ? (
                <p className="text-xs text-slate-500">{t('dashboard.templates.preview.validity', { days: String(c.validez) })}</p>
              ) : null}
            </div>
          </div>

          <div className="mt-6 rounded-lg bg-slate-50 px-4 py-2 text-xs text-slate-500">
            {t('dashboard.templates.preview.client')} <span className="font-medium text-slate-700">{t('dashboard.templates.preview.sampleClient')}</span>
          </div>

          {/* Tabla ejemplo */}
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="py-2">{t('dashboard.templates.preview.concept')}</th>
                <th className="py-2 text-right">{t('dashboard.templates.preview.quantity')}</th>
                <th className="py-2 text-right">{t('dashboard.templates.preview.price')}</th>
                <th className="py-2 text-right">{t('dashboard.templates.preview.total')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="py-2">{t('dashboard.templates.preview.sampleConcept')}</td>
                <td className="py-2 text-right">1</td>
                <td className="py-2 text-right">{formatCurrency(base)}</td>
                <td className="py-2 text-right">{formatCurrency(base)}</td>
              </tr>
            </tbody>
          </table>

          {/* Totales */}
          <div className="mt-4 ml-auto w-56 space-y-1 text-sm">
            <div className="flex justify-between text-slate-500">
              <span>{t('dashboard.templates.preview.taxBase')}</span>
              <span>{formatCurrency(base)}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>{exento ? t('dashboard.templates.preview.taxExempt') : t('dashboard.templates.preview.taxLine', { tax: String(c.impuesto), rate: tasa })}</span>
              <span>{formatCurrency(tax)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-bold text-slate-900">
              <span>{t('dashboard.templates.preview.total')}</span>
              <span>{formatCurrency(total)}</span>
            </div>
          </div>

          {c.condiciones ? (
            <div className="mt-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t('dashboard.templates.preview.conditions')}</p>
              <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{String(c.condiciones)}</p>
            </div>
          ) : null}
          {c.notas ? <p className="mt-3 whitespace-pre-line text-sm text-slate-600">{String(c.notas)}</p> : null}
          {empresa?.iban && (
            <p className="mt-3 text-xs text-slate-500">{t('dashboard.templates.preview.bankTransfer', { iban: empresa.iban })}</p>
          )}
          {disclosures && (
            <p className="mt-6 border-t border-slate-200 pt-3 text-[11px] leading-relaxed text-slate-400">
              {disclosures}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function TplInput({ label, value, onChange, wide }: { label: string; value: string; onChange: (v: string) => void; wide?: boolean }) {
  return (
    <label className={wide ? 'sm:col-span-2' : ''}>
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100" />
    </label>
  )
}
function TplTextarea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="sm:col-span-2">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      <textarea rows={2} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100" />
    </label>
  )
}

/* ------------------------------------------------------------------ */
/* Formulario de clientes                                              */
/* ------------------------------------------------------------------ */
interface Submitted {
  name?: string
  email?: string
  phone?: string
  cif?: string
  address?: string
  project_type?: string
  description?: string
  files?: IntakeFileRef[]
}

function FormularioClientes({ empresaId }: { empresaId: string }) {
  const { t } = useTranslation()
  const [items, setItems] = useState<ClientIntake[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  // Config de tipos de proyecto
  const [types, setTypes] = useState<string[]>([])
  const [newType, setNewType] = useState('')
  const [savingCfg, setSavingCfg] = useState(false)
  const [cfgSaved, setCfgSaved] = useState(false)

  // Auto-email
  const [clientEmail, setClientEmail] = useState('')
  const [sendMsg, setSendMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Plantillas de formulario (migración 0009). Si no existen, se usa el formulario básico.
  const [formTemplates, setFormTemplates] = useState<{ id: string; name: string; is_default: boolean; link_expiry_days: number }[]>([])
  const [formTemplateId, setFormTemplateId] = useState('')

  async function load() {
    const [i, e, t] = await Promise.all([
      supabase.from('client_intake').select('*').order('created_at', { ascending: false }),
      supabase.from('empresas').select('intake_config').eq('id', empresaId).single(),
      supabase.from('intake_form_templates').select('id, name, is_default, link_expiry_days').eq('is_active', true).order('created_at'),
    ])
    setItems((i.data as ClientIntake[]) ?? [])
    const emp = e.data as { intake_config?: { project_types?: string[] } } | null
    setTypes(emp?.intake_config?.project_types ?? [])
    const tpls = (t.data as { id: string; name: string; is_default: boolean; link_expiry_days: number }[] | null) ?? []
    setFormTemplates(tpls)
    setFormTemplateId((prev) => prev || tpls.find((x) => x.is_default)?.id || '')
    setLoading(false)
  }
  useEffect(() => {
    load()
  }, []) // eslint-disable-line

  function addType() {
    const v = newType.trim()
    if (!v || types.includes(v)) return
    setTypes([...types, v])
    setNewType('')
    setCfgSaved(false)
  }
  function removeType(t: string) {
    setTypes(types.filter((x) => x !== t))
    setCfgSaved(false)
  }
  const [cfgError, setCfgError] = useState<string | null>(null)
  async function saveCfg() {
    setSavingCfg(true)
    setCfgError(null)
    const { error } = await supabase
      .from('empresas')
      .update({ intake_config: { project_types: types } })
      .eq('id', empresaId)
    setSavingCfg(false)
    if (error) setCfgError(t('dashboard.templates.form.saveError', { message: error.message }))
    else setCfgSaved(true)
  }

  async function generar() {
    setCreating(true)
    setSendMsg(null)
    const email = clientEmail.trim()
    const tpl = formTemplates.find((x) => x.id === formTemplateId)
    const payload: Record<string, unknown> = { empresa_id: empresaId, client_email: email || null }
    if (tpl) {
      payload.form_template_id = tpl.id
      payload.channel = 'public_form'
      payload.expires_at = new Date(Date.now() + tpl.link_expiry_days * 86400000).toISOString()
    }
    const { data, error } = await supabase.from('client_intake').insert(payload).select('id, token').single()

    if (error) {
      setSendMsg({ ok: false, text: t('dashboard.templates.form.createError', { message: error.message }) })
      setCreating(false)
      return
    }

    if (data && email) {
      // El servidor resuelve destinatario, empresa, idioma y enlace a partir del formulario
      // (solo si pertenece a la empresa del usuario autenticado); el cliente no envía nada más.
      const sent = await sendIntakeEmail((data as { id: string }).id, email)
      setSendMsg({ ok: sent.ok, text: sent.message })
    }
    setClientEmail('')
    setCreating(false)
    load()
  }

  const linkFor = (token: string) => `${window.location.origin}/form/${token}`
  async function copy(token: string) {
    await navigator.clipboard.writeText(linkFor(token))
    setCopied(token)
    setTimeout(() => setCopied(null), 1800)
  }
  async function remove(id: string) {
    if (!window.confirm(t('dashboard.templates.form.deleteLinkConfirm'))) return
    await supabase.from('client_intake').delete().eq('id', id)
    load()
  }

  return (
    <div className="space-y-6">
      {/* Configuración: tipos de proyecto del desplegable */}
      <SectionCard title={t('dashboard.templates.form.configTitle')}>
        <p className="mb-3 text-sm text-slate-500">{t('dashboard.templates.form.configHint')}</p>
        <div className="flex flex-wrap gap-2">
          {types.map((type) => (
            <span
              key={type}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700 ring-1 ring-brand-100"
            >
              {type}
              <button onClick={() => removeType(type)} className="text-brand-400 hover:text-red-500" aria-label={t('common.actions.remove')}>
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
          {types.length === 0 && (
            <span className="text-sm text-slate-400">{t('dashboard.templates.form.noOptions')}</span>
          )}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addType())}
            placeholder={t('dashboard.templates.form.typePlaceholder')}
            className="flex-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100"
          />
          <button onClick={addType} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50" aria-label={t('common.actions.add')}>
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button onClick={saveCfg} disabled={savingCfg} className="btn-primary !px-4 !py-2 text-sm">
            <Save className="h-4 w-4" /> {savingCfg ? t('common.actions.saving') : t('dashboard.templates.form.saveOptions')}
          </button>
          {cfgError && <span className="text-sm font-medium text-red-600">{cfgError}</span>}
          {cfgSaved && !cfgError && (
            <span className="flex items-center gap-1 text-sm font-medium text-emerald-600">
              <Check className="h-4 w-4" /> {t('dashboard.templates.form.saved')}
            </span>
          )}
        </div>
      </SectionCard>

      {/* Enlaces generados + respuestas */}
      <SectionCard title={t('dashboard.templates.form.linksTitle')}>
        <p className="mb-3 text-sm text-slate-500">{t('dashboard.templates.form.linksHint')}</p>
        <div className="mb-2 flex flex-col gap-2 sm:flex-row">
          {formTemplates.length > 0 && (
            <label className="sm:w-56">
              <span className="sr-only">{t('dashboard.templates.form.formTemplate')}</span>
              <select
                value={formTemplateId}
                onChange={(e) => setFormTemplateId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100"
              >
                <option value="">{t('dashboard.templates.form.basicForm')}</option>
                {formTemplates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.is_default ? t('dashboard.templates.form.defaultTemplate', { name: tpl.name }) : tpl.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex-1">
            <span className="sr-only">{t('dashboard.templates.form.clientEmail')}</span>
            <input
              type="email"
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
              placeholder={t('dashboard.templates.form.clientEmail')}
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100"
            />
          </label>
          <button onClick={generar} disabled={creating} className="btn-primary shrink-0">
            {creating ? (
              t('common.actions.oneMoment')
            ) : clientEmail.trim() ? (
              <>
                <Mail className="h-4 w-4" /> {t('dashboard.templates.form.generateAndSend')}
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" /> {t('dashboard.templates.form.generateLink')}
              </>
            )}
          </button>
        </div>
        {sendMsg && (
          <p
            className={`mb-3 rounded-lg px-3 py-2 text-sm ${
              sendMsg.ok ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-700'
            }`}
          >
            {sendMsg.text}
          </p>
        )}
        {loading ? (
          <p className="text-slate-400">{t('common.state.loading')}</p>
        ) : items.length === 0 ? (
          <EmptyState text={t('dashboard.templates.form.empty')} />
        ) : (
          <ul className="space-y-3">
            {items.map((f) => {
              const link = linkFor(f.token)
              const s = (f.submitted ?? {}) as Submitted
              const isDone = f.status === 'completado'
              const open = expanded === f.id
              const mailto = `mailto:${f.client_email ?? ''}?subject=${encodeURIComponent(t('dashboard.templates.form.mailtoSubject'))}&body=${encodeURIComponent(t('dashboard.templates.form.mailtoBody', { link }))}`
              return (
                <li key={f.id} className="rounded-xl border border-slate-200 p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      {isDone ? (
                        <Badge tone="green"><Check className="mr-1 inline h-3 w-3" /> {t('dashboard.templates.form.completed')}</Badge>
                      ) : (
                        <Badge tone="amber"><Clock className="mr-1 inline h-3 w-3" /> {t('dashboard.templates.form.pending')}</Badge>
                      )}
                      {isDone && s.name && (
                        <span className="text-sm font-medium text-slate-700">{s.name}</span>
                      )}
                      <span className="text-xs text-slate-400">{t('dashboard.templates.form.generatedAt', { date: formatDateTime(f.created_at) })}</span>
                    </div>
                    <div className="flex gap-2">
                      {isDone ? (
                        <button onClick={() => setExpanded(open ? null : f.id)} className="flex items-center gap-1 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100">
                          <Eye className="h-3.5 w-3.5" /> {open ? t('dashboard.templates.form.hide') : t('dashboard.templates.form.viewResponse')}
                        </button>
                      ) : (
                        <>
                          <button onClick={() => copy(f.token)} className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                            {copied === f.token ? (<><Check className="h-3.5 w-3.5 text-emerald-600" /> {t('common.actions.copied')}</>) : (<><Copy className="h-3.5 w-3.5" /> {t('dashboard.templates.form.copyLink')}</>)}
                          </button>
                          <a href={mailto} className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                            <Mail className="h-3.5 w-3.5" /> {t('dashboard.templates.form.sendByEmail')}
                          </a>
                        </>
                      )}
                      <button onClick={() => remove(f.id)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500" aria-label={t('dashboard.templates.form.deleteLink')}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {!isDone && <p className="mt-2 truncate text-xs text-slate-400">{link}</p>}

                  {isDone && open && (
                    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-sm">
                      <Row label={t('dashboard.templates.form.rowEmail')} value={s.email} />
                      <Row label={t('dashboard.templates.form.rowPhone')} value={s.phone} />
                      <Row label={t('dashboard.templates.form.rowTaxId')} value={s.cif} />
                      <Row label={t('dashboard.templates.form.rowAddress')} value={s.address} />
                      <Row label={t('dashboard.templates.form.rowProjectType')} value={s.project_type} />
                      {s.description && (
                        <div>
                          <p className="text-xs font-medium text-slate-400">{t('dashboard.templates.form.description')}</p>
                          <p className="whitespace-pre-line text-slate-700">{s.description}</p>
                        </div>
                      )}
                      {s.files && s.files.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-slate-400">{t('dashboard.templates.form.attachments')}</p>
                          <ul className="mt-1 space-y-1">
                            {s.files.map((file, i) => (
                              <li key={file.path ?? file.url ?? i}>
                                <IntakeFileLink file={file} />
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </SectionCard>
    </div>
  )
}

/** Enlace a un adjunto del bucket privado: genera una URL firmada (10 min) al pulsar. */
function IntakeFileLink({ file }: { file: IntakeFileRef }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const path = intakeFilePath(file)
  async function open() {
    if (!path) return
    setBusy(true)
    setErr(null)
    const { url, error } = await createIntakeSignedUrl(path)
    setBusy(false)
    if (!url) {
      setErr(error ?? t('dashboard.templates.form.linkError'))
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }
  if (!path) return <span className="text-slate-400">{t('dashboard.templates.form.fileUnavailable', { name: file.name })}</span>
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <button type="button" onClick={open} disabled={busy} className="inline-flex items-center gap-1.5 text-brand-600 hover:underline disabled:opacity-60">
        <FileText className="h-3.5 w-3.5" aria-hidden="true" /> {file.name}
        {busy && <span className="text-xs text-slate-400">{t('dashboard.templates.form.generatingLink')}</span>}
      </button>
      {err && <span className="text-xs text-red-600" role="alert">{err}</span>}
    </span>
  )
}

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <div className="flex gap-2">
      <span className="w-28 shrink-0 text-xs font-medium text-slate-400">{label}</span>
      <span className="text-slate-700">{value}</span>
    </div>
  )
}
