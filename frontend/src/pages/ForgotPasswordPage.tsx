import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, MailCheck } from 'lucide-react'
import { AuthCardLayout } from '../components/auth/AuthCardLayout'
import { TextField } from '../components/forms/Field'
import { Button, ButtonLink } from '../components/v2/Button'
import { useAuth } from '../context/AuthContext'
import { validateEmail } from '../lib/validation'

/**
 * /recuperar-contrasena · Solicita el correo de recuperación.
 * La respuesta es siempre neutra: nunca revela si el correo tiene cuenta. Solo se muestran
 * errores de envío que no dependen de la existencia del usuario (límite de intentos, red).
 */
export default function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth()
  const [email, setEmail] = useState('')
  const [fieldError, setFieldError] = useState<string | undefined>()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    const v = validateEmail(email)
    if (!v.ok) {
      setFieldError(v.message)
      return
    }
    setFieldError(undefined)
    setError(null)
    setBusy(true)
    try {
      const { error } = await requestPasswordReset(email)
      if (error && /rate limit|too many/i.test(error)) {
        setError('Demasiados intentos. Espera unos minutos y vuelve a intentarlo.')
        return
      }
      if (error && /network|fetch|failed to/i.test(error)) {
        setError('No se pudo conectar. Comprueba tu conexión e inténtalo de nuevo.')
        return
      }
      // Cualquier otro resultado (incluido "usuario no encontrado") se trata igual: respuesta neutra.
      setSentTo(email.trim().toLowerCase())
    } finally {
      setBusy(false)
    }
  }

  if (sentTo) {
    return (
      <AuthCardLayout title="Revisa tu correo">
        <div role="status" aria-live="polite">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" aria-hidden="true">
            <MailCheck className="h-6 w-6" />
          </span>
          <p className="mt-4 text-base text-slate-700">
            Si <span className="font-medium text-slate-900">{sentTo}</span> tiene una cuenta en Feblio, recibirás en unos minutos un enlace para crear una contraseña nueva.
          </p>
          <p className="mt-2 text-sm text-slate-600">El enlace caduca pasado un tiempo. Si no llega, revisa la carpeta de spam o vuelve a solicitarlo.</p>
          <div className="mt-6 flex flex-col gap-2">
            <ButtonLink to="/" variant="secondary" block>
              Volver a iniciar sesión
            </ButtonLink>
            <Button variant="ghost" block onClick={() => setSentTo(null)}>
              Usar otro correo
            </Button>
          </div>
        </div>
      </AuthCardLayout>
    )
  }

  return (
    <AuthCardLayout title="Recuperar contraseña" description="Escribe el correo con el que accedes a Feblio y te enviaremos un enlace para crear una contraseña nueva.">
      <form onSubmit={handleSubmit} noValidate className="space-y-5" aria-label="Formulario de recuperación de contraseña" aria-busy={busy}>
        <TextField
          label="Correo electrónico"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            if (fieldError) setFieldError(undefined)
          }}
          error={fieldError}
        />
        <div aria-live="assertive">
          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
              {error}
            </p>
          )}
        </div>
        <Button type="submit" size="lg" block disabled={busy} trailing={!busy ? <ArrowRight className="h-4 w-4" aria-hidden="true" /> : undefined}>
          {busy ? 'Enviando…' : 'Enviar enlace'}
        </Button>
        <p className="text-center text-sm text-slate-600">
          <Link to="/" className="font-semibold text-brand-700 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
            Volver a iniciar sesión
          </Link>
        </p>
      </form>
    </AuthCardLayout>
  )
}
