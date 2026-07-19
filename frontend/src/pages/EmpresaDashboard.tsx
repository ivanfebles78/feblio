import { useEffect, useState } from 'react'
import { DashboardLayout, type NavItem } from '../components/DashboardLayout'
import { PlantillasSection } from '../sections/PlantillasSection'
import { EmpresaHome } from '../sections/EmpresaHome'
import { VerifyEmailScreen } from '../sections/VerifyEmailScreen'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

const NAV: NavItem[] = [
  { label: 'Dashboard', icon: '▦' },
  { label: 'Plantillas', icon: '📄' },
]

export default function EmpresaDashboard() {
  const { profile } = useAuth()
  const empresaId = profile?.empresa_id ?? null
  const [active, setActive] = useState('Dashboard')
  const [empresa, setEmpresa] = useState<{ name: string; email_verified: boolean } | null>(
    null,
  )
  const [checking, setChecking] = useState(true)

  async function loadEmpresa() {
    if (!empresaId) {
      setChecking(false)
      return
    }
    const { data, error } = await supabase
      .from('empresas')
      .select('name, email_verified')
      .eq('id', empresaId)
      .single()
    if (error) {
      // Proyecto sin la migración 0008 (sin columna email_verified): tratar como verificada
      const r = await supabase.from('empresas').select('name').eq('id', empresaId).single()
      setEmpresa(r.data ? { name: (r.data as { name: string }).name, email_verified: true } : null)
    } else {
      setEmpresa(data as { name: string; email_verified: boolean } | null)
    }
    setChecking(false)
  }
  useEffect(() => {
    loadEmpresa()
  }, [empresaId]) // eslint-disable-line

  if (checking)
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 text-slate-400">
        Cargando…
      </div>
    )

  // Gate de verificación por código
  if (empresaId && empresa && !empresa.email_verified)
    return <VerifyEmailScreen email={profile?.email ?? ''} onVerified={loadEmpresa} />

  return (
    <DashboardLayout role="empresa" nav={NAV} active={active} onNavigate={setActive}>
      {!empresaId ? (
        <p className="text-slate-400">No hay empresa asociada a tu cuenta.</p>
      ) : active === 'Plantillas' ? (
        <PlantillasSection empresaId={empresaId} />
      ) : (
        <EmpresaHome empresaName={empresa?.name ?? ''} />
      )}
    </DashboardLayout>
  )
}
