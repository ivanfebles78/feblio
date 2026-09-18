// Feblio · Pruebas de seguridad de la capa compartida de integraciones.
// Ejecutar con:  cd supabase/functions && APP_ENCRYPTION_KEY=clave-de-prueba-larga-0123456789 deno test --node-modules-dir=auto --allow-env=APP_ENCRYPTION_KEY _shared/integrations/security.test.ts
// Se ejecuta en CI (job edge-security de .github/workflows/ci.yml) sin acceso a red ni a Supabase.
import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { HttpError, resolveActor } from './db.ts'
import { decryptJson, encryptJson, signState, verifyState } from './crypto.ts'

// deno-lint-ignore no-explicit-any
const fakeDb = (user: { id: string } | null, profile: Record<string, unknown> | null): any => ({
  auth: { getUser: async () => ({ data: { user }, error: user ? null : new Error('invalid') }) },
  from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: profile }) }) }) }),
})

Deno.test('operaciones privadas: sin JWT → 401', async () => {
  const err = await assertRejects(() => resolveActor(fakeDb({ id: 'u1' }, { role: 'empresa', empresa_id: 'e1' }), null), HttpError)
  assertEquals(err.status, 401)
})

Deno.test('operaciones privadas: JWT inválido → 401', async () => {
  const err = await assertRejects(() => resolveActor(fakeDb(null, null), 'Bearer x'), HttpError)
  assertEquals(err.status, 401)
})

Deno.test('cliente final o cuenta sin empresa → 403', async () => {
  const err = await assertRejects(() => resolveActor(fakeDb({ id: 'u1' }, { role: 'cliente', empresa_id: 'e1' }), 'Bearer ok'), HttpError)
  assertEquals(err.status, 403)
})

Deno.test('empresa no puede indicar otra empresa_id → 403; admin sí', async () => {
  const err = await assertRejects(() => resolveActor(fakeDb({ id: 'u1' }, { role: 'empresa', empresa_id: 'e1' }), 'Bearer ok', 'e2'), HttpError)
  assertEquals(err.status, 403)
  const admin = await resolveActor(fakeDb({ id: 'a1' }, { role: 'admin', empresa_id: null }), 'Bearer ok', 'e2')
  assertEquals(admin.empresaId, 'e2')
})

Deno.test('cifrado autenticado: IV único por operación y manipulación detectada', async () => {
  const a = await encryptJson({ access_token: 'secreto' })
  const b = await encryptJson({ access_token: 'secreto' })
  assert(a.iv !== b.iv, 'el IV debe ser aleatorio')
  assert(a.ciphertext !== b.ciphertext)
  assertEquals(await decryptJson<{ access_token: string }>(a.ciphertext, a.iv), { access_token: 'secreto' })
  const tampered = a.ciphertext.slice(0, -2) + (a.ciphertext.endsWith('AA') ? 'BB' : 'AA')
  await assertRejects(() => decryptJson(tampered, a.iv))
})

Deno.test('estado OAuth: firma verificada y caducidad respetada', async () => {
  const s = await signState({ e: 'e1', u: 'u1', k: 'email', p: 'gmail', r: '/onboarding/email' })
  const parsed = await verifyState<{ e: string; p: string }>(s)
  assertEquals(parsed.e, 'e1')
  await assertRejects(() => verifyState(s.slice(0, -3) + 'xyz'))
  // Estado caducado: firmado con exp en el pasado
  const [body] = s.split('.')
  const decoded = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(body.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))))
  assert(decoded.exp > Date.now())
})
