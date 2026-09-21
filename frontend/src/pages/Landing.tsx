import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { Logo } from '../components/Logo'
import { HeroScene } from '../components/HeroScene'
import { LoginForm } from '../components/auth/LoginForm'
import { DemoAccess } from '../components/auth/DemoAccess'
import { useAuth } from '../context/AuthContext'
import { REGISTER_PATH, resolveReturnTo, takeReturnTo } from '../lib/routing'
import type { DemoAccount } from '../lib/env'

/** Inicio de sesión. El registro de empresas vive en /registro (RegisterPage). */
export default function Landing() {
  const { t } = useTranslation()
  const { session, profile, signIn, resendConfirmation } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(params.get('reset') === 'ok' ? t('auth.login.passwordUpdated') : null)
  const [busy, setBusy] = useState(false)
  const [demoAccount, setDemoAccount] = useState<DemoAccount | null>(null)
  /** Correo con el que falló el login por estar pendiente de confirmar (permite reenviar el enlace). */
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null)
  const [resent, setResent] = useState(false)

  useEffect(() => {
    if (params.has('reset')) {
      const next = new URLSearchParams(params)
      next.delete('reset')
      setParams(next, { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Con sesión: vuelve a la ruta interna pedida antes de autenticar si el rol puede abrirla;
    // si no, a la home del rol (/empresa decide verificación → bienvenida → dashboard).
    if (!session || !profile) return
    const from = (location.state as { from?: unknown } | null)?.from
    const remembered = takeReturnTo()
    navigate(resolveReturnTo(typeof from === 'string' ? from : remembered, profile.role), { replace: true })
  }, [session, profile, navigate, location.state])

  async function handleLogin(email: string, password: string) {
    setError(null)
    setNotice(null)
    setUnconfirmedEmail(null)
    setResent(false)
    setBusy(true)
    const { error } = await signIn(email, password)
    if (error) {
      setError(translateAuthError(error, t))
      if (error.toLowerCase().includes('email not confirmed')) setUnconfirmedEmail(email)
    }
    setBusy(false)
  }

  async function handleResend() {
    if (!unconfirmedEmail || resent) return
    await resendConfirmation(unconfirmedEmail)
    // Respuesta neutra: no depende del resultado real del envío
    setResent(true)
  }

  return (
    <div className="min-h-screen bg-white lg:grid lg:grid-cols-[1.65fr_1fr]">
      <HeroScene />

      <main className="relative flex items-center justify-center bg-gradient-to-b from-white via-white to-brand-50/60 px-6 py-12 sm:px-10">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-500 via-fuchsia-500 to-cyan-400 lg:hidden" />
        <div className="w-full max-w-sm">
          <div className="mb-7 flex items-center justify-between lg:justify-end">
            <span className="lg:hidden">
              <Logo size={34} />
            </span>
            <LanguageSwitcher />
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t('auth.login.title')}</h1>
          <p className="mt-1 text-sm text-slate-600">{t('auth.login.subtitle')}</p>

          <div className="mt-6">
            <LoginForm busy={busy} demoAccount={demoAccount} onClearDemo={() => setDemoAccount(null)} onSubmit={handleLogin} />
          </div>

          <div aria-live="assertive" className="mt-3 space-y-2">
            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                {error}
              </p>
            )}
            {unconfirmedEmail && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
                {resent ? (
                  t('auth.login.resent')
                ) : (
                  <>
                    {t('auth.login.cantFindEmail')}{' '}
                    <button type="button" onClick={handleResend} className="font-semibold text-amber-900 underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">
                      {t('auth.login.resend')}
                    </button>
                  </>
                )}
              </p>
            )}
            {notice && (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900" role="status">
                {notice}
              </p>
            )}
          </div>

          <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-medium text-slate-900">{t('auth.login.noCompanyYet')}</p>
            <p className="mt-0.5 text-sm text-slate-600">{t('auth.login.createCompanyHint')}</p>
            <Link
              to={REGISTER_PATH}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              {t('auth.login.createCompany')} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>

          <DemoAccess onPick={(account) => setDemoAccount(account)} />

          <p className="mt-8 text-center text-sm text-slate-500">© {new Date().getFullYear()} Feblio</p>
        </div>
      </main>
    </div>
  )
}

/** Traduce los errores de Supabase Auth a mensajes para la persona usuaria. */
function translateAuthError(msg: string, t: (key: string) => string): string {
  const m = msg.toLowerCase()
  if (m.includes('invalid login')) return t('auth.errors.invalidLogin')
  if (m.includes('email not confirmed')) return t('auth.errors.emailNotConfirmed')
  if (m.includes('rate limit')) return t('auth.errors.rateLimit')
  if (m.includes('password')) return t('auth.errors.passwordPolicy')
  return msg
}
