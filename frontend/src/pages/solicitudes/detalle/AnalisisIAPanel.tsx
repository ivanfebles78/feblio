import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle, CheckCircle2, ClipboardList, Clock, FileWarning, Gavel, HelpCircle,
  Loader2, RefreshCw, Scale, Sparkles, ThumbsDown, ThumbsUp, Pencil, X, Check,
} from 'lucide-react'
import { Card, CardHeader, EmptyState, StatusPill } from '../../../components/v2/Card'
import { Button } from '../../../components/v2/Button'
import * as api from '../../../lib/solicitudes/api'
import { formatDate, formatDateTime } from '../../../lib/intl'
import type {
  IaAnalysis, IaAnalysisStatus, IaDecision, IaEvidence, IaHumanState, IaItem, IaItemKind,
} from '../../../lib/solicitudes/types'

/** Estados que ya tienen un resultado analizable y admiten revisión / lectura completa. */
const RESULT_STATES: IaAnalysisStatus[] = ['generated', 'partial', 'in_review', 'approved', 'corrected', 'rejected']
const REVIEWABLE_STATES: IaAnalysisStatus[] = ['generated', 'partial', 'in_review', 'corrected']
const CLOSED_STATES: IaAnalysisStatus[] = ['approved', 'rejected']

const STATUS_TONE: Record<IaAnalysisStatus, 'success' | 'pending' | 'info' | 'ai' | 'neutral'> = {
  queued: 'pending', running: 'pending', generated: 'ai', in_review: 'info', partial: 'pending',
  approved: 'success', corrected: 'info', rejected: 'neutral', failed: 'neutral', superseded: 'neutral',
}

function pct(v: number | null | undefined): string {
  return v == null ? '—' : `${Math.round(v * 100)}%`
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v)
}

export interface AnalisisIAPanelProps {
  solicitudId: string
  solicitudStatus: string
  /** Fecha de la última actividad de la solicitud: si es posterior al análisis, se marca obsoleto. */
  lastActivityAt: string
  /** El usuario es owner/manager de la empresa (o admin). */
  canManage: boolean
}

export function AnalisisIAPanel({ solicitudId, solicitudStatus, lastActivityAt, canManage }: AnalisisIAPanelProps) {
  const { t } = useTranslation()
  const [data, setData] = useState<api.IaOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    try {
      setData(await api.getAnalisisIA(solicitudId))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('requests.ia.errors.load'))
    } finally {
      setLoading(false)
    }
  }, [solicitudId, t])

  useEffect(() => {
    void load()
  }, [load])

  const analyses = useMemo(() => data?.analyses ?? [], [data])
  const latest = useMemo(() => analyses.find((a) => a.status !== 'superseded') ?? analyses[0] ?? null, [analyses])
  const evidenceByItem = useMemo(() => {
    const m = new Map<string, IaEvidence[]>()
    for (const e of data?.evidence ?? []) m.set(e.item_id, [...(m.get(e.item_id) ?? []), e])
    return m
  }, [data])

  async function run(action: () => Promise<unknown>, ok?: string) {
    setBusy(true)
    setNotice(null)
    setError(null)
    try {
      await action()
      await load()
      if (ok) setNotice(ok)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('requests.ia.errors.review'))
    } finally {
      setBusy(false)
    }
  }

  const canAnalyze = !['draft', 'awaiting_client'].includes(solicitudStatus)
  const enqueue = () => run(() => api.encolarAnalisis(solicitudId), t('requests.ia.notice.queued'))
  const obsolete = !!latest && RESULT_STATES.includes(latest.status) && new Date(lastActivityAt).getTime() > new Date(latest.finished_at ?? latest.created_at).getTime()

  if (loading) return <p className="text-sm text-slate-500">{t('requests.ia.loading')}</p>

  return (
    <div className="space-y-5">
      {notice && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900" role="status">{notice}</p>}
      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800" role="alert">{error}</p>}

      {!latest && (
        <Card className="p-6">
          <EmptyState
            icon={<Sparkles className="h-5 w-5 text-violet-500" aria-hidden="true" />}
            title={t('requests.ia.empty.title')}
            description={canAnalyze ? t('requests.ia.empty.desc') : t('requests.ia.empty.notSubmitted')}
            action={canManage && canAnalyze ? <Button onClick={enqueue} disabled={busy} leading={<Sparkles className="h-4 w-4" aria-hidden="true" />}>{t('requests.ia.actions.analyze')}</Button> : undefined}
          />
        </Card>
      )}

      {latest && (
        <Card className="p-5">
          <CardHeader
            className="flex-wrap"
            title={
              <span className="inline-flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-violet-500" aria-hidden="true" /> {t('requests.ia.title')}
                <StatusPill tone={STATUS_TONE[latest.status]}>{t(`requests.ia.status.${latest.status}`)}</StatusPill>
              </span>
            }
            description={t('requests.ia.meta.line', {
              version: latest.version,
              date: latest.finished_at ? formatDateTime(latest.finished_at) : formatDateTime(latest.created_at),
            })}
            action={
              canManage && canAnalyze && (RESULT_STATES.includes(latest.status) || latest.status === 'failed') ? (
                <Button variant="secondary" size="sm" onClick={enqueue} disabled={busy} leading={<RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} aria-hidden="true" />}>
                  {t('requests.ia.actions.reanalyze')}
                </Button>
              ) : undefined
            }
          />

          {obsolete && (
            <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{t('requests.ia.obsolete')}</span>
            </p>
          )}

          {/* Cola / en proceso / fallo: estados sin resultado todavía. */}
          {(latest.status === 'queued' || latest.status === 'running') && (
            <div className="mt-4 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-brand-500" aria-hidden="true" />
              <div>
                <p className="font-medium text-slate-800">{t(`requests.ia.${latest.status}.title`)}</p>
                <p className="text-slate-600">{t(`requests.ia.${latest.status}.desc`)}</p>
              </div>
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => void load()} disabled={busy}>{t('requests.ia.actions.refresh')}</Button>
            </div>
          )}
          {latest.status === 'failed' && (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {t('requests.ia.failed.desc')}{latest.error_code ? ` (${latest.error_code})` : ''}
            </p>
          )}

          {RESULT_STATES.includes(latest.status) && (
            <AnalysisBody
              analysis={latest}
              items={data?.items ?? []}
              evidenceByItem={evidenceByItem}
              revisiones={data?.revisiones ?? []}
              consumo={data?.consumo ?? null}
              config={data?.config ?? null}
              canManage={canManage}
              busy={busy}
              note={note}
              setNote={setNote}
              onOpenReview={() => void run(() => api.abrirRevisionIA(latest.id))}
              onItem={(id, estado, valor) => void run(() => api.marcarItemIA(id, estado, valor), t('requests.ia.notice.itemSaved'))}
              onDecision={(d) => void run(() => api.revisarAnalisisIA(latest.id, d, note.trim() || undefined), t(`requests.ia.notice.${d}`))}
            />
          )}
        </Card>
      )}

      {analyses.length > 1 && (
        <Card className="p-5">
          <CardHeader as="h3" title={t('requests.ia.sections.history')} />
          <ul className="mt-3 space-y-1.5 text-sm text-slate-600">
            {analyses.map((a) => (
              <li key={a.id} className="flex items-center gap-2">
                <StatusPill tone={STATUS_TONE[a.status]}>{t(`requests.ia.status.${a.status}`)}</StatusPill>
                <span>{t('requests.ia.meta.versionShort', { version: a.version })} · {formatDateTime(a.finished_at ?? a.created_at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Cuerpo del análisis con resultado                                    */
/* ------------------------------------------------------------------ */

interface BodyProps {
  analysis: IaAnalysis
  items: IaItem[]
  evidenceByItem: Map<string, IaEvidence[]>
  revisiones: api.IaOverview['revisiones']
  consumo: api.IaOverview['consumo']
  config: api.IaOverview['config']
  canManage: boolean
  busy: boolean
  note: string
  setNote: (v: string) => void
  onOpenReview: () => void
  onItem: (id: string, estado: IaHumanState, valor?: Record<string, unknown> | null) => void
  onDecision: (d: IaDecision) => void
}

const KIND_ICON: Partial<Record<IaItemKind, React.ReactNode>> = {
  deadline: <Clock className="h-4 w-4 text-rose-600" aria-hidden="true" />,
  missing_info: <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />,
  missing_document: <FileWarning className="h-4 w-4 text-amber-600" aria-hidden="true" />,
  question: <HelpCircle className="h-4 w-4 text-brand-600" aria-hidden="true" />,
  service: <ClipboardList className="h-4 w-4 text-violet-600" aria-hidden="true" />,
  risk: <AlertTriangle className="h-4 w-4 text-rose-600" aria-hidden="true" />,
  action: <Gavel className="h-4 w-4 text-slate-600" aria-hidden="true" />,
}

function AnalysisBody(p: BodyProps) {
  const { t } = useTranslation()
  const { analysis, items } = p
  const byKind = (k: IaItemKind) => items.filter((i) => i.kind === k)
  const deadlinesExpress = items.filter((i) => i.kind === 'deadline' && i.deadline_kind === 'expreso')
  const deadlinesComputed = items.filter((i) => i.kind === 'deadline' && i.deadline_kind === 'calculado')
  const otherKinds: IaItemKind[] = ['party', 'issuer', 'reference', 'notified_on', 'received_document']
  const otherData = items.filter((i) => otherKinds.includes(i.kind))
  const closed = CLOSED_STATES.includes(analysis.status)
  const canReview = p.canManage && REVIEWABLE_STATES.includes(analysis.status)
  const canAct = p.canManage && !closed
  const gp = { evidenceByItem: p.evidenceByItem, busy: p.busy, onItem: p.onItem }

  // Al abrir un análisis recién generado, marcarlo «en revisión» una sola vez.
  useEffect(() => {
    if (p.canManage && (analysis.status === 'generated' || analysis.status === 'partial')) p.onOpenReview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis.id])

  return (
    <div className="mt-4 space-y-5">
      {/* Clasificación + confianza */}
      <div className="flex flex-wrap items-center gap-2">
        {analysis.primary_type && <StatusPill tone="info">{t(`requests.ia.primaryType.${analysis.primary_type}`)}</StatusPill>}
        {analysis.secondary_types.map((s) => (
          <span key={s} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">{s}</span>
        ))}
        {analysis.has_formal_requirement && <StatusPill tone="pending">{t('requests.ia.meta.formalRequirement')}</StatusPill>}
        <span className="ml-auto text-xs text-slate-500">
          {t('requests.ia.meta.confidence', { value: pct(analysis.confidence_document) })}
          {analysis.requires_human_review && ` · ${t('requests.ia.meta.requiresReview')}`}
        </span>
      </div>

      {analysis.summary && (
        <Section title={t('requests.ia.sections.summary')}>
          <p className="whitespace-pre-wrap text-sm text-slate-700">{analysis.summary}</p>
        </Section>
      )}

      {/* Plazos: expresos y calculados SIEMPRE separados */}
      {(deadlinesExpress.length > 0 || deadlinesComputed.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          <Section title={t('requests.ia.sections.deadlinesExpress')} hint={t('requests.ia.sections.deadlinesExpressHint')}>
            <ItemGroup items={deadlinesExpress} {...gp} canAct={canAct} emptyText={t('requests.ia.empty.section')} />
          </Section>
          <Section title={t('requests.ia.sections.deadlinesComputed')} hint={t('requests.ia.sections.deadlinesComputedHint')}>
            <ItemGroup items={deadlinesComputed} {...gp} canAct={canAct} emptyText={t('requests.ia.empty.section')} />
          </Section>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {byKind('missing_info').length > 0 && (
          <Section title={t('requests.ia.sections.missingInfo')}><ItemGroup items={byKind('missing_info')} {...gp} canAct={canAct} /></Section>
        )}
        {byKind('missing_document').length > 0 && (
          <Section title={t('requests.ia.sections.missingDocs')}><ItemGroup items={byKind('missing_document')} {...gp} canAct={canAct} /></Section>
        )}
      </div>

      {byKind('question').length > 0 && (
        <Section title={t('requests.ia.sections.questions')}><ItemGroup items={byKind('question')} {...gp} canAct={canAct} /></Section>
      )}

      {byKind('service').length > 0 && (
        <Section title={t('requests.ia.sections.services')} hint={t('requests.ia.sections.servicesHint')}>
          <ItemGroup items={byKind('service')} {...gp} canAct={canAct} />
        </Section>
      )}

      {(byKind('action').length > 0 || byKind('risk').length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {byKind('action').length > 0 && <Section title={t('requests.ia.sections.actions')}><ItemGroup items={byKind('action')} {...gp} canAct={canAct} /></Section>}
          {byKind('risk').length > 0 && <Section title={t('requests.ia.sections.risks')}><ItemGroup items={byKind('risk')} {...gp} canAct={canAct} /></Section>}
        </div>
      )}

      {otherData.length > 0 && (
        <Section title={t('requests.ia.sections.otherData')}>
          <ItemGroup items={otherData} {...gp} canAct={false} />
        </Section>
      )}

      {analysis.warnings.length > 0 && (
        <Section title={t('requests.ia.sections.warnings')}>
          <ul className="space-y-1 text-sm text-amber-800">
            {analysis.warnings.map((w, i) => (
              <li key={i} className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {t(`requests.ia.warnings.${w.code}`, { defaultValue: t('requests.ia.warnings.generic'), value: w.value ?? '' })}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Consumo del mes */}
      {p.consumo && p.config && (
        <p className="text-xs text-slate-500">
          {t('requests.ia.quota.line', {
            used: (p.consumo.cost_micros / 1_000_000).toFixed(2),
            limit: (p.config.monthly_limit_micros / 1_000_000).toFixed(2),
            count: p.consumo.analyses,
          })}
        </p>
      )}

      {/* Revisión humana */}
      {canReview && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <h4 className="text-sm font-semibold text-slate-800">{t('requests.ia.review.title')}</h4>
          <p className="mt-0.5 text-xs text-slate-600">{t('requests.ia.review.desc')}</p>
          <textarea
            value={p.note}
            onChange={(e) => p.setNote(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder={t('requests.ia.review.notePlaceholder')}
            className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => p.onDecision('approved')} disabled={p.busy} leading={<ThumbsUp className="h-4 w-4" aria-hidden="true" />}>{t('requests.ia.actions.approve')}</Button>
            <Button variant="secondary" size="sm" onClick={() => p.onDecision('corrected')} disabled={p.busy} leading={<Pencil className="h-4 w-4" aria-hidden="true" />}>{t('requests.ia.actions.correct')}</Button>
            <Button variant="ghost" size="sm" onClick={() => p.onDecision('rejected')} disabled={p.busy} leading={<ThumbsDown className="h-4 w-4" aria-hidden="true" />}>{t('requests.ia.actions.reject')}</Button>
          </div>
        </div>
      )}

      {closed && (
        <p className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm ${analysis.status === 'approved' ? 'bg-emerald-50 text-emerald-900' : 'bg-slate-100 text-slate-700'}`}>
          {analysis.status === 'approved' ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <X className="h-4 w-4" aria-hidden="true" />}
          {t(`requests.ia.review.${analysis.status}`)}
        </p>
      )}

      {p.revisiones.length > 0 && (
        <Section title={t('requests.ia.sections.reviewHistory')}>
          <ul className="space-y-1.5 text-sm text-slate-600">
            {p.revisiones.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-2">
                <StatusPill tone={r.decision === 'approved' ? 'success' : r.decision === 'rejected' ? 'neutral' : 'info'}>{t(`requests.ia.decision.${r.decision}`)}</StatusPill>
                <span>{formatDateTime(r.created_at)}</span>
                {r.changed_items > 0 && <span className="text-slate-500">· {t('requests.ia.review.changedItems', { count: r.changed_items })}</span>}
                {r.note && <span className="w-full text-slate-500">{r.note}</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h4>
      {hint && <p className="mb-1.5 text-xs text-slate-400">{hint}</p>}
      <div className="mt-1.5">{children}</div>
    </section>
  )
}

interface GroupProps {
  items: IaItem[]
  evidenceByItem: Map<string, IaEvidence[]>
  canAct: boolean
  busy: boolean
  onItem: BodyProps['onItem']
  emptyText?: string
}

function ItemGroup({ items, evidenceByItem, canAct, onItem, busy, emptyText }: GroupProps) {
  const { t } = useTranslation()
  if (items.length === 0) return <p className="text-sm text-slate-400">{emptyText ?? t('requests.ia.empty.section')}</p>
  return (
    <ul className="space-y-2.5">
      {items.map((it) => (
        <ItemRow key={it.id} item={it} evidence={evidenceByItem.get(it.id) ?? []} canAct={canAct} busy={busy} onItem={onItem} />
      ))}
    </ul>
  )
}

const HUMAN_TONE: Record<IaHumanState, 'success' | 'pending' | 'info' | 'ai' | 'neutral'> = {
  accepted: 'success', edited: 'info', rejected: 'neutral', added_by_human: 'ai', pending: 'neutral',
}

function ItemRow({ item, evidence, canAct, busy, onItem }: { item: IaItem; evidence: IaEvidence[]; canAct: boolean; busy: boolean; onItem: BodyProps['onItem'] }) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.label ?? '')
  const rejected = item.human_state === 'rejected'

  return (
    <li className={`rounded-lg border px-3 py-2 ${rejected ? 'border-slate-200 bg-slate-50 opacity-60' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0">{KIND_ICON[item.kind] ?? <Scale className="h-4 w-4 text-slate-400" aria-hidden="true" />}</span>
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex items-center gap-2">
              <input value={draft} onChange={(e) => setDraft(e.target.value)} className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none" autoFocus />
              <button type="button" aria-label={t('requests.ia.actions.save')} className="text-emerald-600 hover:text-emerald-700" onClick={() => { onItem(item.id, 'edited', { label: draft }); setEditing(false) }}><Check className="h-4 w-4" /></button>
              <button type="button" aria-label={t('requests.ia.actions.cancel')} className="text-slate-400 hover:text-slate-600" onClick={() => { setDraft(item.label ?? ''); setEditing(false) }}><X className="h-4 w-4" /></button>
            </div>
          ) : (
            <p className={`text-sm text-slate-800 ${rejected ? 'line-through' : ''}`}>
              {item.human_state === 'edited' && item.human_value?.label ? str(item.human_value.label) : item.label || t('requests.ia.item.noLabel')}
            </p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            <span className="rounded bg-slate-100 px-1.5 py-0.5">{t(`requests.ia.origin.${item.origin}`)}</span>
            {item.due_date && <span className="inline-flex items-center gap-1 text-rose-700"><Clock className="h-3 w-3" aria-hidden="true" />{formatDate(item.due_date)}</span>}
            {item.confidence != null && <span>{t('requests.ia.item.confidence', { value: pct(item.confidence) })}</span>}
            {item.human_state !== 'pending' && <StatusPill tone={HUMAN_TONE[item.human_state]} dot={false}>{t(`requests.ia.humanState.${item.human_state}`)}</StatusPill>}
          </div>
          {evidence.length > 0 && (
            <ul className="mt-1.5 space-y-1 border-l-2 border-slate-100 pl-2">
              {evidence.map((e, i) => (
                <li key={i} className="text-xs text-slate-500">
                  <span className="font-medium text-slate-600">{e.original_name ?? t('requests.ia.evidence.document')}</span>
                  {e.page_no != null && ` · ${t('requests.ia.evidence.page', { page: e.page_no })}`}
                  {e.quote && <span className="mt-0.5 block italic text-slate-500">«{e.quote}»</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
        {canAct && !editing && (
          <div className="flex shrink-0 gap-1">
            <button type="button" aria-label={t('requests.ia.actions.accept')} title={t('requests.ia.actions.accept')} disabled={busy} className={`rounded p-1 hover:bg-emerald-50 ${item.human_state === 'accepted' ? 'text-emerald-600' : 'text-slate-400 hover:text-emerald-600'}`} onClick={() => onItem(item.id, 'accepted')}><ThumbsUp className="h-4 w-4" /></button>
            <button type="button" aria-label={t('requests.ia.actions.edit')} title={t('requests.ia.actions.edit')} disabled={busy} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /></button>
            <button type="button" aria-label={t('requests.ia.actions.discard')} title={t('requests.ia.actions.discard')} disabled={busy} className={`rounded p-1 hover:bg-slate-100 ${rejected ? 'text-slate-600' : 'text-slate-400 hover:text-slate-700'}`} onClick={() => onItem(item.id, rejected ? 'pending' : 'rejected')}><ThumbsDown className="h-4 w-4" /></button>
          </div>
        )}
      </div>
    </li>
  )
}
