// Feblio · Adaptador Google (Drive + Gmail) vía OAuth 2.0.
// Variables: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI (URL de esta función + /oauth/callback/google).
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { fetchWithTimeout, loadCredentials, requireEnv, saveCredentials, type Connection } from '../db.ts'

interface GoogleTokens {
  access_token: string
  refresh_token?: string
  expires_at: number
  scope?: string
}

const SCOPES: Record<string, string[]> = {
  google_drive: ['openid', 'email', 'https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive.metadata.readonly'],
  gmail: ['openid', 'email', 'https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.compose', 'https://www.googleapis.com/auth/gmail.send'],
}

export function googleAuthUrl(provider: string, state: string): string {
  const { GOOGLE_CLIENT_ID, GOOGLE_REDIRECT_URI } = requireEnv(['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'])
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  u.searchParams.set('client_id', GOOGLE_CLIENT_ID)
  u.searchParams.set('redirect_uri', GOOGLE_REDIRECT_URI)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('scope', (SCOPES[provider] ?? SCOPES.google_drive).join(' '))
  u.searchParams.set('access_type', 'offline')
  u.searchParams.set('prompt', 'consent')
  u.searchParams.set('include_granted_scopes', 'true')
  u.searchParams.set('state', state)
  return u.toString()
}

export async function googleExchangeCode(code: string): Promise<{ tokens: GoogleTokens; email: string }> {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = requireEnv(['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'])
  const r = await fetchWithTimeout('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, redirect_uri: GOOGLE_REDIRECT_URI, grant_type: 'authorization_code' }),
  })
  const j = await r.json()
  if (!r.ok || !j.access_token) throw new Error(`Google no devolvió tokens: ${j.error_description ?? j.error ?? r.status}`)
  const tokens: GoogleTokens = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + (j.expires_in ?? 3600) * 1000, scope: j.scope }
  const ui = await fetchWithTimeout('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` } })
  const info = ui.ok ? await ui.json() : {}
  return { tokens, email: info.email ?? '' }
}

/** Devuelve un access_token válido (refresca si caduca en < 2 min). */
export async function googleAccessToken(db: SupabaseClient, conn: Connection): Promise<string> {
  const creds = await loadCredentials<GoogleTokens>(db, conn)
  if (!creds) throw new Error('not_connected')
  if (creds.expires_at - Date.now() > 120_000) return creds.access_token
  if (!creds.refresh_token) throw new Error('expired')
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = requireEnv(['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'])
  const r = await fetchWithTimeout('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: creds.refresh_token, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, grant_type: 'refresh_token' }),
  })
  const j = await r.json()
  if (!r.ok || !j.access_token) throw new Error('expired')
  const next: GoogleTokens = { ...creds, access_token: j.access_token, expires_at: Date.now() + (j.expires_in ?? 3600) * 1000 }
  await saveCredentials(db, conn, conn.provider ?? 'google', next, new Date(next.expires_at).toISOString())
  return next.access_token
}

export async function googleRevoke(db: SupabaseClient, conn: Connection) {
  const creds = await loadCredentials<GoogleTokens>(db, conn)
  const token = creds?.refresh_token ?? creds?.access_token
  if (!token) return
  await fetchWithTimeout(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: 'POST' }).catch(() => undefined)
}

async function gapi(token: string, url: string, init: RequestInit = {}) {
  const r = await fetchWithTimeout(url, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } })
  const text = await r.text()
  const body = text ? JSON.parse(text) : {}
  if (!r.ok) throw new Error(body.error?.message ?? `HTTP ${r.status}`)
  return body
}

/* -------------------------------- Drive -------------------------------- */

export async function driveTest(token: string, rootFolderId?: string | null, write = true): Promise<Record<string, unknown>> {
  const about = await gapi(token, 'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress),storageQuota(limit,usage)')
  const details: Record<string, unknown> = { cuenta: about.user?.emailAddress }
  if (rootFolderId) {
    const f = await gapi(token, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(rootFolderId)}?fields=id,name,capabilities(canAddChildren)&supportsAllDrives=true`)
    details.carpeta_raiz = f.name
    if (f.capabilities && f.capabilities.canAddChildren === false) throw new Error('Sin permiso de escritura en la carpeta raíz elegida')
  }
  if (write) {
    // Prueba real de escritura: crea y borra una carpeta temporal
    const created = await gapi(token, 'https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
      method: 'POST',
      body: JSON.stringify({ name: '_feblio_prueba_permisos', mimeType: 'application/vnd.google-apps.folder', parents: rootFolderId ? [rootFolderId] : undefined }),
    })
    await gapi(token, `https://www.googleapis.com/drive/v3/files/${created.id}?supportsAllDrives=true`, { method: 'DELETE' })
    details.escritura = 'ok'
  }
  return details
}

export async function driveListFolders(token: string, parent = 'root'): Promise<{ id: string; name: string }[]> {
  const q = `mimeType='application/vnd.google-apps.folder' and '${parent.replace(/'/g, '')}' in parents and trashed=false`
  const r = await gapi(token, `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true`)
  return (r.files ?? []) as { id: string; name: string }[]
}

export async function driveCreatePath(token: string, path: string[], parent?: string | null): Promise<string> {
  let current = parent ?? 'root'
  for (const name of path) {
    const q = `mimeType='application/vnd.google-apps.folder' and name='${name.replace(/'/g, "\\'")}' and '${current}' in parents and trashed=false`
    const found = await gapi(token, `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`)
    if (found.files?.[0]?.id) {
      current = found.files[0].id
      continue
    }
    const created = await gapi(token, 'https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
      method: 'POST',
      body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [current] }),
    })
    current = created.id
  }
  return current
}

/* -------------------------------- Gmail -------------------------------- */

export async function gmailTest(token: string, labels: string[] = []): Promise<Record<string, unknown>> {
  const profile = await gapi(token, 'https://gmail.googleapis.com/gmail/v1/users/me/profile')
  const details: Record<string, unknown> = { cuenta: profile.emailAddress, mensajes: profile.messagesTotal }
  if (labels.length) {
    const l = await gapi(token, 'https://gmail.googleapis.com/gmail/v1/users/me/labels')
    const names = new Set((l.labels ?? []).map((x: { name: string }) => x.name.toLowerCase()))
    const missing = labels.filter((x) => !names.has(x.toLowerCase()))
    details.etiquetas_encontradas = labels.length - missing.length
    if (missing.length) details.etiquetas_no_encontradas = missing.join(', ')
  }
  return details
}

export async function gmailSend(token: string, to: string, subject: string, text: string, fromName?: string): Promise<void> {
  const mime = [`To: ${to}`, fromName ? `From: ${fromName} <me>` : '', `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`, 'Content-Type: text/plain; charset=UTF-8', '', text]
    .filter((l) => l !== '')
    .join('\r\n')
  const raw = btoa(unescape(encodeURIComponent(mime))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  await gapi(token, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST', body: JSON.stringify({ raw }) })
}
