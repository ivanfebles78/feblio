import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ReceiptEuro,
  Users,
  Activity,
  FolderOpen,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  Building2,
  User,
  Sparkles,
  ShieldCheck,
  Fingerprint,
} from 'lucide-react'
import { Logo } from '../components/Logo'
import { HeroMockup } from '../components/HeroMockup'
import { useAuth } from '../context/AuthContext'

const FEATURES = [
  {
    icon: ReceiptEuro,
    title: 'Presupuestos y facturas',
    text: 'Crea y controla todos tus presupuestos, facturas y pagos.',
    tone: 'bg-brand-600',
  },
  {
    icon: Users,
    title: 'Clientes',
    text: 'Gestiona tu cartera de clientes y mantén toda la información organizada.',
    tone: 'bg-emerald-500',
  },
  {
    icon: Activity,
    title: 'Estado del proyecto',
    text: 'Haz seguimiento del progreso, plazos y tareas en tiempo real.',
    tone: 'bg-amber-500',
  },
  {
    icon: FolderOpen,
    title: 'Documentos',
    text: 'Comparte y almacena documentos. Tus clientes pueden descargarlos cuando los necesiten.',
    tone: 'bg-violet-500',
  },
]

const DEMO = [
  { label: 'Admin', email: 'ivan@feblio.app' },
  { label: 'Empresa', email: 'ralm@feblio.app' },
  { label: 'Cliente', email: 'casachona@feblio.app' },
]
const DEMO_PASSWORD = 'Feblio2026!'

type Tipo = 'empresa' | 'autonomo'

export default function Landing() {
  const { session, profile, signIn, signUp } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<'login' | 'register'>('login')

  const [tipo, setTipo] = useState<Tipo>('empresa')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [taxId, setTaxId] = useState('')
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
      const { error } = await signUp({
        email: email.trim(),
        password,
        fullName: fullName.trim(),
        role: 'empresa',
        companyName: tipo === 'empresa' ? companyName.trim() : fullName.trim(),
        taxType: tipo === 'empresa' ? 'CIF' : 'NIF',
        taxId: taxId.trim(),
      })
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
    const { error } = await signIn(demoEmail, DEMO_PASSWORD)
    if (error) setError(traducir(error))
    setBusy(false)
  }

  return (
    <div className="blueprint min-h-screen bg-gradient-to-b from-white via-brand-50/40 to-slate-100">
      {/* Nav */}
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 lg:px-8">
        <Logo size={36} />
        <a
          href="#acceso"
          className="rounded-xl border border-slate-200 bg-white/70 px-4 py-2 text-sm font-semibold text-slate-700 backdrop-blur transition hover:border-brand-300 hover:text-brand-700"
        >
          Iniciar sesión
        </a>
      </header>

      {/* Hero */}
      <section className="mx-auto grid max-w-7xl items-center gap-12 px-5 pb-8 pt-6 lg:grid-cols-2 lg:gap-8 lg:px-8 lg:pb-16">
        <div>
          <span className="reveal reveal-1 inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
            <Sparkles className="h-3.5 w-3.5" /> Tu estudio, bajo control
          </span>
          <h1 className="reveal reveal-1 mt-5 text-4xl font-extrabold leading-[1.03] tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
            Gestiona tus proyectos
            <br />
            <span className="bg-gradient-to-r from-brand-600 to-brand-500 bg-clip-text text-transparent">
              de principio a fin
            </span>
          </h1>
          <p className="reveal reveal-2 mt-5 max-w-md text-lg text-slate-500">
            Control total de tus proyectos, presupuestos, facturas, clientes y
            documentos. Todo en un solo lugar.
          </p>

          <ul className="reveal reveal-3 mt-9 grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex gap-3.5">
                <span
                  className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${f.tone} text-white shadow-float`}
                >
                  <f.icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-semibold text-slate-800">{f.title}</p>
                  <p className="text-sm leading-snug text-slate-500">{f.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Visual */}
        <div className="reveal reveal-2 relative">
          {/* Halo */}
          <div className="animate-glow absolute -inset-6 -z-10 rounded-[2.5rem] bg-brand-400/25 blur-3xl" />
          {/* Edificio blueprint decorativo */}
          <svg
            className="animate-glow absolute -right-6 -top-10 -z-10 h-64 w-64 text-brand-300/50"
            viewBox="0 0 200 220"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            aria-hidden="true"
          >
            <path d="M60 210V70l50-30 50 30v140" />
            <path d="M60 70l50 30 50-30M110 100v110" />
            {[95, 120, 145, 170].map((y) => (
              <path key={y} d={`M60 ${y}h100`} />
            ))}
            {[75, 90, 130].map((x) => (
              <path key={x} d={`M${x} 70v140`} />
            ))}
          </svg>

          <div className="animate-floaty">
            <HeroMockup />
          </div>
        </div>
      </section>

      {/* Acceso (login / registro) */}
      <section id="acceso" className="mx-auto max-w-7xl px-5 pb-16 lg:px-8">
        <div className="glass overflow-hidden shadow-float">
          <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
            {/* Bienvenida */}
            <div className="relative hidden flex-col justify-between bg-gradient-to-br from-brand-700 to-brand-900 p-8 text-white lg:flex">
              <div className="blueprint absolute inset-0 opacity-20" />
              <div className="relative">
                <Logo tone="white" size={34} />
                <h2 className="mt-8 text-3xl font-bold leading-tight">
                  {tab === 'login' ? 'Bienvenido de nuevo' : 'Crea tu cuenta'}
                </h2>
                <p className="mt-3 max-w-xs text-brand-100">
                  {tab === 'login'
                    ? 'Inicia sesión para acceder a tus proyectos.'
                    : 'Empieza a gestionar tus proyectos en minutos.'}
                </p>
              </div>
              <div className="relative space-y-3 text-sm text-brand-100">
                {[
                  'Presupuestos, provisiones y facturas',
                  'Portal para tus clientes',
                  'Documentos siempre a mano',
                ].map((t) => (
                  <div key={t} className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-white" /> {t}
                  </div>
                ))}
              </div>
            </div>

            {/* Formulario */}
            <div className="bg-white p-7 sm:p-10">
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
                  <>
                    {/* Tipo de cuenta */}
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          { key: 'empresa', label: 'Empresa', icon: Building2 },
                          { key: 'autonomo', label: 'Autónomo', icon: User },
                        ] as const
                      ).map((o) => (
                        <button
                          key={o.key}
                          type="button"
                          onClick={() => setTipo(o.key)}
                          className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                            tipo === o.key
                              ? 'border-brand-500 bg-brand-50 text-brand-700'
                              : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                          }`}
                        >
                          <o.icon className="h-4 w-4" />
                          {o.label}
                        </button>
                      ))}
                    </div>

                    <label className="field">
                      <User className="h-4 w-4 text-slate-400" />
                      <input
                        type="text"
                        placeholder={
                          tipo === 'empresa' ? 'Nombre del contacto' : 'Nombre completo'
                        }
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        required
                      />
                    </label>

                    {tipo === 'empresa' && (
                      <label className="field">
                        <Building2 className="h-4 w-4 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Nombre de la empresa"
                          value={companyName}
                          onChange={(e) => setCompanyName(e.target.value)}
                          required
                        />
                      </label>
                    )}

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
                    {showPass ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
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
                <p className="mb-2.5 text-center text-xs font-medium uppercase tracking-wide text-slate-400">
                  Acceso rápido de prueba
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {DEMO.map((d) => (
                    <button
                      key={d.email}
                      onClick={() => quickLogin(d.email)}
                      disabled={busy}
                      className="rounded-xl border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600 transition hover:border-brand-300 hover:bg-brand-50 disabled:opacity-60"
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-slate-400">
          © {new Date().getFullYear()} Feblio · Gestiona tus proyectos de principio a fin
        </p>
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
