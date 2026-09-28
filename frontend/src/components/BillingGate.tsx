import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Lock, Sparkles } from 'lucide-react'
import { Button } from './v2/Button'
import { useAuth } from '../context/AuthContext'
import { startCheckout } from '../lib/billing/api'
import type { BillingState } from '../lib/billing/logic'

/**
 * Muro de suscripción: pantalla bloqueante de la que no se sale sin suscribirse. La única salida
 * alternativa es cerrar sesión. Se muestra cuando la prueba ha vencido o el pago falta/está cancelado.
 * No es descartable (sin botón de cerrar, sin cierre por Escape/backdrop).
 */
export function BillingGate({ state }: { state: BillingState }) {
  const { t } = useTranslation()
  const { signOut } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function subscribe() {
    setBusy(true)
    setError(null)
    try {
      await startCheckout() // redirige a Stripe; si vuelve, es que hubo error
      setError(t('billing.gate.error'))
    } catch {
      setError(t('billing.gate.error'))
    } finally {
      setBusy(false)
    }
  }

  const key = state === 'past_due' ? 'pastDue' : state === 'canceled' ? 'canceled' : 'trialExpired'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="billing-gate-title">
      <div className="w-full max-w-md rounded-2xl bg-white p-7 shadow-2xl">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
          <Lock className="h-6 w-6" aria-hidden="true" />
        </div>
        <h2 id="billing-gate-title" className="text-xl font-bold tracking-tight text-slate-900">{t(`billing.gate.${key}.title`)}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{t(`billing.gate.${key}.body`)}</p>

        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-800">{t('billing.plan.name')}</p>
          <p className="mt-0.5 text-2xl font-bold text-slate-900">{t('billing.plan.price')}<span className="text-sm font-medium text-slate-500"> {t('billing.plan.period')}</span></p>
          <p className="mt-1 text-xs text-slate-500">{t('billing.plan.tagline')}</p>
        </div>

        {error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{error}</p>}

        <Button block className="mt-5" onClick={subscribe} disabled={busy} leading={<Sparkles className="h-4 w-4" aria-hidden="true" />}>
          {busy ? t('billing.gate.redirecting') : t('billing.gate.subscribe')}
        </Button>
        <button type="button" onClick={() => void signOut()} className="mt-3 w-full text-center text-sm text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline">
          {t('billing.gate.logout')}
        </button>
      </div>
    </div>
  )
}
