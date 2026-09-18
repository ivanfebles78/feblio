import { lazy, Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PartyPopper, X } from 'lucide-react'
import { DashboardLayout, type NavItem } from '../components/DashboardLayout'
import { PlantillasSection } from '../sections/PlantillasSection'
import { EmpresaHome } from '../sections/EmpresaHome'
import { isSettingsTab, type SettingsTab } from '../sections/settings/settingsTabs'
import { LoadingScreen } from '../components/LoadingScreen'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

// Configuración reutiliza los pasos del wizard: se carga bajo demanda
const SettingsSection = lazy(() => import('../sections/settings/SettingsSection'))

const NAV: NavItem[] = [
  { label: 'Dashboard', icon: '▦' },
  { label: 'Plantillas', icon: '📄' },
  { label: 'Configuración', icon: '⚙️' },
]

/**
 * Dashboard de empresa. La verificación de email y el estado del onboarding
 * los resuelve <EmpresaGate> en App.tsx antes de montar esta pantalla.
 */
export default function EmpresaDashboard() {
  const { profile } = useAuth()
  const [params, setParams] = useSearchParams()
  const empresaId = profile?.empresa_id ?? null
  const settingsParam = params.get('settings')
  const [active, setActive] = useState(settingsParam ? 'Configuración' : 'Dashboard')
  const [settingsTab, setSettingsTab] = useState<SettingsTab>(isSettingsTab(settingsParam) ? settingsParam : 'empresa')
  const [empresaName, setEmpresaName] = useState('')
  const [checking, setChecking] = useState(true)
  const [welcome, setWelcome] = useState(params.get('welcome') === '1')

  useEffect(() => {
    if (!empresaId) {
      setChecking(false)
      return
    }
    supabase
      .from('empresas')
      .select('name, trade_name')
      .eq('id', empresaId)
      .single()
      .then(({ data }) => {
        const e = data as { name: string; trade_name?: string | null } | null
        setEmpresaName(e?.trade_name || e?.name || '')
        setChecking(false)
      })
  }, [empresaId])

  useEffect(() => {
    // Limpia los parámetros de navegación una vez aplicados
    if (params.has('welcome') || params.has('settings')) {
      const next = new URLSearchParams(params)
      next.delete('welcome')
      next.delete('settings')
      next.delete('oauth')
      next.delete('kind')
      next.delete('message')
      setParams(next, { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (checking) return <LoadingScreen />

  return (
    <DashboardLayout
      role="empresa"
      nav={NAV}
      active={active}
      onNavigate={(label) => {
        setActive(label)
        if (label === 'Configuración') setSettingsTab('empresa')
      }}
    >
      {welcome && (
        <div className="mb-6 flex items-start justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">
          <p className="flex items-start gap-2">
            <PartyPopper className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              <strong>¡Feblio está activo!</strong> Tu configuración inicial se ha completado. Puedes ajustar canales, formularios, automatizaciones y facturación en
              cualquier momento desde Configuración.
            </span>
          </p>
          <button type="button" onClick={() => setWelcome(false)} className="rounded-lg p-1 text-emerald-700 hover:bg-emerald-100" aria-label="Cerrar aviso">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
      {!empresaId ? (
        <p className="text-slate-500">No hay empresa asociada a tu cuenta.</p>
      ) : active === 'Plantillas' ? (
        <PlantillasSection empresaId={empresaId} />
      ) : active === 'Configuración' ? (
        <Suspense fallback={<p className="text-slate-500">Cargando configuración…</p>}>
          <SettingsSection key={settingsTab} initialTab={settingsTab} />
        </Suspense>
      ) : (
        <EmpresaHome empresaName={empresaName} />
      )}
    </DashboardLayout>
  )
}
