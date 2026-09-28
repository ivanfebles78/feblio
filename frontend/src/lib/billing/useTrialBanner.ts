import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { isBillingEnabled } from '../env'
import { useAuth } from '../../context/AuthContext'
import { evaluateBilling, type SubscriptionStatus } from './logic'

/**
 * Días de prueba restantes para el banner del dashboard, o null si no procede (facturación apagada,
 * no es empresa, o la prueba no está vigente). Lectura ligera de la propia empresa (RLS).
 */
export function useTrialBanner(): number | null {
  const { profile } = useAuth()
  const [daysLeft, setDaysLeft] = useState<number | null>(null)

  useEffect(() => {
    if (!isBillingEnabled() || profile?.role !== 'empresa' || !profile.empresa_id) {
      setDaysLeft(null)
      return
    }
    let active = true
    void supabase
      .from('empresas')
      .select('subscription_status, trial_ends_at')
      .eq('id', profile.empresa_id)
      .maybeSingle()
      .then(({ data }) => {
        if (!active || !data) return
        const row = data as { subscription_status?: SubscriptionStatus; trial_ends_at?: string | null }
        const evalResult = evaluateBilling({
          subscription_status: row.subscription_status ?? 'trial',
          trial_ends_at: row.trial_ends_at ?? null,
          current_period_end: null,
        })
        setDaysLeft(evalResult.state === 'trial' ? evalResult.daysLeft : null)
      })
    return () => {
      active = false
    }
  }, [profile?.empresa_id, profile?.role])

  return daysLeft
}
