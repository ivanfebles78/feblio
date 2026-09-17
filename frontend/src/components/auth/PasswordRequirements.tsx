import { Check, Circle } from 'lucide-react'
import { passwordRequirements } from '../../lib/validation'

/** Lista de requisitos de contraseña con estado (no solo por color). */
export function PasswordRequirements({ password, id }: { password: string; id: string }) {
  const reqs = passwordRequirements(password)
  return (
    <ul id={id} className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs" aria-label="Requisitos de la contraseña">
      {reqs.map((r) => (
        <li key={r.key} className={`flex items-center gap-1.5 ${r.met ? 'text-emerald-600' : 'text-slate-500'}`}>
          {r.met ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Circle className="h-3 w-3" aria-hidden="true" />}
          <span>
            {r.label}
            <span className="sr-only">{r.met ? ' (cumplido)' : ' (pendiente)'}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}
