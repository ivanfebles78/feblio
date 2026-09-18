import { ArrowLeft, ArrowRight, SkipForward } from 'lucide-react'

interface OnboardingNavigationProps {
  canGoBack: boolean
  canProceed: boolean
  isLast: boolean
  skippable: boolean
  busy: boolean
  /** Motivo por el que no se puede continuar (se muestra junto al botón) */
  blockedReason?: string
  onBack: () => void
  onNext: () => void
  onSkip: () => void
}

export function OnboardingNavigation({ canGoBack, canProceed, isLast, skippable, busy, blockedReason, onBack, onNext, onSkip }: OnboardingNavigationProps) {
  return (
    <div className="mt-8 flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <button
          type="button"
          onClick={onBack}
          disabled={!canGoBack || busy}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-40"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Anterior
        </button>
      </div>
      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
        {blockedReason && !canProceed && (
          <p className="text-xs text-amber-700 sm:mr-2" aria-live="polite">
            {blockedReason}
          </p>
        )}
        {skippable && !isLast && (
          <button
            type="button"
            onClick={onSkip}
            disabled={busy}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          >
            <SkipForward className="h-4 w-4" aria-hidden="true" /> Omitir por ahora
          </button>
        )}
        {!isLast && (
          <button type="button" onClick={onNext} disabled={!canProceed || busy} className="btn-primary !py-2.5 text-sm">
            {busy ? 'Guardando…' : 'Guardar y continuar'} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  )
}
