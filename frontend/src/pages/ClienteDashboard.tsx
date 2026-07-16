import { useEffect, useState } from 'react'
import { DashboardLayout, type NavItem } from '../components/DashboardLayout'
import { Badge, EmptyState, SectionCard, StatCard } from '../components/ui'
import { supabase } from '../lib/supabase'
import {
  formatEUR,
  STATUS_LABEL,
  type DocumentRow,
  type Project,
} from '../lib/types'

const NAV: NavItem[] = [
  { label: 'Mi proyecto', icon: '▦' },
  { label: 'Documentos', icon: '🗂️' },
  { label: 'Facturas', icon: '📊' },
]

const STATUS_TONE: Record<string, string> = {
  en_progreso: 'blue',
  completado: 'green',
  borrador: 'slate',
  cancelado: 'red',
}

export default function ClienteDashboard() {
  const [active, setActive] = useState('Mi proyecto')
  const [projects, setProjects] = useState<Project[]>([])
  const [documents, setDocuments] = useState<DocumentRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      const [p, d] = await Promise.all([
        supabase.from('projects').select('*').order('created_at', { ascending: false }),
        supabase.from('documents').select('*').order('created_at', { ascending: false }),
      ])
      setProjects((p.data as Project[]) ?? [])
      setDocuments((d.data as DocumentRow[]) ?? [])
      setLoading(false)
    })()
  }, [])

  const facturas = documents.filter((d) => d.type === 'factura')

  return (
    <DashboardLayout role="cliente" nav={NAV} active={active} onNavigate={setActive}>
      {loading ? (
        <p className="text-slate-400">Cargando datos…</p>
      ) : projects.length === 0 ? (
        <EmptyState text="Todavía no hay ningún proyecto asignado a tu cuenta." />
      ) : (
        <div className="space-y-6">
          {projects.map((p) => (
            <div key={p.id} className="space-y-6">
              <div className="surface overflow-hidden">
                <div className="bg-gradient-to-r from-teal-700 to-teal-900 px-6 py-6 text-white">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm text-teal-100">Tu proyecto</p>
                      <h2 className="text-2xl font-bold">{p.name}</h2>
                    </div>
                    <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                  </div>
                  <div className="mt-5">
                    <div className="flex items-center justify-between text-sm text-teal-100">
                      <span>Progreso del proyecto</span>
                      <span className="font-semibold text-white">{p.progress}%</span>
                    </div>
                    <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/20">
                      <div
                        className="h-full rounded-full bg-white"
                        style={{ width: `${p.progress}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <StatCard label="Presupuesto total" value={formatEUR(p.budget_total)} />
                <StatCard label="Facturado" value={formatEUR(p.invoiced)} />
                <StatCard
                  label="Pagos pendientes"
                  value={formatEUR(p.pending_payments)}
                  accent
                />
              </div>
            </div>
          ))}

          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard title="Documentos del proyecto">
              {documents.length === 0 ? (
                <EmptyState text="Sin documentos disponibles." />
              ) : (
                <ul className="space-y-3">
                  {documents.map((d) => (
                    <li
                      key={d.id}
                      className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2.5"
                    >
                      <span className="grid h-9 w-9 place-items-center rounded-lg bg-teal-50 text-teal-600">
                        📄
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-700">
                          {d.name}
                        </p>
                        <p className="text-xs capitalize text-slate-400">{d.type}</p>
                      </div>
                      <button className="text-sm font-medium text-brand-600 hover:underline">
                        Ver
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard title="Facturas">
              {facturas.length === 0 ? (
                <EmptyState text="Sin facturas por ahora." />
              ) : (
                <ul className="space-y-3">
                  {facturas.map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2.5"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-700">{f.name}</p>
                        <p className="text-xs text-slate-400">{f.status}</p>
                      </div>
                      <span className="text-sm font-semibold text-slate-700">
                        {formatEUR(f.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
