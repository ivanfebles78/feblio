import { User } from 'lucide-react'
import { demoAccounts, isDemoMode, type DemoAccount } from '../../lib/env'

interface DemoAccessProps {
  onPick: (account: DemoAccount) => void
}

/**
 * Accesos rápidos de demostración.
 *
 * - Solo se renderiza con VITE_DEMO_MODE=true (oculto por defecto y en producción).
 * - Las cuentas vienen de VITE_DEMO_ACCOUNTS (entorno), nunca del código.
 * - Se muestran solo las etiquetas (Admin, Empresa, Cliente); el email no se imprime.
 * - No hay contraseñas ni login automático: la persona escribe la contraseña.
 * Decisión documentada en docs/onboarding.md → "Modo demo".
 */
export function DemoAccess({ onPick }: DemoAccessProps) {
  if (!isDemoMode()) return null
  const accounts = demoAccounts()
  if (accounts.length === 0) return null

  return (
    <div className="mt-6 border-t border-slate-100 pt-5" data-testid="demo-access">
      <p className="mb-2.5 flex items-center justify-center gap-1.5 text-center text-xs font-medium uppercase tracking-wide text-slate-400">
        <User className="h-3.5 w-3.5" aria-hidden="true" /> Cuentas de demostración
      </p>
      <div className="grid grid-cols-3 gap-2">
        {accounts.map((d) => (
          <button
            key={d.label}
            type="button"
            onClick={() => onPick(d)}
            className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-brand-300 hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          >
            {d.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-center text-[11px] text-slate-400">
        Elige una cuenta y escribe la contraseña que te haya facilitado el administrador.
      </p>
    </div>
  )
}
