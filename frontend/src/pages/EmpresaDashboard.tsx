import { useEffect, useState } from 'react'
import { DashboardLayout, type NavItem } from '../components/DashboardLayout'
import { PlantillasSection } from '../sections/PlantillasSection'
import { EmpresaHome } from '../sections/EmpresaHome'
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
  const [empresaName, setEmpresaName] = useState('')

  useEffect(() => {
    if (!empresaId) return
    supabase
      .from('empresas')
      .select('name')
      .eq('id', empresaId)
      .single()
      .then(({ data }) => setEmpresaName((data as { name?: string } | null)?.name ?? ''))
  }, [empresaId])

  return (
    <DashboardLayout role="empresa" nav={NAV} active={active} onNavigate={setActive}>
      {!empresaId ? (
        <p className="text-slate-400">No hay empresa asociada a tu cuenta.</p>
      ) : active === 'Plantillas' ? (
        <PlantillasSection empresaId={empresaId} />
      ) : (
        <EmpresaHome empresaName={empresaName} />
      )}
    </DashboardLayout>
  )
}
