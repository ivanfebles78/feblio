import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DashboardLayout, type NavItem } from '../components/DashboardLayout'
import { Badge, EmptyState, SectionCard, StatCard } from '../components/ui'
import { supabase } from '../lib/supabase'
import { formatNumber, formatPercent } from '../lib/intl'
import type { Empresa, Profile, Project, ProjectStatus } from '../lib/types'

type NavKey = 'dashboard' | 'companies' | 'users' | 'projects'

/** Claves de navegación (las etiquetas visibles salen de admin.nav.*). */
const NAV_ITEMS: { key: NavKey; icon: string }[] = [
  { key: 'dashboard', icon: '▦' },
  { key: 'companies', icon: '🏢' },
  { key: 'users', icon: '👥' },
  { key: 'projects', icon: '📁' },
]

const STATUS_TONE: Record<string, string> = {
  en_progreso: 'blue',
  completado: 'green',
  borrador: 'slate',
  cancelado: 'red',
}

const ROLE_TONE: Record<Profile['role'], string> = { admin: 'amber', empresa: 'blue', cliente: 'green' }

/** Importes globales sin decimales (mismo formato que antes; la moneda no cambia con el idioma). */
const eur = (n: number | null | undefined) => formatNumber(n ?? 0, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

export default function AdminDashboard() {
  const { t } = useTranslation()
  const [activeKey, setActiveKey] = useState<NavKey>('dashboard')
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

  const navLabel = (key: NavKey) => t(`admin.nav.${key}`)
  const nav: NavItem[] = NAV_ITEMS.map((item) => ({ label: navLabel(item.key), icon: item.icon }))
  const statusLabel = (status: ProjectStatus) => t(`admin.status.${status}`)

  const invoiced = projects.reduce((s, p) => s + Number(p.invoiced), 0)
  const activos = projects.filter((p) => p.status === 'en_progreso').length

  return (
    <DashboardLayout
      role="admin"
      nav={nav}
      active={navLabel(activeKey)}
      onNavigate={(label) => {
        const found = NAV_ITEMS.find((item) => navLabel(item.key) === label)
        if (found) setActiveKey(found.key)
      }}
    >
      {loading ? (
        <p className="text-slate-400">{t('admin.loading')}</p>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label={t('admin.stats.companies')} value={String(empresas.length)} />
            <StatCard label={t('admin.stats.users')} value={String(profiles.length)} />
            <StatCard label={t('admin.stats.activeProjects')} value={String(activos)} />
            <StatCard label={t('admin.stats.invoicedGlobal')} value={eur(invoiced)} accent />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard title={t('admin.companies.title')} action={<Badge tone="blue">{empresas.length}</Badge>}>
              {empresas.length === 0 ? (
                <EmptyState text={t('admin.companies.empty')} />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {empresas.map((e) => {
                    const count = projects.filter((p) => p.empresa_id === e.id).length
                    return (
                      <li key={e.id} className="flex items-center justify-between py-3">
                        <div className="flex items-center gap-3">
                          <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white">
                            {e.name[0]}
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{e.name}</p>
                            <p className="text-xs text-slate-400">{e.cif ?? t('admin.companies.noTaxId')}</p>
                          </div>
                        </div>
                        <Badge tone="slate">{t('admin.companies.projectCount', { count })}</Badge>
                      </li>
                    )
                  })}
                </ul>
              )}
            </SectionCard>

            <SectionCard title={t('admin.users.title')}>
              <ul className="divide-y divide-slate-100">
                {profiles.map((u) => (
                  <li key={u.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm font-medium text-slate-700">{u.full_name ?? u.email}</p>
                      <p className="text-xs text-slate-400">{u.email}</p>
                    </div>
                    <Badge tone={ROLE_TONE[u.role]}>{t(`common.roles.${u.role}`)}</Badge>
                  </li>
                ))}
              </ul>
            </SectionCard>
          </div>

          <SectionCard title={t('admin.projects.title')}>
            {projects.length === 0 ? (
              <EmptyState text={t('admin.projects.empty')} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                      <th className="pb-2 font-medium">{t('admin.projects.columns.project')}</th>
                      <th className="pb-2 font-medium">{t('admin.projects.columns.status')}</th>
                      <th className="pb-2 text-right font-medium">{t('admin.projects.columns.budget')}</th>
                      <th className="pb-2 text-right font-medium">{t('admin.projects.columns.invoiced')}</th>
                      <th className="pb-2 text-right font-medium">{t('admin.projects.columns.progress')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {projects.map((p) => (
                      <tr key={p.id} className="text-slate-700">
                        <td className="py-3 font-medium">{p.name}</td>
                        <td className="py-3">
                          <Badge tone={STATUS_TONE[p.status]}>{statusLabel(p.status)}</Badge>
                        </td>
                        <td className="py-3 text-right">{eur(p.budget_total)}</td>
                        <td className="py-3 text-right">{eur(p.invoiced)}</td>
                        <td className="py-3 text-right">{formatPercent(p.progress)}</td>
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
