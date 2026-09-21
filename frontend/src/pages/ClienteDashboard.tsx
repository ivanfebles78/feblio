import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DashboardLayout, type NavItem } from '../components/DashboardLayout'
import { Badge, EmptyState, SectionCard, StatCard } from '../components/ui'
import { supabase } from '../lib/supabase'
import { formatNumber, formatPercent } from '../lib/intl'
import type { DocumentRow, DocumentType, Project, ProjectStatus } from '../lib/types'

type NavKey = 'project' | 'documents' | 'invoices'

/** Claves de navegación (las etiquetas visibles salen de client.nav.*). */
const NAV_ITEMS: { key: NavKey; icon: string }[] = [
  { key: 'project', icon: '▦' },
  { key: 'documents', icon: '🗂️' },
  { key: 'invoices', icon: '📊' },
]

const STATUS_TONE: Record<string, string> = {
  en_progreso: 'blue',
  completado: 'green',
  borrador: 'slate',
  cancelado: 'red',
}

const DOCUMENT_TYPES: readonly DocumentType[] = ['presupuesto', 'provision', 'factura', 'contrato', 'otro']

/** Importes sin decimales (mismo formato que antes; la moneda no cambia con el idioma). */
const eur = (n: number | null | undefined) => formatNumber(n ?? 0, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

export default function ClienteDashboard() {
  const { t } = useTranslation()
  const [activeKey, setActiveKey] = useState<NavKey>('project')
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

  const navLabel = (key: NavKey) => t(`client.nav.${key}`)
  const nav: NavItem[] = NAV_ITEMS.map((item) => ({ label: navLabel(item.key), icon: item.icon }))
  const statusLabel = (status: ProjectStatus) => t(`client.status.${status}`)
  /** Tipos conocidos se traducen; cualquier otro valor se muestra tal cual (dato). */
  const documentTypeLabel = (type: DocumentType | string) => (DOCUMENT_TYPES.includes(type as DocumentType) ? t(`client.documentType.${type}`) : type)

  const facturas = documents.filter((d) => d.type === 'factura')

  return (
    <DashboardLayout
      role="cliente"
      nav={nav}
      active={navLabel(activeKey)}
      onNavigate={(label) => {
        const found = NAV_ITEMS.find((item) => navLabel(item.key) === label)
        if (found) setActiveKey(found.key)
      }}
    >
      {loading ? (
        <p className="text-slate-400">{t('client.loading')}</p>
      ) : projects.length === 0 ? (
        <EmptyState text={t('client.noProjects')} />
      ) : (
        <div className="space-y-6">
          {projects.map((p) => (
            <div key={p.id} className="space-y-6">
              <div className="surface overflow-hidden">
                <div className="bg-gradient-to-r from-teal-700 to-teal-900 px-6 py-6 text-white">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm text-teal-100">{t('client.project.yourProject')}</p>
                      <h2 className="text-2xl font-bold">{p.name}</h2>
                    </div>
                    <Badge tone={STATUS_TONE[p.status]}>{statusLabel(p.status)}</Badge>
                  </div>
                  <div className="mt-5">
                    <div className="flex items-center justify-between text-sm text-teal-100">
                      <span>{t('client.project.progress')}</span>
                      <span className="font-semibold text-white">{formatPercent(p.progress)}</span>
                    </div>
                    <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/20">
                      <div className="h-full rounded-full bg-white" style={{ width: `${p.progress}%` }} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <StatCard label={t('client.stats.budgetTotal')} value={eur(p.budget_total)} />
                <StatCard label={t('client.stats.invoiced')} value={eur(p.invoiced)} />
                <StatCard label={t('client.stats.pendingPayments')} value={eur(p.pending_payments)} accent />
              </div>
            </div>
          ))}

          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard title={t('client.documents.title')}>
              {documents.length === 0 ? (
                <EmptyState text={t('client.documents.empty')} />
              ) : (
                <ul className="space-y-3">
                  {documents.map((d) => (
                    <li key={d.id} className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2.5">
                      <span className="grid h-9 w-9 place-items-center rounded-lg bg-teal-50 text-teal-600" aria-hidden="true">
                        📄
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-700">{d.name}</p>
                        <p className="text-xs text-slate-400">{documentTypeLabel(d.type)}</p>
                      </div>
                      <button type="button" className="text-sm font-medium text-brand-600 hover:underline">
                        {t('common.actions.view')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard title={t('client.invoices.title')}>
              {facturas.length === 0 ? (
                <EmptyState text={t('client.invoices.empty')} />
              ) : (
                <ul className="space-y-3">
                  {facturas.map((f) => (
                    <li key={f.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2.5">
                      <div>
                        <p className="text-sm font-medium text-slate-700">{f.name}</p>
                        <p className="text-xs text-slate-400">{f.status}</p>
                      </div>
                      <span className="text-sm font-semibold text-slate-700">{eur(f.amount)}</span>
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
