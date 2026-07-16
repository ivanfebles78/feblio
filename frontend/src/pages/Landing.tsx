import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  Building2,
  Fingerprint,
  User,
} from 'lucide-react'
import { Logo } from '../components/Logo'
import { HeroScene } from '../components/HeroScene'
import { useAuth } from '../context/AuthContext'

const DEMO = [
  { label: 'Admin', email: 'ivan@feblio.app', tone: 'bg-gradient-to-br from-slate-700 to-slate-900' },
  { label: 'Empresa', email: 'ralm@feblio.app', tone: 'bg-gradient-to-br from-brand-600 to-indigo-700' },
  { label: 'Cliente', email: 'casachona@feblio.app', tone: 'bg-gradient-to-br from-teal-600 to-emerald-700' },
]
const DEMO_PASSWORD = 'Feblio2026!'

export default function Landing() {
  const { session, profile, signIn, signUp } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<'login' | 'register'>('login')

  const [name, setName] = useState('')
  const [taxId, setTaxId] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (session && profile) navigate(`/${profile.role}`, { replace: true })
  }, [session, profile, navigate])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setBusy(true)
    if (tab === 'login') {
      const { error } = await signIn(email.trim(), password)
      if (error) setError(traducir(error))
    } else {
      const { error, needsConfirmation } = await signUp({
        email: email.trim(),
        password,
        fullName: name.trim(),
        role: 'empresa',
        companyName: name.trim(),
        taxId: taxId.trim(),
      })
      if (error) setError(traducir(error))
      else if (needsConfirmation) {
        setNotice(
          'Cuenta creada. Te hemos enviado un email de confirmación; ábrelo para activar tu cuenta.',
        )
        setTab('login')
      } else {
        setNotice('Cuenta creada. Entrando…')
        // La sesión activa redirige automáticamente al dashboard.
      }
    }
    setBusy(false)
  }

  async function quickLogin(demoEmail: string) {
    setError(null)
    setBusy(true)
    const { error } = await signIn(demoEmail, DEMO_PASSWORD)
    if (error) setError(traducir(error))
    setBusy(false)
  }

  return (
    <div className="min-h-screen bg-white lg:grid lg:grid-cols-[1.65fr_1fr]">
      {/* Imagen protagonista */}
      <HeroScene />

      {/* Panel de acceso compacto */}
      <section className="relative flex items-center justify-center bg-gradient-to-b from-white via-white to-brand-50/60 px-6 py-12 sm:px-10">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-500 via-fuchsia-500 to-cyan-400 lg:hidden" />
        <div className="w-full max-w-sm">
          <div className="mb-7 text-center lg:hidden">
            <Logo size={34} />
          </div>

          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-100">
            {tab === 'login' ? '👋 Te estábamos esperando' : '🚀 Únete a Feblio'}
          </span>
          <h2 className="mt-3 text-2xl font-bold text-slate-900">
            {tab === 'login' ? 'Bienvenido de nuevo' : 'Crea tu cuenta'}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {tab === 'login'
              ? 'Inicia sesión para acceder a tus proyectos.'
              : 'Empieza a gestionar tus proyectos en minutos.'}
          </p>

          {/* Tabs */}
          <div className="mb-6 mt-6 flex gap-6 border-b border-slate-200">
            {(['login', 'register'] as const).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTab(t)
                  setError(null)
                  setNotice(null)
                }}
                className={`-mb-px border-b-2 pb-3 text-sm font-semibold transition ${
                  tab === t
                    ? 'border-brand-600 text-brand-700'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                {t === 'login' ? 'Iniciar sesión' : 'Registrarse'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {tab === 'register' && (
              <>
                <label className="field">
                  <Building2 className="h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Nombre o razón social"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </label>
                <label className="field">
                  <Fingerprint className="h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="CIF / NIF"
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value)}
                    required
                  />
                </label>
              </>
            )}

            <label className="field">
              <Mail className="h-4 w-4 text-slate-400" />
              <input
                type="email"
                placeholder="Usuario o email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>

            <label className="field">
              <Lock className="h-4 w-4 text-slate-400" />
              <input
                type={showPass ? 'text' : 'password'}
                placeholder="Contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="text-slate-400 hover:text-slate-600"
                aria-label="Mostrar contraseña"
              >
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </label>

            {tab === 'login' && (
              <div className="flex justify-end">
                <button
                  type="button"
                  className="text-sm font-medium text-brand-600 hover:underline"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
            )}

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                {error}
              </p>
            )}
            {notice && (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-600">
                {notice}
              </p>
            )}

            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? (
                'Un momento…'
              ) : (
                <>
                  {tab === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          {/* Acceso rápido demo */}
          <div className="mt-6 border-t border-slate-100 pt-5">
            <p className="mb-2.5 flex items-center justify-center gap-1.5 text-center text-xs font-medium uppercase tracking-wide text-slate-400">
              <User className="h-3.5 w-3.5" /> Acceso rápido de prueba
            </p>
            <div className="grid grid-cols-3 gap-2">
              {DEMO.map((d) => (
                <button
                  key={d.email}
                  onClick={() => quickLogin(d.email)}
                  disabled={busy}
                  className={`rounded-xl px-2 py-2 text-xs font-semibold text-white shadow-sm transition hover:brightness-110 active:scale-[.98] disabled:opacity-60 ${d.tone}`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <p className="mt-8 text-center text-xs text-slate-400">
            © {new Date().getFullYear()} Feblio
          </p>
        </div>
      </section>
    </div>
  )
}

function traducir(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('invalid login')) return 'Email o contraseña incorrectos.'
  if (m.includes('already registered')) return 'Ese email ya está registrado.'
  if (m.includes('password')) return 'La contraseña debe tener al menos 6 caracteres.'
  return msg
}
