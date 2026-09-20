import { AlertCircle, CheckCircle2, FileWarning, RefreshCw } from 'lucide-react'
import { Card, CardHeader } from '../../../components/v2/Card'
import { ProgressRing } from '../../../components/v2/Progress'
import { Button } from '../../../components/v2/Button'
import { formatDateTime } from '../../../lib/solicitudes/format'
import type { AnalysisItem, SolicitudAnalisis } from '../../../lib/solicitudes/types'

export interface CompletenessCardProps {
  analysis: SolicitudAnalisis | null
  completeness: number
  onReanalyze?: () => void
  busy?: boolean
}

function ItemList({ items, icon, tone, empty }: { items: AnalysisItem[]; icon: React.ReactNode; tone: string; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-slate-500">{empty}</p>
  return (
    <ul className="space-y-1">
      {items.map((it) => (
        <li key={`${it.kind ?? 'field'}:${it.key}`} className={`flex items-start gap-2 text-sm ${tone}`}>
          <span className="mt-0.5 shrink-0" aria-hidden="true">
            {icon}
          </span>
          {it.label}
        </li>
      ))}
    </ul>
  )
}

/** Tarjeta de suficiencia: % de completitud, recibido, pendiente y documentos que faltan. */
export function CompletenessCard({ analysis, completeness, onReanalyze, busy = false }: CompletenessCardProps) {
  const received = analysis?.received ?? []
  const missing = analysis?.missing ?? []
  const missingDocs = analysis?.missing_documents ?? []
  return (
    <Card className="p-5">
      <CardHeader
        className="flex-wrap"
        title="Completitud de la información"
        description={analysis ? `Comprobación v${analysis.version} · ${formatDateTime(analysis.created_at)} · reglas deterministas` : 'Sin comprobaciones todavía.'}
        action={
          onReanalyze && (
            <Button variant="secondary" size="sm" onClick={onReanalyze} disabled={busy} leading={<RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} aria-hidden="true" />}>
              Volver a comprobar
            </Button>
          )
        }
      />
      <div className="mt-4 grid gap-5 sm:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center gap-1">
          <ProgressRing value={completeness} size={88} stroke={8} label="Completitud" />
          <p className="text-xs text-slate-500">{analysis?.summary ?? ''}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Recibido</h3>
            <ItemList items={received} icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} tone="text-slate-700" empty="Nada todavía." />
          </div>
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Información pendiente</h3>
            <ItemList items={missing} icon={<AlertCircle className="h-4 w-4 text-amber-600" />} tone="text-slate-800" empty="Nada pendiente." />
          </div>
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Documentos pendientes</h3>
            <ItemList items={missingDocs} icon={<FileWarning className="h-4 w-4 text-amber-600" />} tone="text-slate-800" empty="Ningún documento pendiente." />
          </div>
        </div>
      </div>
    </Card>
  )
}
