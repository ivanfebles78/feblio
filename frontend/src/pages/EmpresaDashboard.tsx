import { lazy, Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FileText, LayoutDashboard, LogOut, PartyPopper, Settings, X } from 'lucide-react'
import { AppShell, type ShellNavItem } from '../components/v2/AppShell'
import { PlantillasSection } from '../sections/PlantillasSection'
import { EmpresaHome } from '../sections/EmpresaHome'
import { isSettingsTab, type SettingsTab } from '../sections/settings/settingsTabs'
import { LoadingScreen } from '../components/LoadingScreen'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import type { OnboardingStatus } from '../lib/routing'

// Configuración reutiliza los pasos del wizard: se carga bajo demanda
const SettingsSection = lazy(() => import('../sections/settings/SettingsSection'))

type Section = 'home' | 'templates' | 'settings'
const NAV: ShellNavItem[] = [
  { key: 'home', label: 'Inicio', icon: <LayoutDashboard className="h-5 w-5" /> },
  { key: 'templates', label: 'Plantillas', icon: <FileText className="h-5 w-5" /> },
  { key: 'settings', label: 'Configuración', icon: <Settings className="h-5 w-5" /> },
]
const TITLES: Record<Section, string> = { home: 'Inicio', templates: 'Plantillas', settings: 'Configuración' }

export interface EmpresaSummary {
  name: string
  trade_name: string | null
  onboarding_status: OnboardingStatus | null
  subscription_status: string | null
  trial_ends_at: string | null
}

/**
 * Dashboard de empresa. La verificación de email y la bienvenida de primera entrada
 * los resuelve <EmpresaGate> en App.tsx antes de montar esta pantalla. El onboarding
 * no bloquea: su progreso se muestra en la tarjeta de configuración de Inicio.
 */
export default function EmpresaDashboard() {
  const { profile, signOut } = useAuth()
  const [params, setParams] = useSearchParams()
  const empresaId = profile?.empresa_id ?? null
  const settingsParam = params.get('settings')
  const [active, setActive] = useState<Section>(settingsParam ? 'settings' : 'home')
  const [settingsTab, setSettingsTab] = useState<SettingsTab>(isSettingsTab(settingsParam) ? settingsParam : 'empresa')
  const [empresa, setEmpresa] = useState<EmpresaSummary | null>(null)
  const [checking, setChecking] = useState(true)
  const [welcome, setWelcome] = useState(params.get('welcome') === '1')
  const [highlightSetup] = useState(params.get('configurar') === '1')

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
    // Limpia los parámetros de navegación una vez aplicados
    if (params.has('welcome') || params.has('settings') || params.has('configurar')) {
      const next = new URLSearchParams(params)
      for (const k of ['welcome', 'settings', 'configurar', 'oauth', 'kind', 'message']) next.delete(k)
      setParams(next, { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (checking) return <LoadingScreen />

  const empresaName = empresa?.trade_name || empresa?.name || ''
  const initials = (profile?.full_name || profile?.email || '?')
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
  const trialDays = empresa?.trial_ends_at ? Math.max(0, Math.ceil((new Date(empresa.trial_ends_at).getTime() - Date.now()) / 86_400_000)) : null
  const subtitle = empresa?.subscription_status === 'trial' && trialDays !== null ? `Prueba · ${trialDays} días restantes` : empresa?.subscription_status === 'active' ? 'Cuenta activa' : undefined

  return (
    <AppShell
      nav={NAV}
      active={active}
      onNavigate={(key) => {
        setActive(key as Section)
        if (key === 'settings') setSettingsTab('empresa')
      }}
      breadcrumbs={[empresaName || 'Mi empresa', TITLES[active]]}
      user={{ name: profile?.full_name || profile?.email || '', email: profile?.email ?? '', company: empresaName || 'Mi empresa', initials, subtitle }}
      menu={[
        { key: 'settings', label: 'Configuración', icon: <Settings className="h-4 w-4" />, onSelect: () => setActive('settings') },
        { key: 'signout', label: 'Cerrar sesión', icon: <LogOut className="h-4 w-4" />, onSelect: () => void signOut() },
      ]}
    >
      {welcome && (
        <div className="mb-6 flex items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">
          <p className="flex items-start gap-2">
            <PartyPopper className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              <strong>¡Feblio está activo!</strong> Tu configuración se ha completado. Puedes ajustar canales, formularios, automatizaciones y facturación en cualquier
              momento desde Configuración.
            </span>
          </p>
          <button type="button" onClick={() => setWelcome(false)} className="rounded-lg p-1 text-emerald-700 hover:bg-emerald-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500" aria-label="Cerrar aviso">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
      {!empresaId ? (
        <p className="text-slate-600">No hay empresa asociada a tu cuenta.</p>
      ) : active === 'templates' ? (
        <PlantillasSection empresaId={empresaId} />
      ) : active === 'settings' ? (
        <Suspense fallback={<p className="text-slate-600">Cargando configuración…</p>}>
          <SettingsSection key={settingsTab} initialTab={settingsTab} />
        </Suspense>
      ) : (
        <EmpresaHome empresaId={empresaId} empresa={empresa} highlightSetup={highlightSetup} />
      )}
    </AppShell>
  )
}
