import { LogOut, Save } from 'lucide-react'
import { Logo } from '../Logo'
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

export function OnboardingHeader({ companyName, saveState, saveError, lastSavedAt, dirty, onRetry, onSaveAndExit, onSignOut }: OnboardingHeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Logo size={28} />
          <span className="hidden text-slate-300 sm:inline" aria-hidden="true">
            /
          </span>
          <span className="hidden truncate text-sm font-medium text-slate-600 sm:inline">Configuración inicial · {companyName}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:block">
            <AutoSaveStatus state={saveState} error={saveError} lastSavedAt={lastSavedAt} dirty={dirty} onRetry={onRetry} />
          </div>
          <button
            type="button"
            onClick={onSaveAndExit}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          >
            <Save className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Guardar y volver al panel</span>
            <span className="sm:hidden">Volver al panel</span>
          </button>
          <button
            type="button"
            onClick={onSignOut}
            className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            aria-label="Cerrar sesión"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="px-4 pb-2 sm:hidden">
        <AutoSaveStatus state={saveState} error={saveError} lastSavedAt={lastSavedAt} dirty={dirty} onRetry={onRetry} />
      </div>
    </header>
  )
}
