import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Logo } from '../../components/Logo'

interface LegalLayoutProps {
  title: string
  version: string
  children: ReactNode
}

/**
 * Plantilla de páginas legales.
 * AVISO INTERNO: los textos son un borrador estructurado, no lorem ipsum, y
 * requieren revisión jurídica antes de publicarse como definitivos.
 */
export function LegalLayout({ title, version, children }: LegalLayoutProps) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Link to="/" className="rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400" aria-label="Volver al inicio">
            <Logo size={30} />
          </Link>
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Volver
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-10">
        <article className="surface prose-slate p-8">
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          <p className="mt-1 text-xs text-slate-400">Versión {version}</p>
          <div className="mt-6 space-y-6 text-sm leading-relaxed text-slate-700">{children}</div>
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
