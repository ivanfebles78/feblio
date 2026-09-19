import { useEffect, useId, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { AuthCardLayout } from '../components/auth/AuthCardLayout'
import { PasswordRequirements } from '../components/auth/PasswordRequirements'
import { TextField } from '../components/forms/Field'
import { Button, ButtonLink } from '../components/v2/Button'
import { useAuth } from '../context/AuthContext'
import { FORGOT_PASSWORD_PATH } from '../lib/routing'
import { initialAuthParams } from '../lib/supabase'
import { describeAuthLinkError } from '../lib/authUrl'
import { validatePassword, validatePasswordConfirmation } from '../lib/validation'

/** Tiempo máximo de espera a que supabase-js procese el enlace antes de darlo por inválido. */
const LINK_WAIT_MS = 4000

/**
 * /restablecer-contrasena · Destino del enlace de recuperación de Supabase.
 * Estados: enlace caducado/inválido → mensaje y enlace para pedir otro; esperando sesión de
 * recuperación → carga; sesión válida → formulario con los mismos requisitos del registro;
 * éxito → cierre de sesión y vuelta al login con aviso.
 */
export default function ResetPasswordPage() {
  const { session, passwordRecovery, loading, updatePassword, signOut } = useAuth()
  const navigate = useNavigate()
  const linkError = describeAuthLinkError(initialAuthParams)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  const pwReqId = useId()

  const ready = !!session && (passwordRecovery || initialAuthParams.type === 'recovery')

  useEffect(() => {
    if (ready || linkError) return
    const t = window.setTimeout(() => setTimedOut(true), LINK_WAIT_MS)
    return () => window.clearTimeout(t)
  }, [ready, linkError])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    const errs: { password?: string; confirm?: string } = {}
    const pw = validatePassword(password)
    if (!pw.ok) errs.password = pw.message
    const cf = validatePasswordConfirmation(password, confirm)
    if (!cf.ok) errs.confirm = cf.message
    setErrors(errs)
    if (errs.password || errs.confirm) return
    setBusy(true)
    setError(null)
    try {
      const { error } = await updatePassword(password)
      if (error) {
        setError(/same password|different from the old/i.test(error) ? 'La contraseña nueva debe ser distinta de la anterior.' : /weak|short|pwned/i.test(error) ? 'La contraseña no cumple los requisitos de seguridad.' : 'No se pudo actualizar la contraseña. Solicita un enlace nuevo e inténtalo otra vez.')
        return
      }
      await signOut()
      navigate('/?reset=ok', { replace: true })
    } finally {
      setBusy(false)
    }
  }

  if (linkError || (!ready && (timedOut || (!loading && !session)))) {
    return (
      <AuthCardLayout title="Enlace no válido">
        <p className="text-base text-slate-700" role="alert">
          {linkError ?? 'Este enlace de recuperación no es válido o ha caducado. Solicita uno nuevo para continuar.'}
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <ButtonLink to={FORGOT_PASSWORD_PATH} block trailing={<ArrowRight className="h-4 w-4" aria-hidden="true" />}>
            Solicitar un enlace nuevo
          </ButtonLink>
          <ButtonLink to="/" variant="secondary" block>
            Volver a iniciar sesión
          </ButtonLink>
        </div>
      </AuthCardLayout>
    )
  }

  if (!ready) {
    return (
      <AuthCardLayout title="Validando el enlace…">
        <p className="text-base text-slate-600" role="status" aria-live="polite">
          Un momento, estamos comprobando el enlace de recuperación.
        </p>
      </AuthCardLayout>
    )
  }

  return (
    <AuthCardLayout title="Crea una contraseña nueva" description={<>Cuenta: <span className="font-medium text-slate-900">{session?.user.email}</span></>}>
      <form onSubmit={handleSubmit} noValidate className="space-y-5" aria-label="Formulario de nueva contraseña" aria-busy={busy}>
        <div>
          <TextField
            label="Contraseña nueva"
            name="password"
            type={showPass ? 'text' : 'password'}
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              if (errors.password) setErrors((x) => ({ ...x, password: undefined }))
            }}
            error={errors.password}
            aria-describedby={pwReqId}
            trailing={
              <button type="button" onClick={() => setShowPass((v) => !v)} className="rounded-md p-1 text-slate-500 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={showPass}>
                {showPass ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
              </button>
            }
          />
          <PasswordRequirements password={password} id={pwReqId} />
        </div>
        <TextField
          label="Confirmar contraseña nueva"
          name="confirmPassword"
          type={showPass ? 'text' : 'password'}
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value)
            if (errors.confirm) setErrors((x) => ({ ...x, confirm: undefined }))
          }}
          error={errors.confirm}
        />
        <div aria-live="assertive">
          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
              {error}
            </p>
          )}
        </div>
        <Button type="submit" size="lg" block disabled={busy} leading={!busy ? <ShieldCheck className="h-4 w-4" aria-hidden="true" /> : undefined}>
          {busy ? 'Guardando…' : 'Guardar contraseña'}
        </Button>
      </form>
    </AuthCardLayout>
  )
}
