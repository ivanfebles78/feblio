import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles } from 'lucide-react'
import { startCheckout } from '../lib/billing/api'

/** Aviso no bloqueante durante la prueba: días restantes + acción de suscripción. */
export function TrialBanner({ daysLeft }: { daysLeft: number }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)

  async function subscribe() {
    setBusy(true)
    try {
      await startCheckout()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
      <Sparkles className="h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
      <p className="text-sm text-brand-900">
        <span className="font-semibold">{t('billing.trialBanner.title', { count: daysLeft })}</span>
        <span className="ml-1 text-brand-700">{t('billing.trialBanner.body')}</span>
      </p>
      <button
        type="button"
        onClick={subscribe}
        disabled={busy}
        className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:opacity-50"
      >
        {t('billing.trialBanner.cta')}
      </button>
    </div>
  )
}
