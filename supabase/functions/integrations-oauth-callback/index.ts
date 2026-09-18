// Feblio · Edge Function `integrations-oauth-callback` (PÚBLICA, solo GET)
//
// Destino de la redirección OAuth de Google y Microsoft. No lleva JWT de usuario
// (el navegador llega desde el proveedor), por eso se despliega con:
//   supabase functions deploy integrations-oauth-callback --no-verify-jwt
// La identidad del tenant y del usuario viaja en el parámetro `state`, firmado con
// HMAC-SHA256 (APP_ENCRYPTION_KEY) y con caducidad de 10 minutos; se verifica antes
// de tocar la base de datos. Nunca devuelve tokens: guarda credenciales cifradas y
// redirige a APP_URL/integraciones/callback con solo kind/status/message.
//
// Rutas: /integrations-oauth-callback/google · /integrations-oauth-callback/microsoft
// (registrar como GOOGLE_REDIRECT_URI / MICROSOFT_REDIRECT_URI).
import { admin, applyTestResult, audit, env, getConnection, loadCredentials, saveCredentials, updateConnection, type Kind } from '../_shared/integrations/db.ts'
import { verifyState } from '../_shared/integrations/crypto.ts'
import * as google from '../_shared/integrations/providers/google.ts'
import * as ms from '../_shared/integrations/providers/microsoft.ts'
import { labelsOf, rootOf } from '../_shared/integrations/settings.ts'

Deno.serve(async (req) => {
  const url = new URL(req.url)
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 })
  const m = url.pathname.match(/\/(google|microsoft)$/)
  if (!m) return new Response('Not found', { status: 404 })
  return oauthCallback(req, m[1], url)
})

async function oauthCallback(req: Request, family: string, url: URL): Promise<Response> {
  const appUrl = env('APP_URL')
  const redirect = (kind: string, status: string, message = '') => {
    const target = new URL('/integraciones/callback', appUrl ?? url.origin)
    target.searchParams.set('kind', kind)
    target.searchParams.set('status', status)
    if (message) target.searchParams.set('message', message.slice(0, 200))
    return new Response(null, { status: 302, headers: { Location: target.toString() } })
  }
  const stateRaw = url.searchParams.get('state') ?? ''
  let state: { e: string; u: string; k: Kind; p: string; r: string }
  try {
    state = await verifyState(stateRaw)
  } catch (e) {
    return redirect('', 'error', e instanceof Error ? e.message : 'Estado no válido')
  }
  // El proveedor del estado firmado debe corresponder a la familia de la URL de callback
  const FAMILY: Record<string, string[]> = { google: ['google_drive', 'gmail'], microsoft: ['onedrive', 'm365'] }
  if (!FAMILY[family]?.includes(state.p)) return redirect(state.k, 'error', 'Proveedor no coincide con el callback')
  const db = admin()
  const conn = await getConnection(db, state.e, state.k)
  const providerError = url.searchParams.get('error')
  const code = url.searchParams.get('code')
  if (providerError || !code) {
    await updateConnection(db, conn.id, conn.empresa_id, { status: 'error', last_error: `OAuth cancelado o denegado: ${providerError ?? 'sin código'}` })
    await audit(db, state.e, state.u, 'integration.oauth_failed', conn.id, 'error', { provider: state.p, error: providerError }, req)
    return redirect(state.k, 'error', 'Autorización cancelada o denegada')
  }
  try {
    let email = ''
    let details: Record<string, unknown>
    if (family === 'google') {
      const ex = await google.googleExchangeCode(code)
      email = ex.email
      await saveCredentials(db, conn, state.p, ex.tokens, new Date(ex.tokens.expires_at).toISOString())
      const token = ex.tokens.access_token
      details = state.p === 'gmail' ? await google.gmailTest(token, labelsOf(conn)) : await google.driveTest(token, rootOf(conn))
    } else {
      const ex = await ms.microsoftExchangeCode(code, state.p)
      email = ex.email
      await saveCredentials(db, conn, state.p, ex.tokens, new Date(ex.tokens.expires_at).toISOString())
      details = state.p === 'm365' ? await ms.outlookTest(ex.tokens.access_token, labelsOf(conn)) : await ms.onedriveTest(ex.tokens.access_token, rootOf(conn))
    }
    const creds = await loadCredentials<{ expires_at: number }>(db, conn)
    await applyTestResult(db, conn, { userId: state.u, empresaId: state.e, role: 'empresa' }, 'oauth', true, details, req, {
      provider: state.p,
      account_identifier: email || conn.account_identifier,
      display_name: email || null,
      token_expires_at: creds ? new Date(creds.expires_at).toISOString() : null,
      last_activity_at: new Date().toISOString(),
    })
    await audit(db, state.e, state.u, 'integration.connected', conn.id, 'ok', { kind: state.k, provider: state.p, account: email }, req)
    return redirect(state.k, 'connected')
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Error'
    await updateConnection(db, conn.id, conn.empresa_id, { status: 'error', last_error: message.slice(0, 500), provider: state.p })
    await audit(db, state.e, state.u, 'integration.oauth_failed', conn.id, 'error', { provider: state.p, error: message.slice(0, 200) }, req)
    return redirect(state.k, 'error', message)
  }
}

