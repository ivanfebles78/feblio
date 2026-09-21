import { AlertTriangle, CheckCircle2, Circle, CircleDot, MinusCircle, XCircle, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { stepStatusLabel } from '../../lib/onboarding/steps'
import type { StepStatus } from '../../lib/onboarding/types'

const META: Record<StepStatus, { icon: LucideIcon; cls: string }> = {
  pending: { icon: Circle, cls: 'bg-slate-100 text-slate-600 ring-slate-200' },
  in_progress: { icon: CircleDot, cls: 'bg-brand-50 text-brand-700 ring-brand-200' },
  completed: { icon: CheckCircle2, cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  skipped: { icon: MinusCircle, cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
  error: { icon: XCircle, cls: 'bg-red-50 text-red-700 ring-red-200' },
  requires_attention: { icon: AlertTriangle, cls: 'bg-orange-50 text-orange-700 ring-orange-200' },
}

/** Estado de un paso: icono + texto (nunca solo color). */
export function StepStatusBadge({ status, compact = false }: { status: StepStatus; compact?: boolean }) {
  useTranslation()
  const m = META[status]
  const Icon = m.icon
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${m.cls}`}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {compact ? <span className="sr-only">{stepStatusLabel(status)}</span> : stepStatusLabel(status)}
    </span>
  )
}

export function StepStatusIcon({ status, className = 'h-4 w-4' }: { status: StepStatus; className?: string }) {
  useTranslation()
  const Icon = META[status].icon
  return (
    <>
      <Icon className={className} aria-hidden="true" />
      <span className="sr-only">{stepStatusLabel(status)}</span>
    </>
  )
}
