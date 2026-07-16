import { useEffect, useState } from 'react'
import { DashboardLayout, type NavItem } from '../components/DashboardLayout'
import { Badge, EmptyState, SectionCard, StatCard } from '../components/ui'
import { supabase } from '../lib/supabase'
import {
  formatEUR,
  ROLE_LABEL,
  STATUS_LABEL,
  type Empresa,
  type Profile,
  type Project,
} from '../lib/types'

const NAV: NavItem[] = [
  { label: 'Dashboard', icon: '▦' },
  { label: 'Empresas', icon: '🏢' },
  { label: 'Usuarios', icon: '👥' },
  { label: 'Proyectos', icon: '📁' },
]

const STATUS_TONE: Record<string, string> = {
  en_progreso: 'blue',
  completado: 'green',
  borrador: 'slate',
  cancelado: 'red',
}

export default function AdminDashboard() {
  const [active, setActive] = useState('Dashboard')
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      const [e, u, p] = await Promise.all([
        supabase.from('empresas').select('*'),
        supabase.from('profiles').select('id, email, full_name, role, empresa_id, cliente_id'),
        supabase.from('projects').select('*').order('created_at', { ascending: false }),
      ])
      setEmpresas((e.data as Empresa[]) ?? [])
      setProfiles((u.data as Profile[]) ?? [])
      setProjects((p.data as Project[]) ?? [])
      setLoading(false)
    })()
  }, [])

  const invoiced = projects.reduce((s, p) => s + Number(p.invoiced), 0)
  const activos = projects.filter((p) => p.status === 'en_progreso').length

  return (
    <DashboardLayout role="admin" nav={NAV} active={active} onNavigate={setActive}>
      {loading ? (
        <p className="text-slate-400">Cargando datos…</p>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Empresas" value={String(empresas.length)} />
            <StatCard label="Usuarios" value={String(profiles.length)} />
            <StatCard label="Proyectos activos" value={String(activos)} />
            <StatCard label="Facturado (global)" value={formatEUR(invoiced)} accent />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard
              title="Empresas (tenants)"
              action={<Badge tone="blue">{empresas.length}</Badge>}
            >
              {empresas.length === 0 ? (
                <EmptyState text="Sin empresas registradas." />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {empresas.map((e) => {
                    const count = projects.filter((p) => p.empresa_id === e.id).length
                    return (
                      <li
                        key={e.id}
                        className="flex items-center justify-between py-3"
                      >
                        <div className="flex items-center gap-3">
                          <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white">
                            {e.name[0]}
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-slate-800">
                              {e.name}
                            </p>
                            <p className="text-xs text-slate-400">
                              {e.cif ?? 'Sin CIF'}
                            </p>
                          </div>
                        </div>
                        <Badge tone="slate">{count} proyectos</Badge>
                      </li>
                    )
                  })}
                </ul>
              )}
            </SectionCard>

            <SectionCard title="Usuarios de la plataforma">
              <ul className="divide-y divide-slate-100">
                {profiles.map((u) => (
                  <li key={u.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm font-medium text-slate-700">
                        {u.full_name ?? u.email}
                      </p>
                      <p className="text-xs text-slate-400">{u.email}</p>
                    </div>
                    <Badge
                      tone={
                        u.role === 'admin'
                          ? 'amber'
                          : u.role === 'empresa'
                            ? 'blue'
                            : 'green'
                      }
                    >
                      {ROLE_LABEL[u.role]}
                    </Badge>
                  </li>
                ))}
              </ul>
            </SectionCard>
          </div>

          <SectionCard title="Todos los proyectos">
            {projects.length === 0 ? (
              <EmptyState text="Sin proyectos." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                      <th className="pb-2 font-medium">Proyecto</th>
                      <th className="pb-2 font-medium">Estado</th>
                      <th className="pb-2 text-right font-medium">Presupuesto</th>
                      <th className="pb-2 text-right font-medium">Facturado</th>
                      <th className="pb-2 text-right font-medium">Progreso</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {projects.map((p) => (
                      <tr key={p.id} className="text-slate-700">
                        <td className="py-3 font-medium">{p.name}</td>
                        <td className="py-3">
                          <Badge tone={STATUS_TONE[p.status]}>
                            {STATUS_LABEL[p.status]}
                          </Badge>
                        </td>
                        <td className="py-3 text-right">{formatEUR(p.budget_total)}</td>
                        <td className="py-3 text-right">{formatEUR(p.invoiced)}</td>
                        <td className="py-3 text-right">{p.progress}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>
      )}
    </DashboardLayout>
  )
}
