import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LanguageSwitcher } from '../LanguageSwitcher'
import { Logo } from '../Logo'

/**
 * Página de autenticación secundaria (recuperar / restablecer contraseña): cabecera
 * sobria con la marca y el selector de idioma, y una tarjeta centrada con el mismo lenguaje
 * visual que el registro v2.
 */
export function AuthCardLayout({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" className="inline-flex rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label={t('auth.layout.logoLabel')}>
            <Logo size={28} />
          </Link>
          <LanguageSwitcher />
        </div>
      </header>
      <main className="mx-auto w-full max-w-md px-4 py-10 sm:px-6 lg:py-14">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,.04)] sm:p-8">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="mt-1 text-base text-slate-600">{description}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </main>
    </div>
  )
}
