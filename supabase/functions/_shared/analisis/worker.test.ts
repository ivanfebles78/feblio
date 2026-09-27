// Feblio · Pruebas del worker de análisis (stub, sin red). Ejecutar con:
//   cd supabase/functions && deno test _shared/analisis/worker.test.ts
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  buildProposal, classify, combinedText, findExplicitDate, processQueue,
  type AnalysisPayload, type DocumentoRow, type JobRow, type SolicitudRow, type WorkerDeps,
} from './worker.ts'

const EMP = '11111111-1111-4111-8111-111111111111'
const SOL = '22222222-2222-4222-8222-222222222222'
const DOC1 = '33333333-3333-4333-8333-333333333333'
const DOC2 = '44444444-4444-4444-8444-444444444444'

const ITEM_KINDS = new Set(['party', 'issuer', 'reference', 'notified_on', 'deadline', 'action', 'risk', 'missing_info', 'missing_document', 'question', 'service', 'received_document'])
const ORIGINS = new Set(['explicit', 'inferred', 'computed'])

function sol(over: Partial<SolicitudRow> = {}): SolicitudRow {
  return { id: SOL, empresa_id: EMP, title: 'Asunto', description: null, service_type: null, form_data: {}, ...over }
}

Deno.test('classify: requerimiento judicial vs administrativo', () => {
  assertEquals(classify(combinedText(sol({ description: 'Requerimiento del juzgado de primera instancia' }))).primary, 'requerimiento_judicial')
  const admin = classify(combinedText(sol({ description: 'Requerimiento de la agencia tributaria' })))
  assertEquals(admin.primary, 'requerimiento_administrativo')
  assert(admin.formal)
  assertEquals(admin.reqClass, 'administrativo')
})

Deno.test('classify: presupuesto, consulta y ambigua', () => {
  assertEquals(classify(combinedText(sol({ description: 'Necesito un presupuesto' }))).primary, 'presupuesto')
  assertEquals(classify(combinedText(sol({ description: 'Tengo una consulta' }))).primary, 'consulta')
  assertEquals(classify(combinedText(sol({ description: 'Hola' }))).primary, 'ambigua')
})

Deno.test('findExplicitDate: varios formatos', () => {
  assertEquals(findExplicitDate('antes del 15/10/2026'), '2026-10-15')
  assertEquals(findExplicitDate('fecha 2026-03-09 límite'), '2026-03-09')
  assertEquals(findExplicitDate('sin fechas'), null)
  assertEquals(findExplicitDate('mes 13/40/2026'), null)
})

Deno.test('buildProposal: documentos, plazo, faltantes, preguntas y salida cerrada', () => {
  const docs: DocumentoRow[] = [
    { id: DOC1, original_name: 'requerimiento.pdf', mime_type: 'application/pdf', scan_status: 'pending', deleted_at: null },
    { id: DOC2, original_name: 'borrado.pdf', mime_type: 'application/pdf', scan_status: 'clean', deleted_at: '2026-01-01' },
  ]
  const p = buildProposal(sol({ description: 'Requerimiento del ayuntamiento, contestar antes del 20/10/2026' }), docs)

  assertEquals(p.status, 'generated')
  assertEquals(p.primary_type, 'requerimiento_administrativo')
  assert(p.has_formal_requirement)
  assertEquals(p.provider, 'stub')
  assert(p.warnings.some((w) => w.code === 'stub_provider'))

  const received = p.items.filter((i) => i.kind === 'received_document')
  assertEquals(received.length, 1) // el borrado se excluye
  assertEquals(received[0].evidence?.[0]?.documento_id, DOC1)

  const deadlines = p.items.filter((i) => i.kind === 'deadline')
  assertEquals(deadlines.length, 1)
  assertEquals(deadlines[0].deadline_kind, 'expreso')
  assertEquals(deadlines[0].due_date, '2026-10-20')

  assert(p.items.some((i) => i.kind === 'question'))

  // Salida cerrada: todos los kind/origin son válidos y confidence ∈ [0,1].
  for (const it of p.items) {
    assert(ITEM_KINDS.has(it.kind), `kind inválido: ${it.kind}`)
    assert(ORIGINS.has(it.origin), `origin inválido: ${it.origin}`)
    if (it.confidence != null) assert(it.confidence >= 0 && it.confidence <= 1)
    if (it.kind === 'deadline') assert(it.deadline_kind === 'expreso' || it.deadline_kind === 'calculado')
  }
})

Deno.test('buildProposal: sin descripción marca información faltante', () => {
  const p = buildProposal(sol({ description: null, form_data: {} }), [])
  assert(p.items.some((i) => i.kind === 'missing_info'))
})

Deno.test('processQueue: drena la cola y persiste propuestas', async () => {
  const jobs: JobRow[] = [
    { id: 'a1', solicitud_id: SOL, empresa_id: EMP, version: 1, status: 'running' },
    { id: 'a2', solicitud_id: SOL, empresa_id: EMP, version: 1, status: 'running' },
  ]
  const saved: { id: string; status: string }[] = []
  const deps: WorkerDeps = {
    takeJob: () => Promise.resolve(jobs.shift() ?? null),
    getSolicitud: () => Promise.resolve(sol({ description: 'consulta' })),
    getDocumentos: () => Promise.resolve([]),
    save: (id, payload: AnalysisPayload) => { saved.push({ id, status: payload.status }); return Promise.resolve() },
    log: () => {},
  }
  const res = await processQueue(deps, { max: 10, deadlineMs: 5000 })
  assertEquals(res.processed, 2)
  assertEquals(res.failed, 0)
  assertEquals(saved.map((s) => s.id), ['a1', 'a2'])
  assert(saved.every((s) => s.status === 'generated'))
})

Deno.test('processQueue: solicitud inexistente se marca como fallida', async () => {
  let taken = false
  const saved: AnalysisPayload[] = []
  const deps: WorkerDeps = {
    takeJob: () => { if (taken) return Promise.resolve(null); taken = true; return Promise.resolve({ id: 'a1', solicitud_id: SOL, empresa_id: EMP, version: 1, status: 'running' }) },
    getSolicitud: () => Promise.resolve(null),
    getDocumentos: () => Promise.resolve([]),
    save: (_id, payload: AnalysisPayload) => { saved.push(payload); return Promise.resolve() },
    log: () => {},
  }
  const res = await processQueue(deps, {})
  assertEquals(res.processed, 0)
  assertEquals(res.failed, 1)
  assertEquals(saved[0].status, 'failed')
})
