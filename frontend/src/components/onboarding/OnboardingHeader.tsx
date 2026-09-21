import { LogOut, Save } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Logo } from '../Logo'
import { LanguageSwitcher } from '../LanguageSwitcher'
import { AutoSaveStatus } from './AutoSaveStatus'
import type { SaveState } from '../../lib/onboarding/types'

interface OnboardingHeaderProps {
  companyName: string
  saveState: SaveState
  saveError: string | null
  lastSavedAt: Date | null
  dirty: boolean
  onRetry: () => void
  onSaveAndExit: () => void
  onSignOut: () => void
}

/**
 * Cabecera del asistente. El selector de idioma ES | EN cambia solo la interfaz del usuario
 * (nunca el idioma predeterminado de la empresa). En móvil baja a la fila secundaria junto al
 * estado de autoguardado para no provocar scroll horizontal a 390 px.
 */
export function OnboardingHeader({ companyName, saveState, saveError, lastSavedAt, dirty, onRetry, onSaveAndExit, onSignOut }: OnboardingHeaderProps) {
  const { t } = useTranslation()
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Logo size={28} />
          <span className="hidden text-slate-300 sm:inline" aria-hidden="true">
            /
          </span>
          <span className="hidden truncate text-sm font-medium text-slate-600 sm:inline">{t('onboarding.header.title', { company: companyName })}</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden sm:block">
            <AutoSaveStatus state={saveState} error={saveError} lastSavedAt={lastSavedAt} dirty={dirty} onRetry={onRetry} />
          </div>
          <div className="hidden sm:block">
            <LanguageSwitcher />
          </div>
          <button
            type="button"
            onClick={onSaveAndExit}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          >
            <Save className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">{t('onboarding.header.saveAndExit')}</span>
            <span className="sm:hidden">{t('onboarding.header.backToPanel')}</span>
          </button>
          <button
            type="button"
            onClick={onSignOut}
            className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            aria-label={t('common.actions.signOut')}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 px-4 pb-2 sm:hidden">
        <AutoSaveStatus state={saveState} error={saveError} lastSavedAt={lastSavedAt} dirty={dirty} onRetry={onRetry} />
        <LanguageSwitcher />
      </div>
    </header>
  )
}
