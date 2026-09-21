import {
  LayoutDashboard,
  FolderKanban,
  FileText,
  Receipt,
  Wallet,
  Users,
  FileBarChart,
  Settings,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatNumber } from '../lib/intl'

/** Datos ilustrativos del mockup (etiquetas en auth.hero.mockup.*; importes de ejemplo en EUR). */
const NAV = [
  { icon: LayoutDashboard, key: 'dashboard', active: true },
  { icon: FolderKanban, key: 'projects' },
  { icon: FileText, key: 'quotes' },
  { icon: Receipt, key: 'invoices' },
  { icon: Wallet, key: 'provisions' },
  { icon: Users, key: 'clients' },
  { icon: FileBarChart, key: 'reports' },
  { icon: Settings, key: 'settings' },
] as const

const STATS = [
  { key: 'totalBudget', value: 120000 },
  { key: 'invoiced', value: 75250 },
  { key: 'provision', value: 15000 },
  { key: 'pendingPayments', value: 29750 },
] as const

const DOCS = [
  { key: 'quote', size: '2.4 MB' },
  { key: 'contract', size: '1.1 MB' },
  { key: 'invoice', size: '1.3 MB' },
] as const

const TASKS = ['demolition', 'installations', 'masonry'] as const

/** Importe de ejemplo sin decimales (120.000 € · €120,000). */
const amount = (value: number) => formatNumber(value, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

export function HeroMockup() {
  const { t } = useTranslation()
  return (
    <div className="w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_40px_80px_-30px_rgba(15,23,42,.45)]">
      {/* Barra de ventana */}
      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        <span className="ml-3 text-[11px] font-medium text-slate-400">
          app.feblio.com/dashboard
        </span>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <aside className="hidden w-40 shrink-0 bg-gradient-to-b from-slate-800 to-slate-900 p-3 sm:block">
          <div className="mb-4 flex items-center gap-2 px-1">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-brand-600 text-[11px] font-bold text-white">
              F
            </span>
            <span className="text-sm font-bold text-white">Feblio</span>
          </div>
          <nav className="space-y-1">
            {NAV.map((n) => (
              <div
                key={n.key}
                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] font-medium ${
                  'active' in n && n.active ? 'bg-brand-600 text-white' : 'text-slate-300'
                }`}
              >
                <n.icon className="h-3.5 w-3.5" />
                {t(`auth.hero.mockup.nav.${n.key}`)}
              </div>
            ))}
          </nav>
        </aside>

        {/* Contenido */}
        <div className="min-w-0 flex-1 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-400">{t('auth.hero.mockup.projectSummary')}</p>
              <p className="text-sm font-bold text-slate-800">{t('auth.hero.mockup.projectName')}</p>
            </div>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 ring-1 ring-emerald-200">
              {t('auth.hero.mockup.inProgress')}
            </span>
          </div>

          {/* Stats */}
          <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
            {STATS.map((s, i) => (
              <div
                key={s.key}
                className={`rounded-lg p-2.5 ${
                  i === 3
                    ? 'bg-gradient-to-br from-brand-600 to-brand-700 text-white'
                    : 'bg-slate-50 text-slate-800'
                }`}
              >
                <p
                  className={`text-[9px] ${i === 3 ? 'text-brand-100' : 'text-slate-400'}`}
                >
                  {t(`auth.hero.mockup.stats.${s.key}`)}
                </p>
                <p className="mt-0.5 text-xs font-bold">{amount(s.value)}</p>
              </div>
            ))}
          </div>

          {/* Progreso + docs */}
          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-lg border border-slate-100 p-3">
              <div className="flex items-center justify-between text-[10px] text-slate-500">
                <span>{t('auth.hero.mockup.projectProgress')}</span>
                <span className="font-semibold text-slate-700">65%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full w-[65%] rounded-full bg-brand-600" />
              </div>
              <div className="mt-3 space-y-1.5">
                {TASKS.map((task, i) => (
                  <div
                    key={task}
                    className="flex items-center justify-between text-[10px]"
                  >
                    <span className="text-slate-500">{t(`auth.hero.mockup.tasks.${task}`)}</span>
                    <span
                      className={
                        i < 2 ? 'text-emerald-600' : 'text-brand-600'
                      }
                    >
                      {i < 2 ? t('auth.hero.mockup.completed') : t('auth.hero.mockup.inProgress')}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-slate-100 p-3">
              <p className="mb-2 text-[10px] font-semibold text-slate-600">{t('auth.hero.mockup.documents')}</p>
              <div className="space-y-1.5">
                {DOCS.map((d) => (
                  <div key={d.key} className="flex items-center gap-2">
                    <span className="grid h-6 w-6 place-items-center rounded bg-red-50 text-red-500">
                      <FileText className="h-3 w-3" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[10px] font-medium text-slate-700">{t(`auth.hero.mockup.docs.${d.key}`)}</p>
                      <p className="text-[9px] text-slate-400">PDF · {d.size}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
