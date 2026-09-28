import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CreditCard } from 'lucide-react'
import { SectionCard } from '../../components/ui'
import { Button } from '../../components/v2/Button'
import { StatusPill, type PillTone } from '../../components/v2/Card'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { formatDate } from '../../lib/intl'
import { openBillingPortal, startCheckout } from '../../lib/billing/api'
import { evaluateBilling, type BillingState, type SubscriptionStatus } from '../../lib/billing/logic'

const TONE: Record<BillingState, PillTone> = {
  active: 'success', trial: 'info', trial_expired: 'pending', past_due: 'pending', canceled: 'neutral',
}

/** Suscripción de la empresa: estado actual + suscribirse (Stripe Checkout) o gestionar (Portal). */
export function SubscriptionCard() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const [row, setRow] = useState<{ status: SubscriptionStatus; trialEndsAt: string | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (profile?.role !== 'empresa' || !profile.empresa_id) return
    let active = true
    void supabase.from('empresas').select('subscription_status, trial_ends_at').eq('id', profile.empresa_id).maybeSingle().then(({ data }) => {
      if (!active || !data) return
      const d = data as { subscription_status?: SubscriptionStatus; trial_ends_at?: string | null }
      setRow({ status: d.subscription_status ?? 'trial', trialEndsAt: d.trial_ends_at ?? null })
    })
    return () => { active = false }
  }, [profile?.empresa_id, profile?.role])

  async function act(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch {
      setError(t('billing.errors.action'))
      setBusy(false)
    }
  }

  if (!row) return null
  const evalResult = evaluateBilling({ subscription_status: row.status, trial_ends_at: row.trialEndsAt, current_period_end: null })
  const isActive = row.status === 'active'

  return (
    <SectionCard title={t('billing.subscription.title')}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-brand-100">
          <CreditCard className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <StatusPill tone={TONE[evalResult.state]}>{t(`billing.state.${evalResult.state}`)}</StatusPill>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {evalResult.state === 'trial' && row.trialEndsAt
              ? t('billing.subscription.trialUntil', { date: formatDate(row.trialEndsAt), count: evalResult.daysLeft ?? 0 })
              : isActive
                ? t('billing.subscription.activeInfo')
                : t('billing.subscription.inactiveInfo')}
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          {isActive ? (
            <Button variant="secondary" onClick={() => act(openBillingPortal)} disabled={busy}>{t('billing.subscription.manage')}</Button>
          ) : (
            <Button onClick={() => act(startCheckout)} disabled={busy}>{t('billing.subscription.subscribe')}</Button>
          )}
        </div>
      </div>
      {error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{error}</p>}
      <p className="mt-3 text-xs text-slate-500">{t('billing.plan.name')} · {t('billing.plan.price')} {t('billing.plan.period')}</p>
    </SectionCard>
  )
}
