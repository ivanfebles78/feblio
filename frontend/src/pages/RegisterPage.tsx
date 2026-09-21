import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FolderKanban, LockKeyhole, MailCheck, MessagesSquare, ReceiptText, ShieldCheck } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { Logo } from '../components/Logo'
import { RegisterForm } from '../components/auth/RegisterForm'
import { ButtonLink } from '../components/v2/Button'
import { useAuth, type SignUpParams } from '../context/AuthContext'
import { currentLanguage } from '../i18n'
import { homePathForRole } from '../lib/routing'

/** Ventajas de la columna lateral: claves de auth.register.benefits.* */
const BENEFITS = [
  { icon: FolderKanban, key: 'projects' },
  { icon: MessagesSquare, key: 'clients' },
  { icon: ReceiptText, key: 'billing' },
] as const

/**
 * Registro público de empresa (/registro). Dos columnas en escritorio, una en móvil.
 * Crea usuario + empresa (rol empresa, fijado en servidor) y pide confirmar el correo.
 * Los mensajes son neutros: no revelan si un correo ya estaba registrado.
 */
export default function RegisterPage() {
  const { t } = useTranslation()
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
      // Idioma de la interfaz en el momento de enviar (base de los correos bilingües)
      const { error, needsConfirmation } = await signUp({ ...params, language: currentLanguage() })
      if (error) {
        setError(translateRegisterError(error, t))
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
          <Link to="/" className="inline-flex rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70" aria-label={t('auth.register.logoLabel')}>
            <Logo tone="white" size={30} />
          </Link>
          <h1 className="mt-8 max-w-md text-2xl font-semibold leading-tight tracking-tight sm:text-3xl lg:mt-14 lg:text-[2rem]">{t('auth.register.heroTitle')}</h1>
          <p className="mt-3 max-w-md text-base leading-relaxed text-slate-300">{t('auth.register.heroSubtitle')}</p>
          <ul className="mt-8 hidden space-y-5 lg:block" aria-label={t('auth.register.benefitsLabel')}>
            {BENEFITS.map((b) => (
              <li key={b.key} className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 text-brand-200 ring-1 ring-white/15" aria-hidden="true">
                  <b.icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-medium text-white">{t(`auth.register.benefits.${b.key}Title`)}</p>
                  <p className="mt-0.5 text-sm text-slate-300">{t(`auth.register.benefits.${b.key}Text`)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="relative mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-300 lg:mt-0">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-emerald-300" aria-hidden="true" /> {t('auth.register.badgeEu')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <LockKeyhole className="h-4 w-4 text-emerald-300" aria-hidden="true" /> {t('auth.register.badgeEncryption')}
          </span>
        </div>
      </aside>

      <main className="flex items-start justify-center px-4 py-8 sm:px-8 lg:py-10">
        <div className="w-full max-w-xl lg:max-w-3xl">
          <div className="mb-4 flex justify-end">
            <LanguageSwitcher />
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,.04)] sm:p-8">
            {sentTo ? (
              <div role="status" aria-live="polite">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" aria-hidden="true">
                  <MailCheck className="h-6 w-6" />
                </span>
                <h2 className="mt-4 text-xl font-semibold tracking-tight">{t('auth.register.checkEmailTitle')}</h2>
                <p className="mt-2 text-base text-slate-700">
                  <Trans i18nKey="auth.register.checkEmailBody" values={{ email: sentTo }} components={{ email: <span className="font-medium text-slate-900" /> }} />
                </p>
                <p className="mt-2 text-sm text-slate-600">{t('auth.register.notArriving')}</p>
                <div className="mt-6">
                  <ButtonLink to="/" variant="secondary" block>
                    {t('auth.register.goToSignIn')}
                  </ButtonLink>
                </div>
              </div>
            ) : (
              <>
                <h2 className="text-xl font-semibold tracking-tight">{t('auth.register.title')}</h2>
                <p className="mt-1 text-base text-slate-600">{t('auth.register.subtitle')}</p>
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
                  {t('auth.register.haveAccount')}{' '}
                  <Link to="/" className="font-semibold text-brand-700 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                    {t('auth.register.signInLink')}
                  </Link>
                </p>
              </>
            )}
          </div>
          <p className="mt-4 text-center text-sm text-slate-500">{t('auth.register.footnote')}</p>
        </div>
      </main>
    </div>
  )
}

/** Mensajes seguros: no confirman si un correo existe ni detallan la política interna. */
function translateRegisterError(msg: string, t: (key: string) => string): string {
  const m = msg.toLowerCase()
  if (m.includes('rate limit') || m.includes('too many')) return t('auth.register.errors.rateLimit')
  if (m.includes('password')) return t('auth.register.errors.password')
  if (m.includes('is invalid') || m.includes('invalid email') || m.includes('email_address_invalid')) return t('auth.register.errors.invalidEmail')
  if (m.includes('already registered') || m.includes('already exists')) return t('auth.register.errors.alreadyRegistered')
  return t('auth.register.errors.generic')
}
