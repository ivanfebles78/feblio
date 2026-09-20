import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FolderKanban, LockKeyhole, MailCheck, MessagesSquare, ReceiptText, ShieldCheck } from 'lucide-react'
import { Logo } from '../components/Logo'
import { RegisterForm } from '../components/auth/RegisterForm'
import { ButtonLink } from '../components/v2/Button'
import { useAuth, type SignUpParams } from '../context/AuthContext'
import { homePathForRole } from '../lib/routing'

const BENEFITS = [
  { icon: FolderKanban, title: 'Proyectos y documentos en orden', text: 'Cada proyecto con sus carpetas, presupuestos y facturas en un solo sitio.' },
  { icon: MessagesSquare, title: 'Clientes atendidos sin perder nada', text: 'Correo, WhatsApp y formularios se convierten en solicitudes con seguimiento.' },
  { icon: ReceiptText, title: 'Cobros y facturación sin sorpresas', text: 'Series, anticipos e impuestos configurados una vez y aplicados siempre.' },
]

/**
 * Registro público de empresa (/registro). Dos columnas en escritorio, una en móvil.
 * Crea usuario + empresa (rol empresa, fijado en servidor) y pide confirmar el correo.
 * Los mensajes son neutros: no revelan si un correo ya estaba registrado.
 */
export default function RegisterPage() {
  const { session, profile, signUp } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  useEffect(() => {
    if (session && profile) navigate(homePathForRole(profile.role), { replace: true })
  }, [session, profile, navigate])

  async function handleRegister(params: SignUpParams) {
    setError(null)
    setBusy(true)
    try {
      const { error, needsConfirmation } = await signUp(params)
      if (error) {
        setError(traducirRegistro(error))
        return
      }
      if (needsConfirmation) setSentTo(params.email.trim().toLowerCase())
      // Sin confirmación requerida: AuthProvider carga el perfil y el efecto superior redirige.
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <aside className="relative overflow-hidden bg-slate-900 px-6 py-8 text-white sm:px-10 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:justify-between lg:px-14 lg:py-12">
        <div className="pointer-events-none absolute inset-0 opacity-[.07]" aria-hidden="true" style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
        <div className="relative">
          <Link to="/" className="inline-flex rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70" aria-label="Feblio, ir al inicio">
            <Logo tone="white" size={30} />
          </Link>
          <h1 className="mt-8 max-w-md text-2xl font-semibold leading-tight tracking-tight sm:text-3xl lg:mt-14 lg:text-[2rem]">
            Gestiona tus proyectos, clientes y documentos desde un solo lugar
          </h1>
          <p className="mt-3 max-w-md text-base leading-relaxed text-slate-300">Crea tu empresa en dos minutos. Configura el resto cuando quieras desde Feblio</p>
          <ul className="mt-8 hidden space-y-5 lg:block" aria-label="Ventajas de Feblio">
            {BENEFITS.map((b) => (
              <li key={b.title} className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 text-brand-200 ring-1 ring-white/15" aria-hidden="true">
                  <b.icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-medium text-white">{b.title}</p>
                  <p className="mt-0.5 text-sm text-slate-300">{b.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="relative mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-300 lg:mt-0">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-emerald-300" aria-hidden="true" /> Datos alojados en la UE · RGPD
          </span>
          <span className="inline-flex items-center gap-1.5">
            <LockKeyhole className="h-4 w-4 text-emerald-300" aria-hidden="true" /> Cifrado en tránsito y en reposo
          </span>
        </div>
      </aside>

      <main className="flex items-start justify-center px-4 py-8 sm:px-8 lg:py-10">
        <div className="w-full max-w-xl lg:max-w-3xl">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,.04)] sm:p-8">
            {sentTo ? (
              <div role="status" aria-live="polite">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" aria-hidden="true">
                  <MailCheck className="h-6 w-6" />
                </span>
                <h2 className="mt-4 text-xl font-semibold tracking-tight">Revisa tu correo</h2>
                <p className="mt-2 text-base text-slate-700">
                  Si <span className="font-medium text-slate-900">{sentTo}</span> es válido, recibirás un enlace para confirmarlo. Ábrelo y después inicia sesión para entrar en tu empresa.
                </p>
                <p className="mt-2 text-sm text-slate-600">¿No llega? Revisa la carpeta de spam o inténtalo de nuevo en unos minutos.</p>
                <div className="mt-6">
                  <ButtonLink to="/" variant="secondary" block>
                    Ir a iniciar sesión
                  </ButtonLink>
                </div>
              </div>
            ) : (
              <>
                <h2 className="text-xl font-semibold tracking-tight">Crea tu empresa en Feblio</h2>
                <p className="mt-1 text-base text-slate-600">Solo los datos imprescindibles. Sin tarjeta, 14 días de prueba.</p>
                <div className="mt-6">
                  <RegisterForm busy={busy} onSubmit={handleRegister} />
                </div>
                <div aria-live="assertive" className="mt-3">
                  {error && (
                    <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                      {error}
                    </p>
                  )}
                </div>
                <p className="mt-5 text-center text-sm text-slate-600">
                  ¿Ya tienes cuenta?{' '}
                  <Link to="/" className="font-semibold text-brand-700 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                    Inicia sesión
                  </Link>
                </p>
              </>
            )}
          </div>
          <p className="mt-4 text-center text-sm text-slate-500">Al crear la empresa no configurarás nada más: canales, documentos, automatizaciones y facturación se ajustan después, a tu ritmo.</p>
        </div>
      </main>
    </div>
  )
}

/** Mensajes seguros: no confirman si un correo existe ni detallan la política interna. */
function traducirRegistro(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('rate limit') || m.includes('too many')) return 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.'
  if (m.includes('password')) return 'La contraseña no cumple los requisitos. Revísala e inténtalo de nuevo.'
  if (m.includes('is invalid') || m.includes('invalid email') || m.includes('email_address_invalid')) return 'Revisa el correo electrónico: el formato o el dominio no son válidos.'
  if (m.includes('already registered') || m.includes('already exists')) {
    return 'No hemos podido completar el registro con ese correo. Si ya tienes cuenta, inicia sesión; si no, revisa el correo e inténtalo de nuevo.'
  }
  return 'No hemos podido crear la empresa en este momento. Inténtalo de nuevo en unos minutos.'
}
