// Feblio · Edge Function: worker del análisis inteligente de solicitudes (variante STUB).
//
// Drena la cola de solicitud_analisis_ia: toma trabajos con ia_analisis_tomar, construye una propuesta
// determinista (sin proveedor externo) y la persiste con ia_analisis_guardar. Pensada para ejecutarse
// desde un programador (pg_cron + pg_net, o un cron externo), NO desde el navegador.
//
// Seguridad: función server-to-server. Se protege con la cabecera `x-worker-secret` frente a WORKER_SECRET
// (fail closed: sin secreto configurado o sin coincidencia → 401). Usa la service role key; nunca se expone
// al cliente. No devuelve texto de excepción.
//
// Deploy (sin verify_jwt: la llama un programador, no un usuario):
//   supabase functions deploy analizar-solicitud --no-verify-jwt
//   supabase secrets set WORKER_SECRET=<cadena aleatoria de 32+ caracteres>
//
// Programar cada minuto (ejemplo con pg_cron + pg_net, si están disponibles):
//   select cron.schedule('feblio-analisis', '* * * * *', $$
//     select net.http_post(
//       url    := '<SUPABASE_URL>/functions/v1/analizar-solicitud',
//       headers:= jsonb_build_object('x-worker-secret', '<WORKER_SECRET>'))$$);
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  processQueue, type AnalysisPayload, type DocumentoRow, type JobRow, type SolicitudRow, type WorkerDeps,
} from '../_shared/analisis/worker.ts'

const SOL_COLS = 'id, empresa_id, title, description, service_type, form_data'
const DOC_COLS = 'id, original_name, mime_type, scan_status, deleted_at'

function deps(): WorkerDeps {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  return {
    async takeJob() {
      const { data, error } = await admin.rpc('ia_analisis_tomar', { p_lease_seconds: 300 })
      if (error) throw new Error(`take_${error.code ?? 'failed'}`)
      return (data as JobRow | null) ?? null
    },
    async getSolicitud(id) {
      const { data } = await admin.from('solicitudes').select(SOL_COLS).eq('id', id).maybeSingle()
      return (data as SolicitudRow | null) ?? null
    },
    async getDocumentos(solicitudId) {
      const { data } = await admin.from('solicitud_documentos').select(DOC_COLS).eq('solicitud_id', solicitudId).is('deleted_at', null)
      return (data as DocumentoRow[] | null) ?? []
    },
    async save(analisisId, payload: AnalysisPayload) {
      const { error } = await admin.rpc('ia_analisis_guardar', { p_analisis: analisisId, p_payload: payload })
      if (error) throw new Error(`save_${error.code ?? 'failed'}`)
    },
    log: (event, ctx) => console.error(event, ctx),
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response(JSON.stringify({ ok: false, code: 'method_not_allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
  }
  const secret = Deno.env.get('WORKER_SECRET')
  if (!secret || req.headers.get('x-worker-secret') !== secret) {
    return new Response(JSON.stringify({ ok: false, code: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }
  try {
    const result = await processQueue(deps(), { max: 10, deadlineMs: 55_000 })
    return new Response(JSON.stringify({ ok: true, ...result }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    console.error('analizar-solicitud: error inesperado', { reason: e instanceof Error ? e.name : 'unknown' })
    return new Response(JSON.stringify({ ok: false, code: 'error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
