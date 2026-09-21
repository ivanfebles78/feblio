import { CircleCheck, Circle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { PASSWORD_MIN_LENGTH, passwordRequirements } from '../../lib/validation'

/**
 * Etiquetas visuales compactas por clave de requisito. Las reglas y los mensajes de validación
 * siguen usando las etiquetas completas de `passwordRequirements` (lib/validation).
 */
const COMPACT_KEY: Record<string, string> = {
  length: 'auth.passwordRequirements.compactLength',
  upper: 'auth.passwordRequirements.compactUpper',
  lower: 'auth.passwordRequirements.compactLower',
  digit: 'auth.passwordRequirements.compactDigit',
}

/** Lista de requisitos de contraseña con estado (no solo por color). */
export function PasswordRequirements({ password, id }: { password: string; id: string }) {
  const { t } = useTranslation()
  const reqs = passwordRequirements(password)

  return (
    <ul
      id={id}
      className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 text-sm"
      aria-label={t('auth.passwordRequirements.label')}
    >
      {reqs.map((r) => (
        <li
          key={r.key}
          className={`flex shrink-0 items-center gap-1.5 ${
            r.met ? 'text-emerald-600' : 'text-slate-500'
          }`}
        >
          {r.met ? (
            <CircleCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <Circle className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}

          <span className="whitespace-nowrap leading-5">
            {COMPACT_KEY[r.key] ? t(COMPACT_KEY[r.key], { min: PASSWORD_MIN_LENGTH }) : r.label}
            <span className="sr-only">
              {r.met ? t('auth.passwordRequirements.met') : t('auth.passwordRequirements.pending')}
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}
