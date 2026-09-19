import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  FolderKanban,
  Inbox,
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
import { SectionCard, Badge } from '../components/ui'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EmptyState, StatusPill } from '../components/v2/Card'
import { Button } from '../components/v2/Button'
import { SetupProgressCard, useSetupProgress } from '../components/onboarding/SetupProgressCard'
import { supabase } from '../lib/supabase'
import { cleanupTestData } from '../lib/onboarding/api'
import { useAuth } from '../context/AuthContext'
import { PENDING_FOR_EMPRESA } from '../lib/solicitudes/status'
import { EMPRESA_PATHS } from '../lib/routing'
import type { EmpresaSummary } from '../pages/EmpresaDashboard'
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

interface EmpresaHomeProps {
  empresaId: string
  empresa: EmpresaSummary | null
  /** Resalta la tarjeta de configuración (llegada desde la bienvenida con «Configurar Feblio»). */
  highlightSetup?: boolean
}

export function EmpresaHome({ empresaId, empresa, highlightSetup = false }: EmpresaHomeProps) {
  const { profile } = useAuth()
  const setup = useSetupProgress(empresaId, empresa?.onboarding_status ?? null)
  const firstName = (profile?.full_name ?? '').trim().split(/\s+/)[0] || ''
  const setupPending = empresa?.onboarding_status !== 'completed'
  const [projects, setProjects] = useState<Project[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [documents, setDocuments] = useState<DocumentRow[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [solicitudes, setSolicitudes] = useState<{ status: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<Project | 'new' | null>(null)
  const [confirmCleanup, setConfirmCleanup] = useState(false)
  const [cleaning, setCleaning] = useState(false)
  const [cleanupMsg, setCleanupMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function load() {
    const [p, c, d, t, s] = await Promise.all([
      supabase.from('projects').select('*').order('created_at', { ascending: false }),
      supabase.from('clientes').select('*'),
      supabase.from('documents').select('*').order('created_at', { ascending: false }),
      supabase
        .from('tasks')
        .select('*')
        .eq('status', 'pendiente')
        .order('priority', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase.from('solicitudes').select('status'),
    ])
    setProjects((p.data as Project[]) ?? [])
    setClientes((c.data as Cliente[]) ?? [])
    setDocuments((d.data as DocumentRow[]) ?? [])
    setTasks((t.data as Task[]) ?? [])
    setSolicitudes((s.data as { status: string }[]) ?? [])
    setLoading(false)
  }
  useEffect(() => {
    load()
  }, [])

  const clientesCount = clientes.length
  const solicitudesOpen = solicitudes.filter((x) => x.status !== 'closed').length
  const solicitudesPending = solicitudes.filter((x) => (PENDING_FOR_EMPRESA as string[]).includes(x.status)).length

  async function deleteProject(id: string) {
    if (!window.confirm('¿Borrar este proyecto y todos sus documentos?')) return
    await supabase.from('projects').delete().eq('id', id)
    load()
  }

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
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
  // Datos sandbox de la prueba guiada del asistente (marcados is_test en servidor)
  const testCounts = {
    projects: projects.filter((p) => p.is_test).length,
    clientes: clientes.filter((c) => c.is_test).length,
    tasks: tasks.filter((t) => t.is_test).length,
  }
  const hasTestData = testCounts.projects + testCounts.clientes + testCounts.tasks > 0

  async function cleanupSandbox() {
    setConfirmCleanup(false)
    setCleaning(true)
    setCleanupMsg(null)
    try {
      const res = await cleanupTestData()
      const d = res.deleted
      setCleanupMsg({ ok: true, text: `Datos de prueba eliminados (${d.projects} proyectos, ${d.clientes} clientes, ${d.tasks} pendientes, ${d.documents} documentos).` })
      await load()
    } catch (e) {
      setCleanupMsg({ ok: false, text: e instanceof Error ? e.message : 'No se pudieron eliminar los datos de prueba.' })
    } finally {
      setCleaning(false)
    }
  }

  if (loading) return <p className="text-slate-400">Cargando…</p>

  return (
    <div className="space-y-6">
      {/* Datos de prueba del asistente */}
      {(hasTestData || cleanupMsg) && (
        <div
          className={`flex flex-col gap-3 rounded-2xl border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between ${
            cleanupMsg && !hasTestData
              ? cleanupMsg.ok
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-red-200 bg-red-50 text-red-900'
              : 'border-amber-200 bg-amber-50 text-amber-900'
          }`}
          role="status"
        >
          <p>
            {hasTestData ? (
              <>
                <strong>Datos de prueba del asistente:</strong> {testCounts.projects} proyecto(s), {testCounts.clientes} cliente(s) y{' '}
                {testCounts.tasks} pendiente(s) marcados como prueba. No son datos reales.
              </>
            ) : (
              cleanupMsg?.text
            )}
            {hasTestData && cleanupMsg && !cleanupMsg.ok && <span className="block text-red-700">{cleanupMsg.text}</span>}
          </p>
          {hasTestData && (
            <button
              type="button"
              onClick={() => setConfirmCleanup(true)}
              disabled={cleaning}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-60"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> {cleaning ? 'Eliminando…' : 'Eliminar datos de prueba'}
            </button>
          )}
        </div>
      )}
      <ConfirmDialog open={confirmCleanup} title="Eliminar datos de prueba" tone="danger" confirmLabel="Eliminar" busy={cleaning} onConfirm={cleanupSandbox} onCancel={() => setConfirmCleanup(false)}>
        Se borrarán el cliente, el proyecto, los documentos, las tareas y el formulario creados por la prueba guiada. Tus datos reales y tu
        configuración no se tocan.
      </ConfirmDialog>

      {/* Cabecera */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{firstName ? `Hola, ${firstName}` : 'Hola'}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {projects.length === 0 && clientes.length === 0
              ? 'Tu empresa está lista. Empieza creando tu primer proyecto o completa la configuración.'
              : 'Esto es lo que necesita tu atención hoy.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {setupPending ? <StatusPill tone="pending">Configuración pendiente</StatusPill> : <StatusPill tone="success">Configuración completa</StatusPill>}
          {empresa?.subscription_status === 'trial' && <StatusPill tone="info">Periodo de prueba</StatusPill>}
        </div>
      </div>

      {/* Configuración progresiva (solo mientras esté incompleta) */}
      {setupPending && setup.progress && <SetupProgressCard empresaId={empresaId} progress={setup.progress} highlight={highlightSetup} />}
      {setupPending && setup.error && (
        <p className="text-sm text-red-700" role="alert">
          {setup.error}
        </p>
      )}

      {/* Métricas */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={Inbox} label="Solicitudes" value={String(solicitudesOpen)} hint={solicitudesOpen ? `${solicitudesPending} requieren tu atención` : 'Ninguna abierta'} to={EMPRESA_PATHS.solicitudes} />
        <MetricCard icon={FolderKanban} label="Proyectos" value={String(projects.length)} hint={projects.length ? `${projects.filter((p) => p.status === 'en_progreso').length} en progreso` : 'Ninguno todavía'} />
        <MetricCard icon={Users} label="Clientes" value={String(clientesCount)} hint={clientesCount ? undefined : 'Ninguno todavía'} />
        <MetricCard icon={Wallet} label="Facturado" value={formatEUR(invoiced)} hint={invoiced ? undefined : 'Sin facturación aún'} />
        <MetricCard icon={ListTodo} label="Pendientes" value={String(tasks.length)} hint={tasks.length ? 'Requieren atención' : 'Todo al día'} />
      </div>

      {/* Pendientes */}
      <SectionCard
        title="Cosas pendientes"
        action={<Badge tone={tasks.length ? 'amber' : 'green'}>{tasks.length} por resolver</Badge>}
      >
        {tasks.length === 0 ? (
          <EmptyState icon={<CheckCircle2 className="h-5 w-5" />} title="Todo al día" description="Las tareas que Feblio te proponga y los pendientes de tus proyectos aparecerán aquí." />
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
                      {t.is_test && <Badge tone="amber">Prueba</Badge>}
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
            <Button size="sm" onClick={() => setEditing('new')} leading={<Plus className="h-4 w-4" aria-hidden="true" />}>
              Nuevo proyecto
            </Button>
          </div>
        }
      >
        {projects.length === 0 ? (
          <EmptyState
            icon={<FolderKanban className="h-5 w-5" />}
            title="Aún no tienes proyectos"
            description="Crea el primero para empezar a organizar documentos, presupuestos y clientes. No necesitas completar la configuración."
            action={
              <Button size="sm" onClick={() => setEditing('new')} leading={<Plus className="h-4 w-4" aria-hidden="true" />}>
                Crear proyecto
              </Button>
            }
          />
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
                      <span className="flex flex-wrap items-center gap-2 font-semibold text-slate-800">
                        {p.name}
                        {p.is_test && <Badge tone="amber">Prueba</Badge>}
                      </span>
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

function MetricCard({ icon: Icon, label, value, hint, to }: { icon: LucideIcon; label: string; value: string; hint?: string; to?: string }) {
  const cls = 'block rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,.04)]'
  const body = (
    <>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-600">{label}</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-slate-900">{value}</p>
          {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50 text-slate-500 ring-1 ring-slate-200" aria-hidden="true">
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </>
  )
  if (to) return (
    <Link to={to} className={`${cls} hover:border-brand-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500`}>
      {body}
    </Link>
  )
  return <div className={cls}>{body}</div>
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
