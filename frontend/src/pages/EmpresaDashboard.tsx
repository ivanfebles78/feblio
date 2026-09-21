import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { FileText, Inbox, LayoutDashboard, LogOut, PartyPopper, Settings, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { AppShell, type ShellNavItem } from '../components/v2/AppShell'
import { NotificationsBell } from '../components/v2/NotificationsBell'
import { PlantillasSection } from '../sections/PlantillasSection'
import { EmpresaHome } from '../sections/EmpresaHome'
import { isSettingsTab, type SettingsTab } from '../sections/settings/settingsTabs'
import { LoadingScreen } from '../components/LoadingScreen'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useNotifications } from '../lib/solicitudes/useNotifications'
import { EMPRESA_PATHS, type OnboardingStatus } from '../lib/routing'

// Secciones pesadas bajo demanda
const SettingsSection = lazy(() => import('../sections/settings/SettingsSection'))
const SolicitudesInbox = lazy(() => import('./solicitudes/SolicitudesInbox'))
const NuevaSolicitud = lazy(() => import('./solicitudes/NuevaSolicitud'))
const SolicitudDetalle = lazy(() => import('./solicitudes/SolicitudDetalle'))

type Section = 'home' | 'solicitudes' | 'templates' | 'settings'
/** Claves de traducción de cada sección (el texto se resuelve con t() al renderizar). */
const SECTION_LABEL_KEY: Record<Section, string> = {
  home: 'common.nav.home',
  solicitudes: 'common.nav.requests',
  templates: 'common.nav.templates',
  settings: 'common.nav.settings',
}
const NAV: Omit<ShellNavItem, 'label'>[] = [
  { key: 'home', icon: <LayoutDashboard className="h-5 w-5" /> },
  { key: 'solicitudes', icon: <Inbox className="h-5 w-5" /> },
  { key: 'templates', icon: <FileText className="h-5 w-5" /> },
  { key: 'settings', icon: <Settings className="h-5 w-5" /> },
]
const SECTION_PATH: Record<Section, string> = {
  home: EMPRESA_PATHS.home,
  solicitudes: EMPRESA_PATHS.solicitudes,
  templates: EMPRESA_PATHS.plantillas,
  settings: EMPRESA_PATHS.configuracion,
}

function sectionFromPath(pathname: string): Section {
  if (pathname.startsWith(EMPRESA_PATHS.solicitudes)) return 'solicitudes'
  if (pathname.startsWith(EMPRESA_PATHS.plantillas)) return 'templates'
  if (pathname.startsWith(EMPRESA_PATHS.configuracion)) return 'settings'
  return 'home'
}

export interface EmpresaSummary {
  name: string
  trade_name: string | null
  onboarding_status: OnboardingStatus | null
  subscription_status: string | null
  trial_ends_at: string | null
}

/**
 * Dashboard de empresa con rutas anidadas (/empresa/*). La verificación de email y la
 * bienvenida de primera entrada los resuelve <EmpresaGate> en App.tsx antes de montar esta
 * pantalla. El onboarding no bloquea: su progreso se muestra en la tarjeta de Inicio.
 * Compatibilidad: `/empresa?settings=<tab>` sigue abriendo Configuración en esa pestaña.
 */
export default function EmpresaDashboard() {
  const { t } = useTranslation()
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const empresaId = profile?.empresa_id ?? null
  const settingsParam = params.get('settings')
  const [settingsTab, setSettingsTab] = useState<SettingsTab>(isSettingsTab(settingsParam) ? settingsParam : 'empresa')
  const [empresa, setEmpresa] = useState<EmpresaSummary | null>(null)
  const [checking, setChecking] = useState(true)
  const [welcome, setWelcome] = useState(params.get('welcome') === '1')
  const [highlightSetup] = useState(params.get('configurar') === '1')
  const notifications = useNotifications(empresaId)
  const active = sectionFromPath(location.pathname)

  useEffect(() => {
    if (!empresaId) {
      setChecking(false)
      return
    }
    supabase
      .from('empresas')
      .select('name, trade_name, onboarding_status, subscription_status, trial_ends_at')
      .eq('id', empresaId)
      .single()
      .then(({ data }) => {
        setEmpresa((data as EmpresaSummary | null) ?? null)
        setChecking(false)
      })
  }, [empresaId])

  useEffect(() => {
    // Limpia los parámetros de navegación una vez aplicados; ?settings= redirige a Configuración
    if (params.has('welcome') || params.has('settings') || params.has('configurar')) {
      const next = new URLSearchParams(params)
      for (const k of ['welcome', 'settings', 'configurar', 'oauth', 'kind', 'message']) next.delete(k)
      if (settingsParam) navigate({ pathname: EMPRESA_PATHS.configuracion, search: next.toString() }, { replace: true })
      else setParams(next, { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const initials = useMemo(
    () =>
      (profile?.full_name || profile?.email || '?')
        .split(/\s+/)
        .map((s) => s[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase(),
    [profile?.full_name, profile?.email],
  )

  if (checking) return <LoadingScreen />

  const empresaName = empresa?.trade_name || empresa?.name || ''
  const trialDays = empresa?.trial_ends_at ? Math.max(0, Math.ceil((new Date(empresa.trial_ends_at).getTime() - Date.now()) / 86_400_000)) : null
  const subtitle =
    empresa?.subscription_status === 'trial' && trialDays !== null
      ? t('dashboard.shell.trialDaysLeft', { count: trialDays })
      : empresa?.subscription_status === 'active'
        ? t('dashboard.shell.activeAccount')
        : undefined
  const companyLabel = empresaName || t('common.nav.myCompany')
  const go = (section: Section) => {
    if (section === 'settings') setSettingsTab('empresa')
    navigate(SECTION_PATH[section])
  }

  return (
    <AppShell
      nav={NAV.map((n) => ({
        ...n,
        label: t(SECTION_LABEL_KEY[n.key as Section]),
        ...(n.key === 'solicitudes' && notifications.unread > 0 ? { badge: String(notifications.unread) } : {}),
      }))}
      active={active}
      onNavigate={(key) => go(key as Section)}
      breadcrumbs={[companyLabel, t(SECTION_LABEL_KEY[active])]}
      user={{ name: profile?.full_name || profile?.email || '', email: profile?.email ?? '', company: companyLabel, initials, subtitle }}
      bell={<NotificationsBell items={notifications.items} unread={notifications.unread} loading={notifications.loading} error={notifications.error} onMarkOne={(id) => void notifications.markOne(id)} onMarkAll={() => void notifications.markAll()} onOpen={(path) => navigate(path)} />}
      menu={[
        { key: 'settings', label: t('common.nav.settings'), icon: <Settings className="h-4 w-4" />, onSelect: () => go('settings') },
        { key: 'signout', label: t('common.actions.signOut'), icon: <LogOut className="h-4 w-4" />, onSelect: () => void signOut() },
      ]}
    >
      {welcome && (
        <div className="mb-6 flex items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">
          <p className="flex items-start gap-2">
            <PartyPopper className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              <strong>{t('dashboard.shell.welcomeTitle')}</strong> {t('dashboard.shell.welcomeBody')}
            </span>
          </p>
          <button type="button" onClick={() => setWelcome(false)} className="rounded-lg p-1 text-emerald-700 hover:bg-emerald-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500" aria-label={t('common.actions.closeNotice')}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
      {!empresaId ? (
        <p className="text-slate-600">{t('dashboard.shell.noCompany')}</p>
      ) : (
        <Suspense fallback={<p className="text-slate-600">{t('common.state.loading')}</p>}>
          <Routes>
            <Route index element={<EmpresaHome empresaId={empresaId} empresa={empresa} highlightSetup={highlightSetup} />} />
            <Route path="solicitudes" element={<SolicitudesInbox />} />
            <Route path="solicitudes/nueva" element={<NuevaSolicitud />} />
            <Route path="solicitudes/:id" element={<SolicitudDetalle empresaId={empresaId} />} />
            <Route path="plantillas" element={<PlantillasSection empresaId={empresaId} />} />
            <Route path="configuracion" element={<SettingsSection key={settingsTab} initialTab={settingsTab} />} />
            <Route path="*" element={<Navigate to={EMPRESA_PATHS.home} replace />} />
          </Routes>
        </Suspense>
      )}
    </AppShell>
  )
}
