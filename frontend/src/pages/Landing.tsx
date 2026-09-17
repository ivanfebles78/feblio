import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { HeroScene } from '../components/HeroScene'
import { LoginForm } from '../components/auth/LoginForm'
import { RegisterForm } from '../components/auth/RegisterForm'
import { DemoAccess } from '../components/auth/DemoAccess'
import { useAuth, type SignUpParams } from '../context/AuthContext'
import { homePathForRole } from '../lib/routing'
import type { DemoAccount } from '../lib/env'

type Tab = 'login' | 'register'

export default function Landing() {
  const { session, profile, signIn, signUp } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('login')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [prefillEmail, setPrefillEmail] = useState('')
  const [demoAccount, setDemoAccount] = useState<DemoAccount | null>(null)

  useEffect(() => {
    // Empresa: /empresa decide (verificación → onboarding → dashboard) sin parpadeos.
    if (session && profile) navigate(homePathForRole(profile.role), { replace: true })
  }, [session, profile, navigate])

  async function handleLogin(email: string, password: string) {
    setError(null)
    setNotice(null)
    setBusy(true)
    const { error } = await signIn(email, password)
    if (error) setError(traducir(error))
    setBusy(false)
  }

  async function handleRegister(params: SignUpParams) {
    setError(null)
    setNotice(null)
    setBusy(true)
    const { error, needsConfirmation } = await signUp(params)
    if (error) setError(traducir(error))
    else if (needsConfirmation) {
      setNotice(
        'Cuenta creada. Te hemos enviado un enlace de confirmación a tu correo; ábrelo y vuelve a iniciar sesión para continuar.',
      )
      setPrefillEmail(params.email)
      setTab('login')
    } else {
      setNotice('Cuenta creada. Entrando…')
    }
    setBusy(false)
  }

  function switchTab(t: Tab) {
    setTab(t)
    setError(null)
    setNotice(null)
  }

  return (
    <div className="min-h-screen bg-white lg:grid lg:grid-cols-[1.65fr_1fr]">
      <HeroScene />

      <main className="relative flex items-center justify-center bg-gradient-to-b from-white via-white to-brand-50/60 px-6 py-12 sm:px-10">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-500 via-fuchsia-500 to-cyan-400 lg:hidden" />
        <div className="w-full max-w-sm">
          <div className="mb-7 text-center lg:hidden">
            <Logo size={34} />
          </div>

          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-100">
            {tab === 'login' ? '👋 Te estábamos esperando' : '🚀 Únete a Feblio'}
          </span>
          <h1 className="mt-3 text-2xl font-bold text-slate-900">
            {tab === 'login' ? 'Bienvenido de nuevo' : 'Crea tu cuenta'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {tab === 'login'
              ? 'Inicia sesión para acceder a tus proyectos.'
              : 'Tus datos personales y los de tu empresa, por separado. En minutos.'}
          </p>

          <div className="mb-6 mt-6 flex gap-6 border-b border-slate-200" role="tablist" aria-label="Acceso">
            {(['login', 'register'] as const).map((t) => (
              <button
                key={t}
                role="tab"
                id={`tab-${t}`}
                aria-selected={tab === t}
                aria-controls={`panel-${t}`}
                onClick={() => switchTab(t)}
                className={`-mb-px border-b-2 pb-3 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
                  tab === t ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {t === 'login' ? 'Iniciar sesión' : 'Registrarse'}
              </button>
            ))}
          </div>

          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
            {tab === 'login' ? (
              <LoginForm
                key={prefillEmail}
                busy={busy}
                initialEmail={prefillEmail}
                demoAccount={demoAccount}
                onClearDemo={() => setDemoAccount(null)}
                onSubmit={handleLogin}
              />
            ) : (
              <RegisterForm busy={busy} onSubmit={handleRegister} />
            )}
          </div>

          <div aria-live="polite" className="mt-3 space-y-2">
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                {error}
              </p>
            )}
            {notice && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}
          </div>

          <DemoAccess
            onPick={(account) => {
              setDemoAccount(account)
              switchTab('login')
            }}
          />

          <p className="mt-8 text-center text-xs text-slate-400">© {new Date().getFullYear()} Feblio</p>
        </div>
      </main>
    </div>
  )
}

function traducir(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('invalid login')) return 'Email o contraseña incorrectos.'
  if (m.includes('already registered')) return 'Ese email ya está registrado.'
  if (m.includes('email not confirmed')) return 'Confirma tu email desde el enlace que te enviamos antes de iniciar sesión.'
  if (m.includes('rate limit')) return 'Demasiados intentos. Espera unos minutos.'
  if (m.includes('password')) return 'La contraseña no cumple la política de seguridad.'
  return msg
}
