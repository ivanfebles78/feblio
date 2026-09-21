import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Logo } from '../../components/Logo'
import { LanguageSwitcher } from '../../components/LanguageSwitcher'
import { toLanguage } from '../../i18n'

interface LegalLayoutProps {
  title: string
  version: string
  children: ReactNode
}

/**
 * Plantilla de páginas legales.
 * AVISO INTERNO: los textos son un borrador estructurado, no lorem ipsum, y
 * requieren revisión jurídica antes de publicarse como definitivos.
 * La versión española es la jurídicamente vinculante; en inglés se añade al final
 * una nota de prevalencia del texto español.
 */
export function LegalLayout({ title, version, children }: LegalLayoutProps) {
  const { t, i18n } = useTranslation()
  const isEnglish = toLanguage(i18n.language) === 'en'
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-5 py-4">
          <Link to="/" className="rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400" aria-label={t('legal.layout.backHome')}>
            <Logo size={30} />
          </Link>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t('legal.layout.back')}
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-10">
        <article className="surface prose-slate p-8">
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          <p className="mt-1 text-xs text-slate-400">{t('legal.layout.version', { version })}</p>
          <div className="mt-6 space-y-6 text-sm leading-relaxed text-slate-700">{children}</div>
          {isEnglish && (
            <p className="mt-6 border-t border-slate-100 pt-4 text-xs italic text-slate-400" lang="en">
              {t('legal.translationNote')}
            </p>
          )}
        </article>
      </main>
    </div>
  )
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-base font-semibold text-slate-900">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  )
}
