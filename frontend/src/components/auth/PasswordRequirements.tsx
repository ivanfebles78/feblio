import { CircleCheck, Circle } from 'lucide-react'
import { PASSWORD_MIN_LENGTH, passwordRequirements } from '../../lib/validation'

/**
 * Etiquetas visuales compactas. Las reglas y los mensajes de validación siguen usando las
 * etiquetas completas de `passwordRequirements` (lib/validation).
 */
const COMPACT_LABEL: Record<string, string> = {
  length: `${PASSWORD_MIN_LENGTH} caracteres mínimo`,
  upper: '1 mayúscula',
  lower: '1 minúscula',
  digit: '1 número',
}

/** Lista de requisitos de contraseña con estado (no solo por color). */
export function PasswordRequirements({ password, id }: { password: string; id: string }) {
  const reqs = passwordRequirements(password)

  return (
    <ul
      id={id}
      className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 text-sm"
      aria-label="Requisitos de la contraseña"
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
            {COMPACT_LABEL[r.key] ?? r.label}
            <span className="sr-only">
              {r.met ? ' (cumplido)' : ' (pendiente)'}
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}
