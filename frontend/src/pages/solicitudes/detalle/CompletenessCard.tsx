import { AlertCircle, CheckCircle2, FileWarning, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Card, CardHeader } from '../../../components/v2/Card'
import { ProgressRing } from '../../../components/v2/Progress'
import { Button } from '../../../components/v2/Button'
import { formatDateTime } from '../../../lib/intl'
import type { AnalysisItem, SolicitudAnalisis } from '../../../lib/solicitudes/types'
import { analysisItemLabel } from '../../../lib/solicitudes/analysis'

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
          {analysisItemLabel(it)}
        </li>
      ))}
    </ul>
  )
}

/** Tarjeta de suficiencia: % de completitud, recibido, pendiente y documentos que faltan. */
export function CompletenessCard({ analysis, completeness, onReanalyze, busy = false }: CompletenessCardProps) {
  const { t } = useTranslation()
  const received = analysis?.received ?? []
  const missing = analysis?.missing ?? []
  const missingDocs = analysis?.missing_documents ?? []
  return (
    <Card className="p-5">
      <CardHeader
        className="flex-wrap"
        title={t('requests.completeness.title')}
        description={analysis ? t('requests.completeness.checkInfo', { version: analysis.version, date: formatDateTime(analysis.created_at) }) : t('requests.completeness.noChecks')}
        action={
          onReanalyze && (
            <Button variant="secondary" size="sm" onClick={onReanalyze} disabled={busy} leading={<RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} aria-hidden="true" />}>
              {t('requests.actions.reanalyze')}
            </Button>
          )
        }
      />
      <div className="mt-4 grid gap-5 sm:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center gap-1">
          <ProgressRing value={completeness} size={88} stroke={8} label={t('requests.completeness.ringLabel')} />
          <p className="text-xs text-slate-500">{analysis?.summary ?? ''}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('requests.completeness.received')}</h3>
            <ItemList items={received} icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} tone="text-slate-700" empty={t('requests.completeness.receivedEmpty')} />
          </div>
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('requests.completeness.missing')}</h3>
            <ItemList items={missing} icon={<AlertCircle className="h-4 w-4 text-amber-600" />} tone="text-slate-800" empty={t('requests.completeness.missingEmpty')} />
          </div>
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('requests.completeness.missingDocs')}</h3>
            <ItemList items={missingDocs} icon={<FileWarning className="h-4 w-4 text-amber-600" />} tone="text-slate-800" empty={t('requests.completeness.missingDocsEmpty')} />
          </div>
        </div>
      </div>
    </Card>
  )
}
