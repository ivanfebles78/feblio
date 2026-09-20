// Feblio · Pruebas de la lógica pura de `solicitud-descarga` (sin red ni Supabase).
// Ejecutar con:  cd supabase/functions && deno test _shared/solicitudes/descarga.test.ts
// Se ejecuta en CI (job edge-security de .github/workflows/ci.yml).
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { NEUTRAL_ERROR, outcomeFromRpcError, parseDownloadRequest, rateKeyFromHeaders, safeDownloadName, SIGNED_URL_TTL_SECONDS } from './descarga.ts'

const TOKEN = 'RF7tEGHpLnl8baFnLZRLtUlmizAf7SdsP7y4ZcpT_KI' // 43 chars base64url (forma, no un token real)
const DOC = '2b1f0c6e-8f3a-4c1d-9e2b-7a5d4c3b2a10'

Deno.test('petición correcta: token base64url y documento uuid', () => {
  const r = parseDownloadRequest({ token: TOKEN, document_id: DOC.toUpperCase() })
  assert(r)
  assertEquals(r.token, TOKEN)
  assertEquals(r.documentId, DOC)
})

Deno.test('token manipulado o de forma inválida → rechazado antes de tocar la base de datos', () => {
  for (const bad of ['', 'corto', TOKEN + '!', TOKEN + ' ', 'a'.repeat(129), 42, null, undefined, { $ne: '' }]) {
    assertEquals(parseDownloadRequest({ token: bad, document_id: DOC }), null, `token ${JSON.stringify(bad)}`)
  }
})

Deno.test('documento inválido (no uuid, inyección, vacío) → rechazado', () => {
  for (const bad of ['', '123', DOC + "' or 1=1", 'sol/x/y.pdf', 7, null]) {
    assertEquals(parseDownloadRequest({ token: TOKEN, document_id: bad }), null)
  }
  assertEquals(parseDownloadRequest(null), null)
  assertEquals(parseDownloadRequest('texto'), null)
})

Deno.test('cualquier fallo de autorización se traduce a 404 neutro; límite de frecuencia a 429', () => {
  for (const msg of ['Enlace no válido', 'permission denied for function', 'row not found', undefined, null, '']) {
    const out = outcomeFromRpcError(msg)
    assertEquals(out.status, 404)
    assertEquals(out.body, { error: NEUTRAL_ERROR })
  }
  const limited = outcomeFromRpcError('Demasiadas solicitudes. Inténtalo en unos minutos.')
  assertEquals(limited.status, 429)
})

Deno.test('clave de frecuencia: primera IP de X-Forwarded-For, saneada; sin cabecera → unknown', () => {
  assertEquals(rateKeyFromHeaders(new Headers({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' })), '203.0.113.9')
  assertEquals(rateKeyFromHeaders(new Headers({ 'x-forwarded-for': '2001:db8::1' })), '2001:db8::1')
  assertEquals(rateKeyFromHeaders(new Headers({ 'x-forwarded-for': "1.2.3.4'; drop table" })), 'unknown')
  assertEquals(rateKeyFromHeaders(new Headers({ 'x-forwarded-for': 'evil.example' })), 'unknown')
  assertEquals(rateKeyFromHeaders(new Headers()), 'unknown')
})

Deno.test('nombre de descarga sin rutas ni caracteres de control; TTL máximo 5 minutos', () => {
  assertEquals(safeDownloadName('../../etc/passwd'), 'passwd')
  assertEquals(safeDownloadName('C:\\planos\\"final".pdf'), 'final.pdf')
  assertEquals(safeDownloadName('plano\u0000.pdf'), 'plano.pdf')
  assertEquals(safeDownloadName(''), 'archivo')
  assertEquals(safeDownloadName(null), 'archivo')
  assert(SIGNED_URL_TTL_SECONDS <= 300)
})
