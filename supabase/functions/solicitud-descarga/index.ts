// Feblio · Edge Function `solicitud-descarga` (PÚBLICA, solo POST)
//
// Descarga segura de un documento para el cliente que accede a su solicitud mediante enlace con
// token (sin cuenta). El navegador nunca recibe rutas de almacenamiento ni claves: esta función
// llama con service_role a la RPC `solicitud_acceso_documento`, que valida el hash del token, la
// caducidad, la revocación y que el documento pertenece exactamente a esa solicitud, está activo y
// es visible para el cliente. Solo entonces firma una URL de 5 minutos.
//
// Se despliega sin verificación de JWT (el acceso es por token de solicitud):
//   supabase functions deploy solicitud-descarga --no-verify-jwt
// Cualquier fallo de autorización responde 404 «Enlace no válido» (mensaje único) con el código estable
// `download_invalid`; el límite de frecuencia por IP y por acceso vive en la propia RPC (429,
// `download_rate_limited`). El frontend traduce por `code`. No se registra el token.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { downloadError, outcomeFromRpcError, parseDownloadRequest, rateKeyFromHeaders, safeDownloadName, SIGNED_URL_TTL_SECONDS } from '../_shared/solicitudes/descarga.ts'

const BUCKET = 'intake-files'
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return json(downloadError('download_bad_request'), 400)
  }
  const parsed = parseDownloadRequest(body)
  if (!parsed) return json(downloadError('download_bad_request'), 400)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data, error } = await admin.rpc('solicitud_acceso_documento', {
    p_token: parsed.token,
    p_documento: parsed.documentId,
    p_rate_key: rateKeyFromHeaders(req.headers),
  })
  if (error || !data || typeof data !== 'object') {
    const out = outcomeFromRpcError(error?.message, (error as { details?: string } | null)?.details)
    return json(out.body, out.status)
  }
  const doc = data as { storage_path?: unknown; original_name?: unknown }
  if (typeof doc.storage_path !== 'string') return json(downloadError('download_invalid'), 404)

  const name = safeDownloadName(doc.original_name)
  const signed = await admin.storage.from(BUCKET).createSignedUrl(doc.storage_path, SIGNED_URL_TTL_SECONDS, { download: name })
  if (signed.error || !signed.data?.signedUrl) {
    console.error('solicitud-descarga: no se pudo firmar la URL', { document: parsed.documentId, reason: signed.error?.message })
    return json(downloadError('download_invalid'), 404)
  }
  return json({ url: signed.data.signedUrl, name, expires_in: SIGNED_URL_TTL_SECONDS })
})
