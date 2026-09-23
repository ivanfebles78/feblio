import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Building2, CheckCircle2, Circle, Clock3, FileText, MessagesSquare, ReceiptText, Tags, Workflow } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { Logo } from '../components/Logo'
import { Button } from '../components/v2/Button'
import { ProgressBar } from '../components/v2/Progress'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { markWelcomeSeen } from '../lib/onboarding/api'
import { SETUP_AREAS, SETUP_TOTAL_MINUTES } from '../lib/onboarding/areas'
import type { SetupAreaKey } from '../lib/onboarding/areas'
import { onboardingStepPath } from '../lib/routing'

/**
 * Icono por clave de área, nunca por posición: al añadir un área a SETUP_AREAS los índices se
 * desplazaban y se renderizaba un componente undefined (React #130: pantalla en blanco).
 * El Record es exhaustivo en compilación; AREA_FALLBACK_ICON cubre cualquier desajuste en ejecución.
 */
const AREA_ICONS: Record<SetupAreaKey, LucideIcon> = {
  company: Building2,
  documents: FileText,
  channels: MessagesSquare,
  catalog: Tags,
  automation: Workflow,
  billing: ReceiptText,
}
const AREA_FALLBACK_ICON: LucideIcon = Circle

/**
 * Bienvenida de primera entrada (/bienvenida). <EmpresaGate mode="welcome"> garantiza que
 * solo se muestra a empresas verificadas que aún no la han visto. Ambos botones la marcan
 * como vista (RPC idempotente); "Ir al dashboard" no obliga a configurar nada.
 */
export default function WelcomePage() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [companyName, setCompanyName] = useState('')
  const [busy, setBusy] = useState<'configure' | 'dashboard' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const empresaId = profile?.empresa_id ?? null
  const firstName = (profile?.full_name ?? '').trim().split(/\s+/)[0] || ''

  useEffect(() => {
    if (!empresaId) return
    supabase
      .from('empresas')
      .select('name, trade_name')
      .eq('id', empresaId)
      .single()
      .then(({ data }) => {
        const e = data as { name: string; trade_name?: string | null } | null
        setCompanyName(e?.trade_name || e?.name || '')
      })
  }, [empresaId])

  async function go(target: 'configure' | 'dashboard') {
    if (busy) return
    setBusy(target)
    setError(null)
    try {
      await markWelcomeSeen()
      navigate(target === 'configure' ? onboardingStepPath('company') : '/empresa', { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : t('auth.welcome.continueError'))
      setBusy(null)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <Logo size={28} />
          <div className="flex min-w-0 items-center gap-3">
            <span className="truncate text-sm text-slate-600">{profile?.email}</span>
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:py-10">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-800 ring-1 ring-inset ring-emerald-200">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> {t('auth.welcome.emailConfirmed')}
          </span>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">{firstName ? t('auth.welcome.titleWithName', { name: firstName }) : t('auth.welcome.title')}</h1>
          <p className="mt-3 text-lg text-slate-700">
            {companyName ? (
              <Trans i18nKey="auth.welcome.introWithCompany" values={{ company: companyName }} components={{ company: <span className="font-semibold text-slate-900" /> }} />
            ) : (
              t('auth.welcome.intro')
            )}
          </p>
          <p className="mt-2 text-sm text-slate-600">{t('auth.welcome.progressive')}</p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Button size="lg" onClick={() => go('configure')} disabled={busy !== null} trailing={<ArrowRight className="h-4 w-4" aria-hidden="true" />}>
              {busy === 'configure' ? t('auth.welcome.opening') : t('auth.welcome.configure')}
            </Button>
            <Button size="lg" variant="secondary" onClick={() => go('dashboard')} disabled={busy !== null}>
              {busy === 'dashboard' ? t('auth.welcome.opening') : t('auth.welcome.dashboard')}
            </Button>
          </div>
          <div aria-live="assertive">
            {error && (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                {error}
              </p>
            )}
          </div>
        </div>

        <section className="mt-10 rounded-xl border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,.04)] sm:p-8" aria-labelledby="areas-title">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="areas-title" className="text-lg font-semibold">
                {t('auth.welcome.areasTitle', { count: SETUP_AREAS.length })}
              </h2>
              <p className="mt-1 text-sm text-slate-600">{t('auth.welcome.areasHint')}</p>
            </div>
            <p className="inline-flex items-center gap-1.5 text-sm text-slate-600">
              <Clock3 className="h-4 w-4" aria-hidden="true" /> {t('auth.welcome.totalMinutes', { count: SETUP_TOTAL_MINUTES })}
            </p>
          </div>
          <ProgressBar value={0} label={t('auth.welcome.progressLabel')} className="mt-5" />
          <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SETUP_AREAS.map((a, i) => {
              const Icon = AREA_ICONS[a.key] ?? AREA_FALLBACK_ICON
              return (
                <li key={a.key} className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                  <div className="flex items-center justify-between">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-brand-700 ring-1 ring-slate-200" aria-hidden="true">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="text-sm font-medium text-slate-500">
                      {i + 1}/{SETUP_AREAS.length}
                    </span>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-slate-900">{a.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{a.description}</p>
                  <p className="mt-2 text-sm text-slate-500">{t('common.units.minutes', { count: a.minutes })}</p>
                </li>
              )
            })}
          </ol>
        </section>

        <p className="mt-6 text-center text-sm text-slate-600">{t('auth.welcome.exploreFirst')}</p>
      </main>
    </div>
  )
}
