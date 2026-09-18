// Feblio · Adaptador Microsoft (OneDrive/SharePoint + Microsoft 365 Outlook) vía OAuth 2.0 / Graph.
// Variables: MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_REDIRECT_URI, MICROSOFT_TENANT (opcional, 'common').
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { env, fetchWithTimeout, loadCredentials, requireEnv, saveCredentials, type Connection } from '../db.ts'

interface MsTokens {
  access_token: string
  refresh_token?: string
  expires_at: number
}

const SCOPES: Record<string, string[]> = {
  onedrive: ['offline_access', 'openid', 'email', 'User.Read', 'Files.ReadWrite', 'Sites.ReadWrite.All'],
  m365: ['offline_access', 'openid', 'email', 'User.Read', 'Mail.Read', 'Mail.ReadWrite', 'Mail.Send'],
}

const tenant = () => env('MICROSOFT_TENANT') ?? 'common'
const GRAPH = 'https://graph.microsoft.com/v1.0'

export function microsoftAuthUrl(provider: string, state: string): string {
  const { MICROSOFT_CLIENT_ID, MICROSOFT_REDIRECT_URI } = requireEnv(['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET', 'MICROSOFT_REDIRECT_URI'])
  const u = new URL(`https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/authorize`)
  u.searchParams.set('client_id', MICROSOFT_CLIENT_ID)
  u.searchParams.set('redirect_uri', MICROSOFT_REDIRECT_URI)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('response_mode', 'query')
  u.searchParams.set('scope', (SCOPES[provider] ?? SCOPES.onedrive).join(' '))
  u.searchParams.set('state', state)
  return u.toString()
}

async function tokenRequest(params: Record<string, string>): Promise<MsTokens> {
  const { MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_REDIRECT_URI } = requireEnv(['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET', 'MICROSOFT_REDIRECT_URI'])
  const r = await fetchWithTimeout(`https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: MICROSOFT_CLIENT_ID, client_secret: MICROSOFT_CLIENT_SECRET, redirect_uri: MICROSOFT_REDIRECT_URI, ...params }),
  })
  const j = await r.json()
  if (!r.ok || !j.access_token) throw new Error(`Microsoft no devolvió tokens: ${j.error_description ?? j.error ?? r.status}`)
  return { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + (j.expires_in ?? 3600) * 1000 }
}

export async function microsoftExchangeCode(code: string, provider: string): Promise<{ tokens: MsTokens; email: string }> {
  const tokens = await tokenRequest({ code, grant_type: 'authorization_code', scope: (SCOPES[provider] ?? SCOPES.onedrive).join(' ') })
  const me = await graph(tokens.access_token, '/me')
  return { tokens, email: me.mail ?? me.userPrincipalName ?? '' }
}

export async function microsoftAccessToken(db: SupabaseClient, conn: Connection): Promise<string> {
  const creds = await loadCredentials<MsTokens>(db, conn)
  if (!creds) throw new Error('not_connected')
  if (creds.expires_at - Date.now() > 120_000) return creds.access_token
  if (!creds.refresh_token) throw new Error('expired')
  let next: MsTokens
  try {
    next = await tokenRequest({ refresh_token: creds.refresh_token, grant_type: 'refresh_token', scope: (SCOPES[conn.provider ?? 'onedrive'] ?? SCOPES.onedrive).join(' ') })
  } catch {
    throw new Error('expired')
  }
  next.refresh_token = next.refresh_token ?? creds.refresh_token
  await saveCredentials(db, conn, conn.provider ?? 'microsoft', next, new Date(next.expires_at).toISOString())
  return next.access_token
}

export async function graph(token: string, path: string, init: RequestInit = {}) {
  const r = await fetchWithTimeout(`${GRAPH}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } })
  const text = await r.text()
  const body = text ? JSON.parse(text) : {}
  if (!r.ok) throw new Error(body.error?.message ?? `HTTP ${r.status}`)
  return body
}

/* ------------------------------ OneDrive ------------------------------ */

export async function onedriveTest(token: string, rootId?: string | null, write = true): Promise<Record<string, unknown>> {
  const drive = await graph(token, '/me/drive?$select=id,driveType,owner')
  const details: Record<string, unknown> = { tipo: drive.driveType, cuenta: drive.owner?.user?.displayName ?? drive.owner?.user?.email }
  const base = rootId ? `/me/drive/items/${encodeURIComponent(rootId)}` : '/me/drive/root'
  if (rootId) {
    const f = await graph(token, `${base}?$select=name`)
    details.carpeta_raiz = f.name
  }
  if (write) {
    const created = await graph(token, `${base}/children`, {
      method: 'POST',
      body: JSON.stringify({ name: '_feblio_prueba_permisos', folder: {}, '@microsoft.graph.conflictBehavior': 'replace' }),
    })
    await graph(token, `/me/drive/items/${created.id}`, { method: 'DELETE' })
    details.escritura = 'ok'
  }
  return details
}

export async function onedriveListFolders(token: string, parent?: string | null): Promise<{ id: string; name: string }[]> {
  const base = parent ? `/me/drive/items/${encodeURIComponent(parent)}` : '/me/drive/root'
  const r = await graph(token, `${base}/children?$select=id,name,folder&$top=100`)
  return ((r.value ?? []) as { id: string; name: string; folder?: unknown }[]).filter((x) => x.folder).map((x) => ({ id: x.id, name: x.name }))
}

export async function onedriveCreatePath(token: string, path: string[], parent?: string | null): Promise<string> {
  let current = parent ? `/me/drive/items/${encodeURIComponent(parent)}` : '/me/drive/root'
  let id = parent ?? 'root'
  for (const name of path) {
    const created = await graph(token, `${current}/children`, {
      method: 'POST',
      body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'replace' }),
    })
    id = created.id
    current = `/me/drive/items/${encodeURIComponent(id)}`
  }
  return id
}

/* ------------------------------ Outlook ------------------------------- */

export async function outlookTest(token: string, folders: string[] = []): Promise<Record<string, unknown>> {
  const me = await graph(token, '/me?$select=mail,userPrincipalName')
  const details: Record<string, unknown> = { cuenta: me.mail ?? me.userPrincipalName }
  if (folders.length) {
    const r = await graph(token, '/me/mailFolders?$select=displayName&$top=100')
    const names = new Set((r.value ?? []).map((x: { displayName: string }) => x.displayName.toLowerCase()))
    const missing = folders.filter((x) => !names.has(x.toLowerCase()))
    details.carpetas_encontradas = folders.length - missing.length
    if (missing.length) details.carpetas_no_encontradas = missing.join(', ')
  }
  return details
}

export async function outlookSend(token: string, to: string, subject: string, text: string): Promise<void> {
  await graph(token, '/me/sendMail', {
    method: 'POST',
    body: JSON.stringify({ message: { subject, body: { contentType: 'Text', content: text }, toRecipients: [{ emailAddress: { address: to } }] }, saveToSentItems: true }),
  })
}
