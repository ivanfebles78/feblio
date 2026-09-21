import { AlertCircle, Check, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatTime } from '../../lib/intl'
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
  const { t } = useTranslation()
  let content: React.ReactNode = null
  if (state === 'saving') {
    content = (
      <span className="inline-flex items-center gap-1.5 text-slate-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> {t('onboarding.autosave.saving')}
      </span>
    )
  } else if (state === 'error') {
    content = (
      <span className="inline-flex items-center gap-1.5 text-red-700">
        <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
        {error ?? t('onboarding.autosave.saveFailed')}
        {onRetry && (
          <button type="button" onClick={onRetry} className="ml-1 font-semibold underline">
            {t('common.actions.retry')}
          </button>
        )}
      </span>
    )
  } else if (dirty) {
    content = <span className="text-slate-400">{t('onboarding.autosave.unsaved')}</span>
  } else if (state === 'saved' && lastSavedAt) {
    content = (
      <span className="inline-flex items-center gap-1.5 text-emerald-700">
        <Check className="h-3.5 w-3.5" aria-hidden="true" /> {t('onboarding.autosave.saved')}{' '}
        <time dateTime={lastSavedAt.toISOString()}>{formatTime(lastSavedAt)}</time>
      </span>
    )
  }
  return (
    <div className="min-h-[1.25rem] text-xs" aria-live="polite" aria-atomic="true">
      {content}
    </div>
  )
}
