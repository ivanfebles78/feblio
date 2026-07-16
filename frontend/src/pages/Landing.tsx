import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { useAuth } from '../context/AuthContext'
import type { UserRole } from '../lib/types'

const FEATURES = [
  {
    icon: '📁',
    title: 'Proyectos',
    text: 'Organiza y controla cada fase de tus proyectos en tiempo real.',
    tone: 'bg-brand-600',
  },
  {
    icon: '👥',
    title: 'Clientes',
    text: 'Gestiona tu cartera de clientes y toda la información centralizada.',
    tone: 'bg-emerald-500',
  },
  {
    icon: '📊',
    title: 'Presupuestos y facturas',
    text: 'Crea, envía y controla presupuestos, facturas y pagos pendientes.',
    tone: 'bg-amber-500',
  },
  {
    icon: '🗂️',
    title: 'Documentos',
    text: 'Almacena, comparte y descarga todos los documentos de tus proyectos.',
    tone: 'bg-violet-500',
  },
  {
    icon: '📈',
    title: 'Informes y estadísticas',
    text: 'Toma mejores decisiones con datos actualizados y visuales intuitivas.',
    tone: 'bg-teal-500',
  },
]

const DEMO = [
  { label: 'Admin (Ivan)', email: 'ivan@feblio.app', tone: 'slate' },
  { label: 'Empresa (Ralm)', email: 'ralm@feblio.app', tone: 'brand' },
  { label: 'Cliente (Casa Chona)', email: 'casachona@feblio.app', tone: 'teal' },
]
const DEMO_PASSWORD = 'Feblio2026!'

export default function Landing() {
  const { session, profile, signIn, signUp } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<'login' | 'register'>('login')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<UserRole>('empresa')
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
      const { error } = await signUp(email.trim(), password, fullName.trim(), role)
      if (error) setError(traducir(error))
      else {
        setNotice('Cuenta creada. Ya puedes iniciar sesión.')
        setTab('login')
      }
    }
    setBusy(false)
  }

  async function quickLogin(demoEmail: string) {
    setError(null)
    setBusy(true)
    setEmail(demoEmail)
    setPassword(DEMO_PASSWORD)
    const { error } = await signIn(demoEmail, DEMO_PASSWORD)
    if (error) setError(traducir(error))
    setBusy(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-100">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:py-16">
        {/* ---------- Hero / features ---------- */}
        <section>
          <Logo size={40} />
          <h1 className="mt-8 text-4xl font-extrabold leading-[1.05] tracking-tight text-slate-900 sm:text-5xl">
            Gestiona tus proyectos
            <br />
            <span className="text-brand-600">de principio a fin</span>
          </h1>
          <p className="mt-5 max-w-md text-lg text-slate-500">
            Control total de tus proyectos, presupuestos, facturas, provisiones de
            fondos y clientes. Todo en un solo lugar.
          </p>

          <ul className="mt-9 space-y-5">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex gap-4">
                <span
                  className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${f.tone} text-lg text-white shadow-float`}
                >
                  {f.icon}
                </span>
                <div>
                  <p className="font-semibold text-slate-800">{f.title}</p>
                  <p className="text-sm text-slate-500">{f.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* ---------- Auth card ---------- */}
        <section className="lg:pt-4">
          <div className="surface mx-auto w-full max-w-md p-7 shadow-float sm:p-8">
            <div className="mb-6 flex flex-col items-center text-center">
              <Logo withText={false} size={44} />
              <h2 className="mt-3 text-xl font-bold text-slate-900">
                Bienvenido a Feblio
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Inicia sesión para acceder a tu espacio de proyectos.
              </p>
            </div>

            {/* Tabs */}
            <div className="mb-6 flex gap-6 border-b border-slate-200">
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
                <label className="field">
                  <span className="text-slate-400">👤</span>
                  <input
                    type="text"
                    placeholder="Nombre completo"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                </label>
              )}

              <label className="field">
                <span className="text-slate-400">✉️</span>
                <input
                  type="email"
                  placeholder="Usuario o email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>

              <label className="field">
                <span className="text-slate-400">🔒</span>
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
                  {showPass ? '🙈' : '👁️'}
                </button>
              </label>

              {tab === 'register' && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {(['empresa', 'cliente'] as UserRole[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRole(r)}
                      className={`rounded-xl border px-3 py-2 text-sm font-medium capitalize transition ${
                        role === r
                          ? 'border-brand-500 bg-brand-50 text-brand-700'
                          : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
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
                {busy
                  ? 'Un momento…'
                  : tab === 'login'
                    ? 'Iniciar sesión'
                    : 'Crear cuenta'}
              </button>
            </form>

            {/* Quick demo access */}
            <div className="mt-6">
              <p className="mb-2 text-center text-xs font-medium uppercase tracking-wide text-slate-400">
                Acceso rápido de prueba
              </p>
              <div className="grid gap-2">
                {DEMO.map((d) => (
                  <button
                    key={d.email}
                    onClick={() => quickLogin(d.email)}
                    disabled={busy}
                    className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:border-brand-300 hover:bg-brand-50 disabled:opacity-60"
                  >
                    <span>{d.label}</span>
                    <span className="text-slate-400">→</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
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
