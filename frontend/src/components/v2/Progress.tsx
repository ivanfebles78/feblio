import { Check, Circle, CircleDot } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

/** Barra de progreso accesible (role=progressbar con valor anunciado). */
export function ProgressBar({ value, label, className = '' }: { value: number; label: string; className?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)))
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="tabular-nums text-slate-600">{v}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={v}>
        <div className="h-full rounded-full bg-brand-600 transition-[width] duration-500" style={{ width: `${v}%` }} />
      </div>
    </div>
  )
}

/** Anillo de progreso (SVG) para resúmenes compactos. */
export function ProgressRing({ value, size = 64, stroke = 6, label }: { value: number; size?: number; stroke?: number; label: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)))
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="relative inline-flex items-center justify-center" role="img" aria-label={`${label}: ${v}%`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E2E8F0" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#2563eb"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * v) / 100}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="absolute text-sm font-semibold tabular-nums text-slate-900">{v}%</span>
    </div>
  )
}

export type ChecklistStatus = 'done' | 'current' | 'pending'

export interface ChecklistItemData {
  key: string
  title: string
  description: string
  status: ChecklistStatus
  minutes: number
  icon?: ReactNode
}

function StatusIcon({ status }: { status: ChecklistStatus }) {
  if (status === 'done')
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white" aria-hidden="true">
        <Check className="h-3.5 w-3.5" />
      </span>
    )
  if (status === 'current')
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-50 text-brand-700 ring-2 ring-brand-500" aria-hidden="true">
        <CircleDot className="h-3.5 w-3.5" />
      </span>
    )
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-slate-400 ring-1 ring-slate-300" aria-hidden="true">
      <Circle className="h-3 w-3" />
    </span>
  )
}

/** Lista de pasos con estado explícito en texto (no solo color) y acción por fila. */
export function Checklist({ items, onAction, actionLabel }: { items: ChecklistItemData[]; onAction?: (key: string) => void; actionLabel?: string }) {
  const { t } = useTranslation()
  const action = actionLabel ?? t('dashboard.checklist.configure')
  return (
    <ol className="divide-y divide-slate-200">
      {items.map((it, i) => (
        <li key={it.key} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
          <StatusIcon status={it.status} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-900">
              <span className="text-slate-500">{i + 1}.</span>&nbsp;{it.title}
              <span className="sr-only">— {t(`dashboard.checklist.${it.status}`)}</span>
            </p>
            <p className="text-xs text-slate-600">{it.description}</p>
          </div>
          <span className="hidden shrink-0 text-xs tabular-nums text-slate-500 sm:inline">{t('dashboard.checklist.minutes', { count: it.minutes })}</span>
          {onAction && it.status !== 'done' && (
            <button
              type="button"
              onClick={() => onAction(it.key)}
              className={`shrink-0 rounded-md px-2.5 py-1.5 text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 ${
                it.status === 'current' ? 'bg-brand-600 text-white hover:bg-brand-700' : 'text-brand-700 hover:bg-brand-50'
              }`}
            >
              {action}
            </button>
          )}
        </li>
      ))}
    </ol>
  )
}
