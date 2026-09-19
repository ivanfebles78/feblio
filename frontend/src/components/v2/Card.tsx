import type { HTMLAttributes, ReactNode } from 'react'

/**
 * Superficies del sistema v2: fondo blanco, borde #E2E8F0, radio moderado y sombra muy suave.
 * Las tarjetas se usan solo cuando agrupan contenido con sentido propio.
 */
export function Card({ className = '', children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04)] ${className}`} {...rest}>
      {children}
    </div>
  )
}

export interface CardHeaderProps {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  as?: 'h2' | 'h3'
  className?: string
}

export function CardHeader({ title, description, action, as: Tag = 'h2', className = '' }: CardHeaderProps) {
  return (
    <div className={`flex items-start justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        <Tag className="text-base font-semibold text-slate-900">{title}</Tag>
        {description && <p className="mt-0.5 text-sm text-slate-600">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

/** Estado vacío profesional: icono contenido, título, texto breve y acción opcional. */
export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-slate-300 bg-slate-50/60 px-6 py-8 text-center">
      {icon && <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-white text-slate-500 ring-1 ring-slate-200">{icon}</div>}
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      {description && <p className="mt-1 max-w-xs text-sm text-slate-600">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** Píldora de estado semántica: verde = éxito, ámbar = pendiente, azul = información, violeta = IA. */
export type PillTone = 'success' | 'pending' | 'info' | 'ai' | 'neutral'
const PILL: Record<PillTone, string> = {
  success: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  pending: 'bg-amber-50 text-amber-800 ring-amber-200',
  info: 'bg-brand-50 text-brand-800 ring-brand-200',
  ai: 'bg-violet-50 text-violet-800 ring-violet-200',
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
}
export function StatusPill({ tone = 'neutral', children, dot = true }: { tone?: PillTone; children: ReactNode; dot?: boolean }) {
  const dotColor = { success: 'bg-emerald-500', pending: 'bg-amber-500', info: 'bg-brand-500', ai: 'bg-violet-500', neutral: 'bg-slate-400' }[tone]
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${PILL[tone]}`}>
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} aria-hidden="true" />}
      {children}
    </span>
  )
}
