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
} from 'lucide-react'
import { StatCard, SectionCard, Badge, EmptyState } from '../components/ui'
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
      {/* Saludo */}
      <div>
        <h2 className="text-xl font-bold text-slate-900">
          Hola, {empresaName || 'empresa'} 👋
        </h2>
        <p className="text-sm text-slate-500">Este es el resumen de tu actividad.</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Proyectos" value={String(projects.length)} hint={`${projects.filter((p) => p.status === 'en_progreso').length} en progreso`} />
        <StatCard label="Clientes" value={String(clientesCount)} />
        <StatCard label="Facturado" value={formatEUR(invoiced)} />
        <StatCard label="Pendientes" value={String(tasks.length)} accent />
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
                                      <FileText className="h-3.5 w-3.5 text-brand-500" />
                                      <span className="min-w-0 flex-1 truncate text-slate-700">{d.name}</span>
                                      {d.status && <Badge tone="slate">{d.status}</Badge>}
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
