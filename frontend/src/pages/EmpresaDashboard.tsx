import { useEffect, useState } from 'react'
import { DashboardLayout, type NavItem } from '../components/DashboardLayout'
import { Badge, EmptyState, SectionCard, StatCard } from '../components/ui'
import { PlantillasSection } from '../sections/PlantillasSection'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import {
  formatEUR,
  STATUS_LABEL,
  type Cliente,
  type DocumentRow,
  type Project,
} from '../lib/types'

const NAV: NavItem[] = [
  { label: 'Dashboard', icon: '▦' },
  { label: 'Proyectos', icon: '📁' },
  { label: 'Clientes', icon: '👥' },
  { label: 'Documentos', icon: '🗂️' },
  { label: 'Plantillas', icon: '📄' },
]

const STATUS_TONE: Record<string, string> = {
  en_progreso: 'blue',
  completado: 'green',
  borrador: 'slate',
  cancelado: 'red',
}

interface Template {
  id: string
  name: string
  type: string
}

export default function EmpresaDashboard() {
  const { profile } = useAuth()
  const empresaId = profile?.empresa_id ?? null
  const [active, setActive] = useState('Dashboard')
  const [projects, setProjects] = useState<Project[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [documents, setDocuments] = useState<DocumentRow[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      const [p, c, d, t] = await Promise.all([
        supabase.from('projects').select('*').order('created_at', { ascending: false }),
        supabase.from('clientes').select('*'),
        supabase.from('documents').select('*').order('created_at', { ascending: false }),
        supabase.from('document_templates').select('id, name, type'),
      ])
      setProjects((p.data as Project[]) ?? [])
      setClientes((c.data as Cliente[]) ?? [])
      setDocuments((d.data as DocumentRow[]) ?? [])
      setTemplates((t.data as Template[]) ?? [])
      setLoading(false)
    })()
  }, [])

  const totals = projects.reduce(
    (acc, p) => ({
      budget: acc.budget + Number(p.budget_total),
      invoiced: acc.invoiced + Number(p.invoiced),
      provision: acc.provision + Number(p.provision_funds),
      pending: acc.pending + Number(p.pending_payments),
    }),
    { budget: 0, invoiced: 0, provision: 0, pending: 0 },
  )

  return (
    <DashboardLayout role="empresa" nav={NAV} active={active} onNavigate={setActive}>
      {active === 'Plantillas' ? (
        empresaId ? (
          <PlantillasSection empresaId={empresaId} />
        ) : (
          <p className="text-slate-400">No hay empresa asociada a tu cuenta.</p>
        )
      ) : loading ? (
        <p className="text-slate-400">Cargando datos…</p>
      ) : (
        <div className="space-y-6">
          {/* Stat row */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Presupuesto total" value={formatEUR(totals.budget)} />
            <StatCard label="Facturado" value={formatEUR(totals.invoiced)} />
            <StatCard label="Provisión de fondos" value={formatEUR(totals.provision)} />
            <StatCard
              label="Pagos pendientes"
              value={formatEUR(totals.pending)}
              accent
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Projects */}
            <SectionCard
              title="Proyectos"
              className="lg:col-span-2"
              action={<Badge tone="blue">{projects.length} activos</Badge>}
            >
              {projects.length === 0 ? (
                <EmptyState text="Aún no tienes proyectos." />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {projects.map((p) => (
                    <li key={p.id} className="py-3.5">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold text-slate-800">{p.name}</p>
                        <Badge tone={STATUS_TONE[p.status]}>
                          {STATUS_LABEL[p.status]}
                        </Badge>
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-brand-600"
                            style={{ width: `${p.progress}%` }}
                          />
                        </div>
                        <span className="w-10 text-right text-xs font-semibold text-slate-500">
                          {p.progress}%
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-400">
                        <span>Presupuesto {formatEUR(p.budget_total)}</span>
                        <span>Facturado {formatEUR(p.invoiced)}</span>
                        <span>Pendiente {formatEUR(p.pending_payments)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            {/* Documents */}
            <SectionCard title="Documentos recientes">
              {documents.length === 0 ? (
                <EmptyState text="Sin documentos." />
              ) : (
                <ul className="space-y-3">
                  {documents.slice(0, 6).map((d) => (
                    <li key={d.id} className="flex items-center gap-3">
                      <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-50 text-brand-600">
                        📄
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-700">
                          {d.name}
                        </p>
                        <p className="text-xs capitalize text-slate-400">
                          {d.type} {d.status ? `· ${d.status}` : ''}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Clients */}
            <SectionCard
              title="Clientes"
              action={<Badge tone="slate">{clientes.length}</Badge>}
            >
              {clientes.length === 0 ? (
                <EmptyState text="Sin clientes todavía." />
              ) : (
                <ul className="space-y-3">
                  {clientes.map((c) => (
                    <li key={c.id} className="flex items-center gap-3">
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-emerald-50 text-emerald-600">
                        {c.name[0]}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-slate-700">{c.name}</p>
                        <p className="text-xs text-slate-400">{c.email}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            {/* Templates */}
            <SectionCard title="Plantillas de documentos">
              {templates.length === 0 ? (
                <EmptyState text="Crea tu primera plantilla." />
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {templates.map((t) => (
                    <li
                      key={t.id}
                      className="rounded-xl border border-slate-200 px-3 py-3 text-sm"
                    >
                      <p className="font-medium text-slate-700">{t.name}</p>
                      <p className="mt-0.5 text-xs capitalize text-slate-400">{t.type}</p>
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
