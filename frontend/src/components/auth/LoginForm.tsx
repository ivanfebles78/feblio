import { useState, type FormEvent } from 'react'
import { ArrowRight, Eye, EyeOff, UserRound } from 'lucide-react'
import { TextField } from '../forms/Field'
import { validateEmail } from '../../lib/validation'
import type { DemoAccount } from '../../lib/env'

interface LoginFormProps {
  busy: boolean
  initialEmail?: string
  /** Cuenta demo elegida: se muestra solo su etiqueta, nunca el email */
  demoAccount?: DemoAccount | null
  onClearDemo?: () => void
  onSubmit: (email: string, password: string) => Promise<void>
}

export function LoginForm({ busy, initialEmail = '', demoAccount = null, onClearDemo, onSubmit }: LoginFormProps) {
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const errs: { email?: string; password?: string } = {}
    const effectiveEmail = demoAccount ? demoAccount.email : email
    const em = validateEmail(effectiveEmail)
    if (!em.ok) errs.email = em.message
    if (!password) errs.password = 'Introduce tu contraseña.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    await onSubmit(effectiveEmail.trim(), password)
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-3" aria-label="Formulario de inicio de sesión">
      {demoAccount ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3.5 py-2.5 text-sm" role="status">
          <span className="flex items-center gap-2 text-brand-800">
            <UserRound className="h-4 w-4" aria-hidden="true" /> Cuenta de demostración: <strong>{demoAccount.label}</strong>
          </span>
          <button type="button" onClick={onClearDemo} className="text-xs font-medium text-brand-700 underline">
            Usar otro email
          </button>
        </div>
      ) : (
        <TextField
          label="Correo electrónico"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
        />
      )}
      <TextField
        label="Contraseña"
        name="password"
        type={showPass ? 'text' : 'password'}
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.password}
        trailing={
          <button
            type="button"
            onClick={() => setShowPass((v) => !v)}
            className="rounded-md p-1 text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            aria-pressed={showPass}
          >
            {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        }
      />
      <button type="submit" className="btn-primary w-full" disabled={busy}>
        {busy ? (
          'Un momento…'
        ) : (
          <>
            Iniciar sesión <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </>
        )}
      </button>
    </form>
  )
}
