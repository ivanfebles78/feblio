// Feblio · Cifrado de credenciales (AES-256-GCM) y firma de estados OAuth (HMAC-SHA256).
// Clave: APP_ENCRYPTION_KEY (cualquier cadena larga y aleatoria; se deriva con SHA-256).
// Los secretos cifrados se guardan en integration_credentials; nunca se devuelven al cliente.

const enc = new TextEncoder()
const dec = new TextDecoder()

function b64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}
function unb64(s: string) {
  // Se construye sobre un ArrayBuffer explícito para satisfacer BufferSource en TS ≥ 5.7 y Deno
  const bin = atob(s)
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
function b64url(buf: ArrayBuffer | Uint8Array): string {
  return b64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function unb64url(s: string) {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  return unb64(s.replace(/-/g, '+').replace(/_/g, '/') + pad)
}

export function requireEncryptionKey(): string {
  const k = Deno.env.get('APP_ENCRYPTION_KEY')
  if (!k || k.length < 16) throw new MissingEnvError(['APP_ENCRYPTION_KEY'])
  return k
}

export class MissingEnvError extends Error {
  constructor(public readonly missing: string[]) {
    super(`Faltan variables de entorno: ${missing.join(', ')}`)
    this.name = 'MissingEnvError'
  }
}

async function aesKey(): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest('SHA-256', enc.encode(requireEncryptionKey()))
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

export async function encryptJson(payload: unknown): Promise<{ ciphertext: string; iv: string }> {
  const key = await aesKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = enc.encode(JSON.stringify(payload))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data)
  return { ciphertext: b64(ct), iv: b64(iv) }
}

export async function decryptJson<T = Record<string, unknown>>(ciphertext: string, iv: string): Promise<T> {
  const key = await aesKey()
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(ciphertext))
  return JSON.parse(dec.decode(pt)) as T
}

async function hmacKey(): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest('SHA-256', enc.encode('state:' + requireEncryptionKey()))
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

/** Firma un estado OAuth (caduca en 10 minutos). */
export async function signState(payload: Record<string, unknown>): Promise<string> {
  const body = enc.encode(JSON.stringify({ ...payload, exp: Date.now() + 10 * 60 * 1000, nonce: crypto.randomUUID() }))
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(), body)
  return `${b64url(body)}.${b64url(sig)}`
}

export async function verifyState<T extends Record<string, unknown>>(state: string): Promise<T> {
  const [b, s] = state.split('.')
  if (!b || !s) throw new Error('Estado OAuth mal formado')
  const body = unb64url(b)
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(), unb64url(s), body)
  if (!ok) throw new Error('Firma del estado OAuth no válida')
  const payload = JSON.parse(dec.decode(body)) as T & { exp: number }
  if (typeof payload.exp !== 'number' || payload.exp < Date.now()) throw new Error('El estado OAuth ha caducado')
  return payload
}

export function b64encode(s: string): string {
  return b64(enc.encode(s))
}
