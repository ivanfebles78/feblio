import { AlertCircle, Check, Loader2 } from 'lucide-react'
import type { SaveState } from '../../lib/onboarding/types'

interface AutoSaveStatusProps {
  state: SaveState
  error?: string | null
  lastSavedAt?: Date | null
  dirty?: boolean
  onRetry?: () => void
}

/** Indicador Guardando… / Guardado / Error, anunciado por aria-live. */
export function AutoSaveStatus({ state, error, lastSavedAt, dirty, onRetry }: AutoSaveStatusProps) {
  let content: React.ReactNode = null
  if (state === 'saving') {
    content = (
      <span className="inline-flex items-center gap-1.5 text-slate-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Guardando…
      </span>
    )
  } else if (state === 'error') {
    content = (
      <span className="inline-flex items-center gap-1.5 text-red-700">
        <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
        {error ?? 'No se pudo guardar.'}
        {onRetry && (
          <button type="button" onClick={onRetry} className="ml-1 font-semibold underline">
            Reintentar
          </button>
        )}
      </span>
    )
  } else if (dirty) {
    content = <span className="text-slate-400">Cambios sin guardar</span>
  } else if (state === 'saved' && lastSavedAt) {
    content = (
      <span className="inline-flex items-center gap-1.5 text-emerald-700">
        <Check className="h-3.5 w-3.5" aria-hidden="true" /> Guardado{' '}
        <time dateTime={lastSavedAt.toISOString()}>{lastSavedAt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</time>
      </span>
    )
  }
  return (
    <div className="min-h-[1.25rem] text-xs" aria-live="polite" aria-atomic="true">
      {content}
    </div>
  )
}
