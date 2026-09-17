import { AlertTriangle, CheckCircle2, Circle, Clock, Loader2, PlugZap, XCircle, Unplug, type LucideIcon } from 'lucide-react'
import { STATUS_LABEL } from '../../lib/integrations/adapters'
import type { HealthCheckResult, IntegrationStatus } from '../../lib/onboarding/types'

const META: Record<IntegrationStatus, { icon: LucideIcon; cls: string }> = {
  not_configured: { icon: Circle, cls: 'bg-slate-100 text-slate-600 ring-slate-200' },
  pending_credentials: { icon: PlugZap, cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
  connecting: { icon: Loader2, cls: 'bg-brand-50 text-brand-700 ring-brand-200' },
  connected: { icon: CheckCircle2, cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  degraded: { icon: AlertTriangle, cls: 'bg-orange-50 text-orange-700 ring-orange-200' },
  expired: { icon: Clock, cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
  error: { icon: XCircle, cls: 'bg-red-50 text-red-700 ring-red-200' },
  disconnected: { icon: Unplug, cls: 'bg-slate-100 text-slate-600 ring-slate-200' },
}

/** Estado de conexión de una integración (icono + texto). */
export function ConnectionStatus({ status }: { status: IntegrationStatus }) {
  const m = META[status]
  const Icon = m.icon
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${m.cls}`}>
      <Icon className={`h-3 w-3 ${status === 'connecting' ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  )
}

/** Resultado de una prueba de conexión. */
export function ConnectionTestResult({ result }: { result: HealthCheckResult | null }) {
  if (!result) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className={`mt-3 rounded-xl px-3 py-2 text-xs ${result.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}
    >
      <p className="flex items-start gap-1.5 font-medium">
        {result.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
        {result.message}
      </p>
      {result.details && Object.keys(result.details).length > 0 && (
        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px] opacity-90">
          {Object.entries(result.details).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-medium">{k}</dt>
              <dd className="truncate">{String(v)}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="mt-1 text-[11px] opacity-70">
        Probado el <time dateTime={result.checkedAt}>{new Date(result.checkedAt).toLocaleString('es-ES')}</time>
      </p>
    </div>
  )
}
