import { useEffect, useState } from 'react'
import {
  FolderKanban,
  Users,
  Wallet,
  ListTodo,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  AlertTriangle,
  CircleDot,
  Circle,
  Eye,
  Download,
  Plus,
  Pencil,
  Trash2,
  X,
  Save,
  type LucideIcon,
} from 'lucide-react'
import { SectionCard, Badge, EmptyState } from '../components/ui'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import {
  formatEUR,
  STATUS_LABEL,
  type Cliente,
  type DocumentRow,
  type Project,
  type ProjectStatus,
  type Task,
  type DocumentType,
} from '../lib/types'

const STATUS_OPTIONS: ProjectStatus[] = ['borrador', 'en_progreso', 'completado', 'cancelado']

const STATUS_TONE: Record<string, string> = {
  en_progreso: 'blue',
  completado: 'green',
  borrador: 'slate',
  cancelado: 'red',
}
const DOC_GROUP: { type: DocumentType; label: string }[] = [
  { type: 'presupuesto', label: 'Presupuestos' },
  { type: 'provision', label: 'Provisiones de fondos' },
  { type: 'factura', label: 'Facturas' },
  { type: 'contrato', label: 'Contratos' },
  { type: 'otro', label: 'Otros documentos' },
]

const PRIORITY = {
  1: { label: 'Alta', tone: 'red', icon: AlertTriangle },
  2: { label: 'Media', tone: 'amber', icon: CircleDot },
  3: { label: 'Baja', tone: 'slate', icon: Circle },
} as const

function diasDesde(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const d = Math.floor(ms / 86400000)
  if (d <= 0) return 'hoy'
  if (d === 1) return 'hace 1 día'
  return `hace ${d} días`
}

export function EmpresaHome({ empresaName }: { empresaName: string }) {
  const { profile } = useAuth()
  const empresaId = profile?.empresa_id ?? ''
  const [projects, setProjects] = useState<Project[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [documents, setDocuments] = useState<DocumentRow[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<Project | 'new' | null>(null)

  async function load() {
    const [p, c, d, t] = await Promise.all([
      supabase.from('projects').select('*').order('created_at', { ascending: false }),
      supabase.from('clientes').select('*'),
      supabase.from('documents').select('*').order('created_at', { ascending: false }),
      supabase
        .from('tasks')
        .select('*')
        .eq('status', 'pendiente')
        .order('priority', { ascending: true })
        .order('created_at', { ascending: true }),
    ])
    setProjects((p.data as Project[]) ?? [])
    setClientes((c.data as Cliente[]) ?? [])
    setDocuments((d.data as DocumentRow[]) ?? [])
    setTasks((t.data as Task[]) ?? [])
    setLoading(false)
  }
  useEffect(() => {
    load()
  }, []) // eslint-disable-line

  const clientesCount = clientes.length

  async function deleteProject(id: string) {
    if (!window.confirm('¿Borrar este proyecto y todos sus documentos?')) return
    await supabase.from('projects').delete().eq('id', id)
    load()
  }

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function resolver(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id))
    await supabase
      .from('tasks')
      .update({ status: 'resuelto', resolved_at: new Date().toISOString() })
      .eq('id', id)
  }

  const invoiced = projects.reduce((s, p) => s + Number(p.invoiced), 0)

  if (loading) return <p className="text-slate-400">Cargando…</p>

  return (
    <div className="space-y-6">
      {/* Banner de bienvenida */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-indigo-600 to-violet-700 p-6 text-white shadow-float sm:p-8">
        <div className="blueprint absolute inset-0 opacity-10" />
        <div className="animate-glow pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-white/10 blur-2xl" />
        <div className="relative">
          <p className="text-sm text-brand-100">Bienvenido de nuevo</p>
          <h2 className="mt-1 text-2xl font-bold sm:text-3xl">
            Hola, {empresaName || 'empresa'} 👋
          </h2>
          <p className="mt-1 text-sm text-brand-100">
            Este es el resumen de tu actividad.
          </p>
        </div>
      </div>

      {/* Métricas */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={FolderKanban} label="Proyectos" value={String(projects.length)} hint={`${projects.filter((p) => p.status === 'en_progreso').length} en progreso`} grad="from-blue-500 to-brand-600" />
        <MetricCard icon={Users} label="Clientes" value={String(clientesCount)} grad="from-emerald-500 to-teal-600" />
        <MetricCard icon={Wallet} label="Facturado" value={formatEUR(invoiced)} grad="from-violet-500 to-purple-600" />
        <MetricCard icon={ListTodo} label="Pendientes" value={String(tasks.length)} hint={tasks.length ? 'requieren atención' : 'todo al día'} grad="from-amber-500 to-orange-600" />
      </div>

      {/* Pendientes */}
      <SectionCard
        title="Cosas pendientes"
        action={<Badge tone={tasks.length ? 'amber' : 'green'}>{tasks.length} por resolver</Badge>}
      >
        {tasks.length === 0 ? (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-6 text-sm text-emerald-600">
            <CheckCircle2 className="h-5 w-5" /> ¡Todo al día! No tienes pendientes.
          </div>
        ) : (
          <ul className="space-y-2">
            {tasks.map((t) => {
              const pr = PRIORITY[(t.priority as 1 | 2 | 3) ?? 2] ?? PRIORITY[2]
              return (
                <li
                  key={t.id}
                  className="flex items-start gap-3 rounded-xl border border-slate-200 p-3.5"
                >
                  <span className={`mt-0.5 shrink-0 rounded-lg p-1.5 ${
                    pr.tone === 'red' ? 'bg-red-50 text-red-500'
                    : pr.tone === 'amber' ? 'bg-amber-50 text-amber-500'
                    : 'bg-slate-100 text-slate-400'
                  }`}>
                    <pr.icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-slate-800">{t.title}</p>
                      <Badge tone={pr.tone}>Prioridad {pr.label}</Badge>
                      <span className="text-xs text-slate-400">{diasDesde(t.created_at)}</span>
                    </div>
                    {t.detail && <p className="mt-0.5 text-sm text-slate-500">{t.detail}</p>}
                  </div>
                  <button
                    onClick={() => resolver(t.id)}
                    className="flex shrink-0 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Resolver
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </SectionCard>

      {/* Proyectos desplegables */}
      <SectionCard
        title="Tus proyectos"
        action={
          <div className="flex items-center gap-2">
            <Badge tone="blue">{projects.length}</Badge>
            <button onClick={() => setEditing('new')} className="btn-primary !px-3 !py-2 text-sm">
              <Plus className="h-4 w-4" /> Nuevo proyecto
            </button>
          </div>
        }
      >
        {projects.length === 0 ? (
          <EmptyState text="Aún no tienes proyectos." />
        ) : (
          <ul className="space-y-2">
            {projects.map((p) => {
              const isOpen = open.has(p.id)
              const docs = documents.filter((d) => d.project_id === p.id)
              return (
                <li key={p.id} className="overflow-hidden rounded-xl border border-slate-200">
                  <button
                    onClick={() => toggle(p.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50"
                  >
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-slate-800">{p.name}</span>
                      <span className="text-xs text-slate-400">
                        {docs.length} documento{docs.length === 1 ? '' : 's'} · {p.progress}% completado
                      </span>
                    </span>
                    <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                  </button>

                  {isOpen && (
                    <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-4">
                      {/* Acciones */}
                      <div className="mb-4 flex justify-end gap-2">
                        <button
                          onClick={() => setEditing(p)}
                          className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        >
                          <Pencil className="h-3.5 w-3.5" /> Editar
                        </button>
                        <button
                          onClick={() => deleteProject(p.id)}
                          className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Borrar
                        </button>
                      </div>
                      {/* Cifras */}
                      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {[
                          ['Presupuesto', p.budget_total],
                          ['Facturado', p.invoiced],
                          ['Provisión', p.provision_funds],
                          ['Pendiente', p.pending_payments],
                        ].map(([label, val]) => (
                          <div key={label as string} className="rounded-lg bg-white p-2.5 ring-1 ring-slate-100">
                            <p className="text-[11px] text-slate-400">{label as string}</p>
                            <p className="text-sm font-bold text-slate-800">{formatEUR(val as number)}</p>
                          </div>
                        ))}
                      </div>

                      {/* Documentos por apartado */}
                      {docs.length === 0 ? (
                        <p className="text-sm text-slate-400">Este proyecto no tiene documentos todavía.</p>
                      ) : (
                        <div className="space-y-3">
                          {DOC_GROUP.map((g) => {
                            const list = docs.filter((d) => d.type === g.type)
                            if (list.length === 0) return null
                            return (
                              <div key={g.type}>
                                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                                  {g.label}
                                </p>
                                <ul className="space-y-1.5">
                                  {list.map((d) => (
                                    <li
                                      key={d.id}
                                      className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-slate-100"
                                    >
                                      <FileText className="h-3.5 w-3.5 shrink-0 text-brand-500" />
                                      <span className="min-w-0 flex-1 truncate text-slate-700">{d.name}</span>
                                      {d.status && <Badge tone="slate">{d.status}</Badge>}
                                      <DocActions path={d.storage_path} />
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )
                          })}
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

      {editing && (
        <ProjectForm
          project={editing === 'new' ? null : editing}
          clientes={clientes}
          empresaId={empresaId}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      )}
    </div>
  )
}

const NUM_FIELDS: { key: keyof Project; label: string }[] = [
  { key: 'budget_total', label: 'Presupuesto total' },
  { key: 'invoiced', label: 'Facturado' },
  { key: 'provision_funds', label: 'Provisión de fondos' },
  { key: 'pending_payments', label: 'Pagos pendientes' },
]

function ProjectForm({
  project,
  clientes,
  empresaId,
  onClose,
  onSaved,
}: {
  project: Project | null
  clientes: Cliente[]
  empresaId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    name: project?.name ?? '',
    cliente_id: project?.cliente_id ?? '',
    status: (project?.status ?? 'borrador') as ProjectStatus,
    budget_total: String(project?.budget_total ?? 0),
    invoiced: String(project?.invoiced ?? 0),
    provision_funds: String(project?.provision_funds ?? 0),
    pending_payments: String(project?.pending_payments ?? 0),
    progress: String(project?.progress ?? 0),
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    setError(null)
    const payload = {
      empresa_id: empresaId,
      name: form.name.trim(),
      cliente_id: form.cliente_id || null,
      status: form.status,
      budget_total: Number(form.budget_total) || 0,
      invoiced: Number(form.invoiced) || 0,
      provision_funds: Number(form.provision_funds) || 0,
      pending_payments: Number(form.pending_payments) || 0,
      progress: Math.min(100, Math.max(0, Number(form.progress) || 0)),
    }
    const { error } = project
      ? await supabase.from('projects').update(payload).eq('id', project.id)
      : await supabase.from('projects').insert(payload)
    setSaving(false)
    if (error) setError(error.message)
    else onSaved()
  }

  const inputCls =
    'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100'

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-float"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <p className="font-semibold text-slate-800">
            {project ? 'Editar proyecto' : 'Nuevo proyecto'}
          </p>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={save} className="space-y-3 p-5">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">Nombre del proyecto</span>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Reforma Integral Edificio Central"
              className={inputCls}
              required
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">Cliente</span>
              <select
                value={form.cliente_id}
                onChange={(e) => setForm({ ...form, cliente_id: e.target.value })}
                className={inputCls}
              >
                <option value="">Sin cliente</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">Estado</span>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })}
                className={inputCls}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {NUM_FIELDS.map((f) => (
              <label key={f.key} className="block">
                <span className="mb-1 block text-xs font-medium text-slate-500">{f.label} (€)</span>
                <input
                  type="number"
                  value={form[f.key as keyof typeof form] as string}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  className={inputCls}
                />
              </label>
            ))}
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              Progreso: {form.progress}%
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={form.progress}
              onChange={(e) => setForm({ ...form, progress: e.target.value })}
              className="w-full accent-brand-600"
            />
          </label>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving} className="btn-primary">
              <Save className="h-4 w-4" /> {saving ? 'Guardando…' : 'Guardar proyecto'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
  grad,
}: {
  icon: LucideIcon
  label: string
  value: string
  hint?: string
  grad: string
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-1.5 text-3xl font-extrabold tracking-tight text-slate-900">
            {value}
          </p>
          {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
        </div>
        <span
          className={`grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br ${grad} text-white shadow-lg`}
        >
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <div
        className={`pointer-events-none absolute -bottom-8 -right-8 h-24 w-24 rounded-full bg-gradient-to-br ${grad} opacity-[0.08] transition group-hover:opacity-[0.15]`}
      />
    </div>
  )
}

function DocActions({ path }: { path: string | null }) {
  const url = path && /^https?:\/\//.test(path) ? path : null
  const base = 'grid h-7 w-7 place-items-center rounded-md transition'
  if (!url)
    return (
      <span className="flex gap-1" title="Documento de ejemplo (sin archivo todavía)">
        <span className={`${base} text-slate-300`}>
          <Eye className="h-3.5 w-3.5" />
        </span>
        <span className={`${base} text-slate-300`}>
          <Download className="h-3.5 w-3.5" />
        </span>
      </span>
    )
  return (
    <span className="flex gap-1">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        title="Ver"
        className={`${base} text-slate-500 hover:bg-brand-50 hover:text-brand-600`}
      >
        <Eye className="h-3.5 w-3.5" />
      </a>
      <a
        href={url}
        download
        title="Descargar"
        className={`${base} text-slate-500 hover:bg-brand-50 hover:text-brand-600`}
      >
        <Download className="h-3.5 w-3.5" />
      </a>
    </span>
  )
}
