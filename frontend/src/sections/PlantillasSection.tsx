import { useEffect, useState } from 'react'
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
  X,
} from 'lucide-react'
import { SectionCard, Badge, EmptyState } from '../components/ui'
import { supabase } from '../lib/supabase'
import {
  formatEUR,
  type DocumentType,
  type Empresa,
  type Template,
  type ClientIntake,
} from '../lib/types'

/* Colores por pestaña */
const SUBTABS = [
  {
    key: 'datos',
    label: 'Datos de empresa',
    icon: Building2,
    active: 'bg-slate-800 text-white',
    idle: 'border-l-4 border-l-slate-800 text-slate-700 hover:bg-slate-50',
    top: 'border-t-4 border-t-slate-800',
  },
  {
    key: 'presupuesto',
    label: 'Presupuestos',
    icon: FileText,
    active: 'bg-blue-600 text-white',
    idle: 'border-l-4 border-l-blue-600 text-blue-700 hover:bg-blue-50',
    top: 'border-t-4 border-t-blue-600',
  },
  {
    key: 'provision',
    label: 'Provisiones',
    icon: Wallet,
    active: 'bg-amber-500 text-white',
    idle: 'border-l-4 border-l-amber-500 text-amber-700 hover:bg-amber-50',
    top: 'border-t-4 border-t-amber-500',
  },
  {
    key: 'factura',
    label: 'Facturas',
    icon: Receipt,
    active: 'bg-violet-600 text-white',
    idle: 'border-l-4 border-l-violet-600 text-violet-700 hover:bg-violet-50',
    top: 'border-t-4 border-t-violet-600',
  },
  {
    key: 'formulario',
    label: 'Formulario de clientes',
    icon: Link2,
    active: 'bg-teal-600 text-white',
    idle: 'border-l-4 border-l-teal-600 text-teal-700 hover:bg-teal-50',
    top: 'border-t-4 border-t-teal-600',
  },
] as const

type SubKey = (typeof SUBTABS)[number]['key']
const DOC_TITLE: Record<string, string> = {
  presupuesto: 'PRESUPUESTO',
  provision: 'PROVISIÓN DE FONDOS',
  factura: 'FACTURA',
}

export function PlantillasSection({ empresaId }: { empresaId: string }) {
  const [sub, setSub] = useState<SubKey>('datos')
  const current = SUBTABS.find((s) => s.key === sub)!

  return (
    <div className="space-y-6">
      <div className="surface flex flex-wrap gap-2 p-2">
        {SUBTABS.map((t) => {
          const on = t.key === sub
          return (
            <button
              key={t.key}
              onClick={() => setSub(t.key)}
              className={`flex items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-semibold transition ${
                on ? t.active : `bg-white ${t.idle}`
              }`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      <div className={`rounded-2xl ${current.top}`}>
        {sub === 'datos' && <DatosEmpresa empresaId={empresaId} />}
        {(sub === 'presupuesto' || sub === 'provision' || sub === 'factura') && (
          <TemplatesPanel empresaId={empresaId} type={sub as DocumentType} />
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

  if (loading) return <SectionCard title="Datos de tu empresa"><p className="text-slate-400">Cargando…</p></SectionCard>

  const F = ({ label, k, placeholder, wide }: { label: string; k: keyof Empresa; placeholder?: string; wide?: boolean }) => (
    <label className={wide ? 'sm:col-span-2' : ''}>
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      <input
        type="text"
        value={(form[k] as string) ?? ''}
        placeholder={placeholder}
        onChange={(e) => set(k, e.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100"
      />
    </label>
  )

  return (
    <SectionCard title="Datos de tu empresa (se replican en cada documento)">
      <div className="grid gap-4 sm:grid-cols-2">
        <F label="Nombre / razón social" k="name" placeholder="Reformas del Sur SL" />
        <F label="CIF / NIF" k="cif" placeholder="B12345678" />
        <F label="Email" k="email" placeholder="hola@empresa.com" />
        <F label="Teléfono" k="phone" placeholder="+34 600 000 000" />
        <F label="Dirección" k="address" placeholder="Calle…" wide />
        <F label="Web" k="website" placeholder="www.empresa.com" />
        <F label="IBAN (para cobros)" k="iban" placeholder="ES00 0000 0000 0000" />
        <F label="URL del logo" k="logo_url" placeholder="https://…/logo.png" wide />
        <label className="sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            Disclosures / textos legales (pie de tus documentos)
          </span>
          <textarea
            rows={3}
            value={form.disclosures ?? ''}
            onChange={(e) => set('disclosures', e.target.value)}
            placeholder="Condiciones generales, aviso de protección de datos, etc."
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100"
          />
        </label>
      </div>
      <div className="mt-5 flex items-center gap-3">
        <button onClick={save} disabled={saving} className="btn-primary">
          <Save className="h-4 w-4" />
          {saving ? 'Guardando…' : 'Guardar datos'}
        </button>
        {saved && (
          <span className="flex items-center gap-1 text-sm font-medium text-emerald-600">
            <Check className="h-4 w-4" /> Guardado
          </span>
        )}
        {form.logo_url && (
          <img src={form.logo_url} alt="logo" className="ml-auto h-9 max-w-[120px] object-contain" onError={(e) => (e.currentTarget.style.display = 'none')} />
        )}
      </div>
    </SectionCard>
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

function TemplatesPanel({ empresaId, type }: { empresaId: string; type: DocumentType }) {
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

  const label = SUBTABS.find((s) => s.key === type)?.label ?? 'Plantillas'

  return (
    <SectionCard
      title={`Plantillas de ${label.toLowerCase()}`}
      action={
        <button onClick={startNew} className="btn-primary !px-3 !py-2 text-sm">
          <Plus className="h-4 w-4" /> Nueva
        </button>
      }
    >
      {editing && (
        <div className="mb-5 rounded-2xl border border-brand-200 bg-brand-50/40 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <TplInput label="Nombre de la plantilla" value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} wide />
            <label>
              <span className="mb-1 block text-xs font-medium text-slate-500">Impuesto</span>
              <select
                value={draft.impuesto}
                onChange={(e) => setDraft({ ...draft, impuesto: e.target.value, tasa: e.target.value === 'IGIC' ? '7' : '21' })}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100"
              >
                <option value="IGIC">IGIC (Canarias)</option>
                <option value="IVA">IVA (Península)</option>
                <option value="EXENTO">Exento</option>
              </select>
            </label>
            <TplInput label={`Tasa ${draft.impuesto} (%)`} value={draft.tasa} onChange={(v) => setDraft({ ...draft, tasa: v })} />
            <TplInput label="Moneda" value={draft.moneda} onChange={(v) => setDraft({ ...draft, moneda: v })} />
            {type === 'presupuesto' && (
              <TplInput label="Validez (días)" value={draft.validez} onChange={(v) => setDraft({ ...draft, validez: v })} />
            )}
            <TplTextarea label="Condiciones" value={draft.condiciones} onChange={(v) => setDraft({ ...draft, condiciones: v })} />
            <TplTextarea label="Notas al pie" value={draft.notas} onChange={(v) => setDraft({ ...draft, notas: v })} />
            <TplTextarea label="Disclosures (si lo dejas vacío se usan las de la empresa)" value={draft.disclosures} onChange={(v) => setDraft({ ...draft, disclosures: v })} />
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={save} className="btn-primary !px-4 !py-2 text-sm">
              <Save className="h-4 w-4" /> Guardar plantilla
            </button>
            <button onClick={() => setEditing(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-slate-400">Cargando…</p>
      ) : items.length === 0 ? (
        <EmptyState text="Aún no tienes plantillas de este tipo. Crea la primera." />
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((t) => {
            const c = t.content as Record<string, unknown>
            return (
              <li key={t.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium text-slate-800">{t.name}</p>
                  <p className="text-xs text-slate-400">
                    {String(c.impuesto ?? 'IGIC')} {String(c.tasa ?? '')}% · {String(c.moneda ?? 'EUR')}
                    {type === 'presupuesto' && c.validez ? ` · validez ${String(c.validez)}d` : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setPreview(t)} className="flex items-center gap-1 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100">
                    <Eye className="h-3.5 w-3.5" /> Ver
                  </button>
                  <button onClick={() => startEdit(t)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                    Editar
                  </button>
                  <button onClick={() => remove(t.id)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500" aria-label="Eliminar">
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
  type: DocumentType
  onClose: () => void
}) {
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
          <p className="text-sm font-semibold text-slate-700">
            Vista previa · {template.name}
          </p>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
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
                <p className="text-lg font-extrabold text-brand-700">{empresa?.name ?? 'Tu empresa'}</p>
              )}
              <p className="text-sm font-semibold">{empresa?.name}</p>
              <p className="text-xs text-slate-500">
                {empresa?.cif && `CIF/NIF: ${empresa.cif}`}
                {empresa?.address ? ` · ${empresa.address}` : ''}
              </p>
              <p className="text-xs text-slate-500">
                {[empresa?.email, empresa?.phone].filter(Boolean).join(' · ')}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xl font-extrabold tracking-tight text-slate-900">{DOC_TITLE[type]}</p>
              <p className="text-xs text-slate-500">Nº {type.slice(0, 3).toUpperCase()}-2026-001</p>
              <p className="text-xs text-slate-500">Fecha: 16/07/2026</p>
              {type === 'presupuesto' && c.validez ? (
                <p className="text-xs text-slate-500">Validez: {String(c.validez)} días</p>
              ) : null}
            </div>
          </div>

          <div className="mt-6 rounded-lg bg-slate-50 px-4 py-2 text-xs text-slate-500">
            Cliente: <span className="font-medium text-slate-700">Cliente de ejemplo</span>
          </div>

          {/* Tabla ejemplo */}
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="py-2">Concepto</th>
                <th className="py-2 text-right">Cant.</th>
                <th className="py-2 text-right">Precio</th>
                <th className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="py-2">Concepto de ejemplo</td>
                <td className="py-2 text-right">1</td>
                <td className="py-2 text-right">{formatEUR(base)}</td>
                <td className="py-2 text-right">{formatEUR(base)}</td>
              </tr>
            </tbody>
          </table>

          {/* Totales */}
          <div className="mt-4 ml-auto w-56 space-y-1 text-sm">
            <div className="flex justify-between text-slate-500">
              <span>Base imponible</span>
              <span>{formatEUR(base)}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>{exento ? 'Impuesto (exento)' : `${c.impuesto} (${tasa}%)`}</span>
              <span>{formatEUR(tax)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-bold text-slate-900">
              <span>Total</span>
              <span>{formatEUR(total)}</span>
            </div>
          </div>

          {c.condiciones ? (
            <div className="mt-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Condiciones</p>
              <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{String(c.condiciones)}</p>
            </div>
          ) : null}
          {c.notas ? <p className="mt-3 whitespace-pre-line text-sm text-slate-600">{String(c.notas)}</p> : null}
          {empresa?.iban && (
            <p className="mt-3 text-xs text-slate-500">Pago por transferencia · IBAN: {empresa.iban}</p>
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
  files?: { name: string; url: string }[]
}

function FormularioClientes({ empresaId }: { empresaId: string }) {
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
  const [empresaName, setEmpresaName] = useState('')
  const [sendMsg, setSendMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function load() {
    const [i, e] = await Promise.all([
      supabase.from('client_intake').select('*').order('created_at', { ascending: false }),
      supabase.from('empresas').select('name, intake_config').eq('id', empresaId).single(),
    ])
    setItems((i.data as ClientIntake[]) ?? [])
    const emp = e.data as { name?: string; intake_config?: { project_types?: string[] } } | null
    setTypes(emp?.intake_config?.project_types ?? [])
    setEmpresaName(emp?.name ?? '')
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
  async function saveCfg() {
    setSavingCfg(true)
    await supabase
      .from('empresas')
      .update({ intake_config: { project_types: types } })
      .eq('id', empresaId)
    setSavingCfg(false)
    setCfgSaved(true)
  }

  async function generar() {
    setCreating(true)
    setSendMsg(null)
    const email = clientEmail.trim()
    const { data, error } = await supabase
      .from('client_intake')
      .insert({ empresa_id: empresaId, client_email: email || null })
      .select('token')
      .single()

    if (!error && data && email) {
      const link = linkFor((data as { token: string }).token)
      const { data: res, error: fnErr } = await supabase.functions.invoke('send-intake-email', {
        body: { to: email, link, empresa: empresaName },
      })
      if (fnErr || !(res as { ok?: boolean })?.ok) {
        setSendMsg({
          ok: false,
          text:
            (res as { error?: string })?.error ??
            'Enlace creado, pero no se pudo enviar el email (¿falta configurar Resend?). Puedes copiarlo abajo.',
        })
      } else {
        setSendMsg({ ok: true, text: `Email enviado a ${email}.` })
      }
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
    if (!window.confirm('¿Borrar este enlace? El cliente ya no podrá completarlo.')) return
    await supabase.from('client_intake').delete().eq('id', id)
    load()
  }

  return (
    <div className="space-y-6">
      {/* Configuración: tipos de proyecto del desplegable */}
      <SectionCard title="Configuración del formulario">
        <p className="mb-3 text-sm text-slate-500">
          Define las opciones del desplegable "Tipo de proyecto" que verá tu cliente.
        </p>
        <div className="flex flex-wrap gap-2">
          {types.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700 ring-1 ring-brand-100"
            >
              {t}
              <button onClick={() => removeType(t)} className="text-brand-400 hover:text-red-500" aria-label="Quitar">
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
          {types.length === 0 && (
            <span className="text-sm text-slate-400">Sin opciones todavía.</span>
          )}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addType())}
            placeholder="Ej: Reforma integral, Baño, Cocina…"
            className="flex-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100"
          />
          <button onClick={addType} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button onClick={saveCfg} disabled={savingCfg} className="btn-primary !px-4 !py-2 text-sm">
            <Save className="h-4 w-4" /> {savingCfg ? 'Guardando…' : 'Guardar opciones'}
          </button>
          {cfgSaved && (
            <span className="flex items-center gap-1 text-sm font-medium text-emerald-600">
              <Check className="h-4 w-4" /> Guardado
            </span>
          )}
        </div>
      </SectionCard>

      {/* Enlaces generados + respuestas */}
      <SectionCard title="Enlaces para clientes">
        <p className="mb-3 text-sm text-slate-500">
          Escribe el email del cliente y pulsa enviar: le llegará el enlace por correo. También
          puedes generar un enlace sin email para copiarlo tú.
        </p>
        <div className="mb-2 flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            value={clientEmail}
            onChange={(e) => setClientEmail(e.target.value)}
            placeholder="Email del cliente (opcional)"
            className="flex-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100"
          />
          <button onClick={generar} disabled={creating} className="btn-primary shrink-0">
            {creating ? (
              'Un momento…'
            ) : clientEmail.trim() ? (
              <>
                <Mail className="h-4 w-4" /> Generar y enviar
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" /> Generar enlace
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
          <p className="text-slate-400">Cargando…</p>
        ) : items.length === 0 ? (
          <EmptyState text="Aún no has generado ningún formulario." />
        ) : (
          <ul className="space-y-3">
            {items.map((f) => {
              const link = linkFor(f.token)
              const s = (f.submitted ?? {}) as Submitted
              const isDone = f.status === 'completado'
              const open = expanded === f.id
              const mailto = `mailto:${f.client_email ?? ''}?subject=${encodeURIComponent('Completa tus datos')}&body=${encodeURIComponent('Hola, por favor completa tus datos aquí: ' + link)}`
              return (
                <li key={f.id} className="rounded-xl border border-slate-200 p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      {isDone ? (
                        <Badge tone="green"><Check className="mr-1 inline h-3 w-3" /> Completado</Badge>
                      ) : (
                        <Badge tone="amber"><Clock className="mr-1 inline h-3 w-3" /> Pendiente</Badge>
                      )}
                      {isDone && s.name && (
                        <span className="text-sm font-medium text-slate-700">{s.name}</span>
                      )}
                      <span className="text-xs text-slate-400">
                        Generado el {fmtDateTime(f.created_at)}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {isDone ? (
                        <button onClick={() => setExpanded(open ? null : f.id)} className="flex items-center gap-1 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100">
                          <Eye className="h-3.5 w-3.5" /> {open ? 'Ocultar' : 'Ver respuesta'}
                        </button>
                      ) : (
                        <>
                          <button onClick={() => copy(f.token)} className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                            {copied === f.token ? (<><Check className="h-3.5 w-3.5 text-emerald-600" /> Copiado</>) : (<><Copy className="h-3.5 w-3.5" /> Copiar enlace</>)}
                          </button>
                          <a href={mailto} className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                            <Mail className="h-3.5 w-3.5" /> Enviar por email
                          </a>
                        </>
                      )}
                      <button onClick={() => remove(f.id)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500" aria-label="Borrar enlace">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {!isDone && <p className="mt-2 truncate text-xs text-slate-400">{link}</p>}

                  {isDone && open && (
                    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-sm">
                      <Row label="Email" value={s.email} />
                      <Row label="Teléfono" value={s.phone} />
                      <Row label="CIF / NIF" value={s.cif} />
                      <Row label="Dirección" value={s.address} />
                      <Row label="Tipo de proyecto" value={s.project_type} />
                      {s.description && (
                        <div>
                          <p className="text-xs font-medium text-slate-400">Descripción</p>
                          <p className="whitespace-pre-line text-slate-700">{s.description}</p>
                        </div>
                      )}
                      {s.files && s.files.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-slate-400">Archivos adjuntos</p>
                          <ul className="mt-1 space-y-1">
                            {s.files.map((file) => (
                              <li key={file.url}>
                                <a href={file.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-brand-600 hover:underline">
                                  <FileText className="h-3.5 w-3.5" /> {file.name}
                                </a>
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

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
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
