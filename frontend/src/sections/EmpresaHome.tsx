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
  type LucideIcon,
} from 'lucide-react'
import { SectionCard, Badge, EmptyState } from '../components/ui'
import { supabase } from '../lib/supabase'
import {
  formatEUR,
  STATUS_LABEL,
  type DocumentRow,
  type Project,
  type Task,
  type DocumentType,
} from '../lib/types'

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
  const [projects, setProjects] = useState<Project[]>([])
  const [clientesCount, setClientesCount] = useState(0)
  const [documents, setDocuments] = useState<DocumentRow[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<Set<string>>(new Set())

  useEffect(() => {
    ;(async () => {
      const [p, c, d, t] = await Promise.all([
        supabase.from('projects').select('*').order('created_at', { ascending: false }),
        supabase.from('clientes').select('id'),
        supabase.from('documents').select('*').order('created_at', { ascending: false }),
        supabase
          .from('tasks')
          .select('*')
          .eq('status', 'pendiente')
          .order('priority', { ascending: true })
          .order('created_at', { ascending: true }),
      ])
      setProjects((p.data as Project[]) ?? [])
      setClientesCount((c.data as unknown[])?.length ?? 0)
      setDocuments((d.data as DocumentRow[]) ?? [])
      setTasks((t.data as Task[]) ?? [])
      setLoading(false)
    })()
  }, [])

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
      <SectionCard title="Tus proyectos" action={<Badge tone="blue">{projects.length}</Badge>}>
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
