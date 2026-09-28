/**
 * Lógica de acceso por facturación (pura, testeable). Decide si una empresa puede usar el producto
 * según su estado de suscripción y el fin de la prueba. No depende de Stripe ni de la red.
 *
 * subscription_status (0008): trial | active | past_due | canceled.
 */
export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'canceled'

export interface BillingInfo {
  subscription_status: SubscriptionStatus
  trial_ends_at: string | null
  current_period_end: string | null
}

export type BillingState = 'active' | 'trial' | 'trial_expired' | 'past_due' | 'canceled'

export interface BillingEvaluation {
  /** ¿Puede usar el dashboard? Si es false, se muestra el muro de suscripción. */
  allowed: boolean
  state: BillingState
  /** Días completos que quedan de prueba (solo en state 'trial'); null en el resto. */
  daysLeft: number | null
}

const DAY_MS = 86_400_000

export function evaluateBilling(info: BillingInfo, now: number = Date.now()): BillingEvaluation {
  const { subscription_status: status, trial_ends_at } = info

  if (status === 'active') return { allowed: true, state: 'active', daysLeft: null }
  if (status === 'past_due') return { allowed: false, state: 'past_due', daysLeft: null }
  if (status === 'canceled') return { allowed: false, state: 'canceled', daysLeft: null }

  // status === 'trial'
  const ends = trial_ends_at ? new Date(trial_ends_at).getTime() : null
  if (ends != null && ends > now) {
    return { allowed: true, state: 'trial', daysLeft: Math.max(0, Math.ceil((ends - now) / DAY_MS)) }
  }
  return { allowed: false, state: 'trial_expired', daysLeft: null }
}
