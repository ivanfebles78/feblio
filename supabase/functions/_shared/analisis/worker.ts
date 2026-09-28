// Feblio · Worker de análisis inteligente (fase 2-3, variante STUB).
//
// Toma trabajos de la cola (ia_analisis_tomar), construye una PROPUESTA determinista a partir del
// formulario y los documentos adjuntos, y la persiste con ia_analisis_guardar. NO envía nada a ningún
// proveedor externo: el analizador es un stub reproducible que produce salida cerrada (enumeraciones
// válidas), pensado para encender la pestaña de análisis de punta a punta y para que enchufar un LLM
// real (Claude vía Bedrock UE u otro) sea un cambio de proveedor, no de contrato.
//
// Principios que ya respeta el stub y que el proveedor real deberá mantener:
//   · Nada se inventa: no propone servicios que no existan en el catálogo (aquí no propone ninguno).
//   · Todo plazo obliga a revisión humana (lo fuerza ia_analisis_guardar).
//   · Salida cerrada: kind/origin/deadline_kind son de un conjunto fijo.
//   · Los documentos son datos, nunca instrucciones (el stub no interpreta su contenido).

export const STUB_PROVIDER = 'stub'
export const STUB_MODEL = 'deterministic-v1'

export type PrimaryType =
  | 'requerimiento_judicial' | 'requerimiento_administrativo' | 'consulta'
  | 'presupuesto' | 'encargo' | 'mixta' | 'ambigua'

export interface SolicitudRow {
  id: string
  empresa_id: string
  title: string | null
  description: string | null
  service_type: string | null
  form_data: Record<string, unknown> | null
}

export interface DocumentoRow {
  id: string
  original_name: string | null
  mime_type: string | null
  scan_status: string | null
  deleted_at: string | null
}

export interface AnalysisItemPayload {
  kind: string
  origin: 'explicit' | 'inferred' | 'computed'
  label: string
  value?: Record<string, unknown>
  service_code?: string
  deadline_kind?: 'expreso' | 'calculado'
  due_date?: string
  confidence?: number
  sort_order?: number
  evidence?: { documento_id: string; page_no?: number; quote?: string }[]
}

export interface AnalysisPayload {
  status: 'generated' | 'partial' | 'failed'
  provider: string
  model: string
  primary_type: PrimaryType
  secondary_types: string[]
  has_formal_requirement: boolean
  requirement_class: 'judicial' | 'administrativo' | 'otro' | null
  summary: string
  summary_lang: 'es' | 'en'
  confidence_document: number
  warnings: { code: string; value?: string }[]
  input_tokens: number
  output_tokens: number
  ocr_pages: number
  cost_micros: number
  items: AnalysisItemPayload[]
}

export interface JobRow {
  id: string
  solicitud_id: string
  empresa_id: string
  version: number
  status: string
}

export interface WorkerDeps {
  takeJob(): Promise<JobRow | null>
  getSolicitud(id: string): Promise<SolicitudRow | null>
  getDocumentos(solicitudId: string): Promise<DocumentoRow[]>
  save(analisisId: string, payload: AnalysisPayload): Promise<void>
  log(event: string, ctx: Record<string, unknown>): void
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Texto combinado del formulario y los datos de la solicitud, en minúsculas y sin acentos. */
export function combinedText(sol: SolicitudRow): string {
  const parts: string[] = [sol.title ?? '', sol.description ?? '', sol.service_type ?? '']
  for (const v of Object.values(sol.form_data ?? {})) if (typeof v === 'string') parts.push(v)
  return norm(parts.join(' \n '))
}

/** Clasificación determinista por palabras clave. Baja confianza: es un stub, no un modelo. */
export function classify(text: string): { primary: PrimaryType; formal: boolean; reqClass: AnalysisPayload['requirement_class'] } {
  const has = (...w: string[]) => w.some((x) => text.includes(x))
  if (has('requerimiento', 'notificacion', 'emplazamiento')) {
    if (has('juzgado', 'judicial', 'tribunal', 'demanda', 'procurador')) return { primary: 'requerimiento_judicial', formal: true, reqClass: 'judicial' }
    return { primary: 'requerimiento_administrativo', formal: true, reqClass: 'administrativo' }
  }
  if (has('presupuesto', 'cotizacion', 'cuanto cuesta', 'precio')) return { primary: 'presupuesto', formal: false, reqClass: null }
  if (has('consulta', 'duda', 'pregunta', 'asesoramiento')) return { primary: 'consulta', formal: false, reqClass: null }
  return { primary: 'ambigua', formal: false, reqClass: null }
}

/** Primera fecha explícita dd/mm/aaaa o aaaa-mm-dd; ISO (aaaa-mm-dd) o null. */
export function findExplicitDate(text: string): string | null {
  const dmy = text.match(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})\b/)
  if (dmy) {
    const [, d, m, y] = dmy
    const dd = d.padStart(2, '0'), mm = m.padStart(2, '0')
    if (+mm >= 1 && +mm <= 12 && +dd >= 1 && +dd <= 31) return `${y}-${mm}-${dd}`
  }
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  if (iso && +iso[2] >= 1 && +iso[2] <= 12) return `${iso[1]}-${iso[2]}-${iso[3]}`
  return null
}

/**
 * Propuesta determinista. No interpreta el contenido de los documentos (solo los enumera como
 * recibidos) ni propone servicios. Marca todo como necesitado de revisión humana.
 */
export function buildProposal(sol: SolicitudRow, docs: DocumentoRow[]): AnalysisPayload {
  const text = combinedText(sol)
  const { primary, formal, reqClass } = classify(text)
  const items: AnalysisItemPayload[] = []
  let order = 0

  // Documentos recibidos: hecho verificable, con evidencia al propio documento.
  const liveDocs = docs.filter((d) => !d.deleted_at)
  for (const d of liveDocs) {
    items.push({
      kind: 'received_document', origin: 'explicit', label: d.original_name ?? 'documento',
      value: { mime: d.mime_type ?? null, scan_status: d.scan_status ?? 'pending' },
      confidence: 1, sort_order: order++, evidence: [{ documento_id: d.id }],
    })
  }

  // Plazo expreso si hay una fecha en el texto (siempre exige revisión humana).
  const due = findExplicitDate(text)
  if (due) {
    items.push({
      kind: 'deadline', origin: 'explicit', label: 'Fecha detectada en el texto de la solicitud',
      deadline_kind: 'expreso', due_date: due, confidence: 0.5, sort_order: order++,
    })
  }

  // Información básica que falta (sin duplicar el chequeo determinista: solo señales de alto valor).
  const fd = sol.form_data ?? {}
  const empty = (k: string) => !(typeof fd[k] === 'string' && (fd[k] as string).trim().length > 0)
  if (empty('needs') && !(sol.description ?? '').trim()) {
    items.push({ kind: 'missing_info', origin: 'inferred', label: 'Descripción de la necesidad o del asunto', confidence: 0.6, sort_order: order++ })
  }
  if (empty('timeline')) {
    items.push({ kind: 'missing_info', origin: 'inferred', label: 'Plazo o fecha límite del cliente', confidence: 0.5, sort_order: order++ })
  }

  // Preguntas sugeridas genéricas (seguras, no dependen del contenido de documentos).
  items.push({ kind: 'question', origin: 'inferred', label: '¿Cuál es la fecha límite o el plazo aplicable?', confidence: 0.5, sort_order: order++ })
  items.push({ kind: 'question', origin: 'inferred', label: '¿Dispone de toda la documentación relacionada con el asunto?', confidence: 0.5, sort_order: order++ })

  const summary = formal
    ? `Posible ${primary === 'requerimiento_judicial' ? 'requerimiento judicial' : 'requerimiento administrativo'} sobre «${sol.title ?? ''}». Revisa el plazo y la documentación antes de actuar.`
    : `Solicitud de tipo «${primary}» sobre «${sol.title ?? ''}». Propuesta preliminar; requiere revisión.`

  return {
    status: 'generated', provider: STUB_PROVIDER, model: STUB_MODEL,
    primary_type: primary, secondary_types: [], has_formal_requirement: formal, requirement_class: reqClass,
    summary, summary_lang: 'es', confidence_document: 0.4,
    warnings: [{ code: 'stub_provider' }],
    input_tokens: 0, output_tokens: 0, ocr_pages: 0, cost_micros: 0,
    items,
  }
}

/**
 * Drena la cola: toma trabajos y persiste su propuesta hasta agotar la cola, alcanzar `max`
 * trabajos o quedarse sin tiempo (`deadlineMs`). Cada fallo se registra y no detiene el resto.
 */
export async function processQueue(deps: WorkerDeps, opts: { max?: number; deadlineMs?: number } = {}): Promise<{ processed: number; failed: number }> {
  const max = Math.max(1, Math.min(50, opts.max ?? 10))
  const until = Date.now() + Math.max(1000, opts.deadlineMs ?? 55_000)
  let processed = 0, failed = 0

  for (let i = 0; i < max && Date.now() < until; i++) {
    const job = await deps.takeJob()
    if (!job) break
    try {
      const sol = await deps.getSolicitud(job.solicitud_id)
      if (!sol) {
        await deps.save(job.id, failurePayload('solicitud_not_found'))
        failed++
        continue
      }
      const docs = await deps.getDocumentos(job.solicitud_id)
      await deps.save(job.id, buildProposal(sol, docs))
      processed++
      deps.log('analysis.worker.done', { analisis_id: job.id, solicitud_id: job.solicitud_id, version: job.version })
    } catch (e) {
      failed++
      deps.log('analysis.worker.error', { analisis_id: job.id, reason: e instanceof Error ? e.name : 'unknown' })
      try {
        await deps.save(job.id, failurePayload('worker_error'))
      } catch {
        /* el barrido de leases caducados lo reintentará */
      }
    }
  }
  return { processed, failed }
}

function failurePayload(code: string): AnalysisPayload {
  return {
    status: 'failed', provider: STUB_PROVIDER, model: STUB_MODEL,
    primary_type: 'ambigua', secondary_types: [], has_formal_requirement: false, requirement_class: null,
    summary: '', summary_lang: 'es', confidence_document: 0,
    warnings: [{ code }], input_tokens: 0, output_tokens: 0, ocr_pages: 0, cost_micros: 0, items: [],
  }
}
