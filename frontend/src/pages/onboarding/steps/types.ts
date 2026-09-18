import type { FieldErrors } from '../../../lib/onboarding/validation'

export interface StepProps {
  /** 'wizard' dentro del asistente · 'settings' desde Configuración */
  mode: 'wizard' | 'settings'
  /** Errores calculados por el registro del paso */
  errors: FieldErrors
  /** Mostrar todos los errores (tras intentar continuar) */
  showErrors: boolean
}

export const STEP_HELP_CLS = 'rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500'
