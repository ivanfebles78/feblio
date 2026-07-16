import type { ReactNode } from 'react'

/* ---- Badge ---- */
const BADGE_TONES: Record<string, string> = {
  blue: 'bg-brand-50 text-brand-700 ring-brand-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  slate: 'bg-slate-100 text-slate-600 ring-slate-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
}

export function Badge({
  children,
  tone = 'slate',
}: {
  children: ReactNode
  tone?: keyof typeof BADGE_TONES | string
}) {
  const cls = BADGE_TONES[tone] ?? BADGE_TONES.slate
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${cls}`}
    >
      {children}
    </span>
  )
}

/* ---- StatCard ---- */
export function StatCard({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string
  value: string
  hint?: string
  accent?: boolean
}) {
  return (
    <div
      className={`surface p-5 ${
        accent ? 'bg-gradient-to-br from-brand-600 to-brand-700 text-white ring-0' : ''
      }`}
    >
      <p
        className={`text-sm font-medium ${
          accent ? 'text-brand-100' : 'text-slate-500'
        }`}
      >
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
      {hint && (
        <p className={`mt-1 text-xs ${accent ? 'text-brand-100' : 'text-slate-400'}`}>
          {hint}
        </p>
      )}
    </div>
  )
}

/* ---- SectionCard ---- */
export function SectionCard({
  title,
  action,
  children,
  className = '',
}: {
  title: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`surface p-5 ${className}`}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

/* ---- Empty ---- */
export function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
      {text}
    </div>
  )
}
