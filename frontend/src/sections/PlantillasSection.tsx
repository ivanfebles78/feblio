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
} from 'lucide-react'
import { SectionCard, Badge, EmptyState } from '../components/ui'
import { supabase } from '../lib/supabase'
import type { DocumentType, Empresa, Template, ClientIntake } from '../lib/types'

const SUBTABS = [
  { key: 'datos', label: 'Datos de empresa', icon: Building2 },
  { key: 'presupuesto', label: 'Presupuestos', icon: FileText },
  { key: 'provision', label: 'Provisiones', icon: Wallet },
  { key: 'factura', label: 'Facturas', icon: Receipt },
  { key: 'formulario', label: 'Formulario de clientes', icon: Link2 },
] as const

type SubKey = (typeof SUBTABS)[number]['key']

export function PlantillasSection({ empresaId }: { empresaId: string }) {
  const [sub, setSub] = useState<SubKey>('datos')

  return (
    <div className="space-y-6">
      <div className="surface flex flex-wrap gap-1 p-1.5">
        {SUBTABS.map((t) => {
          const activeTab = t.key === sub
          return (
            <button
              key={t.key}
              onClick={() => setSub(t.key)}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition ${
                activeTab
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      {sub === 'datos' && <DatosEmpresa empresaId={empresaId} />}
      {(sub === 'presupuesto' || sub === 'provision' || sub === 'factura') && (
        <TemplatesPanel empresaId={empresaId} type={sub as DocumentType} />
      )}
      {sub === 'formulario' && <FormularioClientes empresaId={empresaId} />}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Datos de empresa (se rellenan una vez, se replican en documentos)   */
/* ------------------------------------------------------------------ */
function DatosEmpresa({ empresaId }: { empresaId: string }) {
  const [form, setForm] = useState<Partial<Empresa>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase
        .from('empresas')
        .select('*')
        .eq('id', empresaId)
        .single()
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

  if (loading) return <p className="text-slate-400">Cargando…</p>

  const F = ({
    label,
    k,
    placeholder,
    wide,
  }: {
    label: string
    k: keyof Empresa
    placeholder?: string
    wide?: boolean
  }) => (
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
            Disclosures / textos legales (aparecen al pie de tus documentos)
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
          <img
            src={form.logo_url}
            alt="logo"
            className="ml-auto h-9 max-w-[120px] object-contain"
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
        )}
      </div>
    </SectionCard>
  )
}

/* ------------------------------------------------------------------ */
/* Plantillas por tipo                                                 */
/* ------------------------------------------------------------------ */
const emptyTpl = { name: '', moneda: 'EUR', iva: '21', validez: '30', condiciones: '', notas: '' }

function TemplatesPanel({ empresaId, type }: { empresaId: string; type: DocumentType }) {
  const [items, setItems] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState({ ...emptyTpl })

  async function load() {
    const { data } = await supabase
      .from('document_templates')
      .select('*')
      .eq('type', type)
      .order('created_at')
    setItems((data as Template[]) ?? [])
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
      iva: String(c.iva ?? '21'),
      validez: String(c.validez ?? '30'),
      condiciones: c.condiciones ?? '',
      notas: c.notas ?? '',
    })
  }

  async function save() {
    if (!draft.name.trim()) return
    const content = {
      moneda: draft.moneda,
      iva: Number(draft.iva) || 0,
      validez: Number(draft.validez) || 0,
      condiciones: draft.condiciones,
      notas: draft.notas,
    }
    if (editing === 'new') {
      await supabase
        .from('document_templates')
        .insert({ empresa_id: empresaId, type, name: draft.name.trim(), content })
    } else if (editing) {
      await supabase
        .from('document_templates')
        .update({ name: draft.name.trim(), content })
        .eq('id', editing)
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
            <TplInput label="Moneda" value={draft.moneda} onChange={(v) => setDraft({ ...draft, moneda: v })} />
            <TplInput label="IVA (%)" value={draft.iva} onChange={(v) => setDraft({ ...draft, iva: v })} />
            {type === 'presupuesto' && (
              <TplInput label="Validez (días)" value={draft.validez} onChange={(v) => setDraft({ ...draft, validez: v })} />
            )}
            <TplTextarea label="Condiciones" value={draft.condiciones} onChange={(v) => setDraft({ ...draft, condiciones: v })} />
            <TplTextarea label="Notas al pie" value={draft.notas} onChange={(v) => setDraft({ ...draft, notas: v })} />
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={save} className="btn-primary !px-4 !py-2 text-sm">
              <Save className="h-4 w-4" /> Guardar plantilla
            </button>
            <button
              onClick={() => setEditing(null)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
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
                    IVA {String(c.iva ?? '—')}% · {String(c.moneda ?? 'EUR')}
                    {type === 'presupuesto' && c.validez ? ` · validez ${String(c.validez)}d` : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => startEdit(t)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => remove(t.id)}
                    className="rounded-lg border border-slate-200 px-2 py-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
                    aria-label="Eliminar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </SectionCard>
  )
}

function TplInput({
  label,
  value,
  onChange,
  wide,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  wide?: boolean
}) {
  return (
    <label className={wide ? 'sm:col-span-2' : ''}>
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100"
      />
    </label>
  )
}
function TplTextarea({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="sm:col-span-2">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      <textarea
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100"
      />
    </label>
  )
}

/* ------------------------------------------------------------------ */
/* Formulario de clientes (genera enlace público)                      */
/* ------------------------------------------------------------------ */
function FormularioClientes({ empresaId }: { empresaId: string }) {
  const [items, setItems] = useState<ClientIntake[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  async function load() {
    const { data } = await supabase
      .from('client_intake')
      .select('*')
      .order('created_at', { ascending: false })
    setItems((data as ClientIntake[]) ?? [])
    setLoading(false)
  }
  useEffect(() => {
    load()
  }, [])

  async function generar() {
    setCreating(true)
    await supabase.from('client_intake').insert({ empresa_id: empresaId })
    setCreating(false)
    load()
  }

  function linkFor(token: string) {
    return `${window.location.origin}/form/${token}`
  }
  async function copy(token: string) {
    await navigator.clipboard.writeText(linkFor(token))
    setCopied(token)
    setTimeout(() => setCopied(null), 1800)
  }

  return (
    <SectionCard
      title="Formulario de contacto para clientes"
      action={
        <button onClick={generar} disabled={creating} className="btn-primary !px-3 !py-2 text-sm">
          <Plus className="h-4 w-4" /> {creating ? 'Generando…' : 'Generar enlace'}
        </button>
      }
    >
      <p className="mb-4 text-sm text-slate-500">
        Genera un enlace y envíalo a tu cliente por email. Cuando lo complete, se creará
        automáticamente en tu cartera de clientes.
      </p>

      {loading ? (
        <p className="text-slate-400">Cargando…</p>
      ) : items.length === 0 ? (
        <EmptyState text="Aún no has generado ningún formulario." />
      ) : (
        <ul className="space-y-3">
          {items.map((f) => {
            const link = linkFor(f.token)
            const submitted = (f.submitted ?? {}) as Record<string, string>
            const mailto = `mailto:${f.client_email ?? ''}?subject=${encodeURIComponent(
              'Completa tus datos',
            )}&body=${encodeURIComponent('Hola, por favor completa tus datos aquí: ' + link)}`
            return (
              <li key={f.id} className="rounded-xl border border-slate-200 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {f.status === 'completado' ? (
                      <Badge tone="green">
                        <Check className="mr-1 inline h-3 w-3" /> Completado
                      </Badge>
                    ) : (
                      <Badge tone="amber">
                        <Clock className="mr-1 inline h-3 w-3" /> Pendiente
                      </Badge>
                    )}
                    {f.status === 'completado' && submitted.name && (
                      <span className="text-sm font-medium text-slate-700">
                        {submitted.name}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => copy(f.token)}
                      className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      {copied === f.token ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-600" /> Copiado
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" /> Copiar enlace
                        </>
                      )}
                    </button>
                    <a
                      href={mailto}
                      className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      <Mail className="h-3.5 w-3.5" /> Enviar por email
                    </a>
                  </div>
                </div>
                <p className="mt-2 truncate text-xs text-slate-400">{link}</p>
              </li>
            )
          })}
        </ul>
      )}
    </SectionCard>
  )
}
