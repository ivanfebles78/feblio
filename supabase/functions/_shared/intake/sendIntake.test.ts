// Feblio · Pruebas de seguridad de `send-intake-email` (sin red, sin envíos reales; proveedor simulado).
// Ejecutar con:  cd supabase/functions && deno test _shared/intake/sendIntake.test.ts
import { assert, assertEquals, assertMatch } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { allowedOrigin, corsHeaders, handleSendIntake, parsePayload, publicBase, retryAfterSeconds, type IntakeRow, type RateCheckResult, type SendIntakeDeps } from './sendIntake.ts'

const EMPRESA_A = '11111111-1111-4111-8111-111111111111'
const EMPRESA_B = '22222222-2222-4222-8222-222222222222'
const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const USER_CLIENT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const INTAKE_A: IntakeRow = { id: '33333333-3333-4333-8333-333333333333', empresa_id: EMPRESA_A, token: '44444444-4444-4444-8444-444444444444', status: 'pendiente', client_email: 'cliente@example.com', expires_at: null }
const INTAKE_B: IntakeRow = { id: '55555555-5555-4555-8555-555555555555', empresa_id: EMPRESA_B, token: '66666666-6666-4666-8666-666666666666', status: 'pendiente', client_email: 'otro@example.com', expires_at: null }

interface Sent { from: string; to: string; subject: string; html: string; text: string }

/**
 * Contador simulado con las mismas reglas que la RPC `intake_email_rate_check` (0017): comprobación conjunta
 * usuario+formulario (5) y empresa (30) en ventana fija de 60 min; un rechazo no consume nada; un permiso
 * incrementa ambos exactamente una vez. Las llamadas se serializan (como el bloqueo de fila en Postgres).
 */
class FakeRateStore {
  rows = new Map<string, { windowStart: number; hits: number }>()
  calls = 0
  now = () => Date.now()
  private chain: Promise<unknown> = Promise.resolve()
  constructor(readonly userMax = 5, readonly empMax = 30, readonly windowMs = 60 * 60 * 1000) {}
  check(user: string, emp: string, intake: string): Promise<RateCheckResult> {
    const run = (): RateCheckResult => {
      this.calls++
      const now = this.now()
      const ku = `ie:u:${user}:i:${intake}`
      const ke = `ie:e:${emp}`
      const eff = (k: string) => {
        const r = this.rows.get(k)
        return !r || r.windowStart < now - this.windowMs ? { hits: 0, windowStart: now } : r
      }
      const u = eff(ku)
      const e = eff(ke)
      const retry = (r: { windowStart: number }) => Math.min(3600, Math.max(1, Math.ceil((r.windowStart + this.windowMs - now) / 1000)))
      if (u.hits >= this.userMax) return { allowed: false, retry_after: retry(u) }
      if (e.hits >= this.empMax) return { allowed: false, retry_after: retry(e) }
      this.rows.set(ku, { windowStart: u.hits === 0 ? now : u.windowStart, hits: u.hits + 1 })
      this.rows.set(ke, { windowStart: e.hits === 0 ? now : e.windowStart, hits: e.hits + 1 })
      return { allowed: true }
    }
    const p = this.chain.then(run)
    this.chain = p.catch(() => undefined)
    return p
  }
  hits(k: string): number {
    return this.rows.get(k)?.hits ?? 0
  }
}

function makeDeps(opts: { langA?: string; resendFails?: boolean; noKey?: boolean; intakes?: IntakeRow[]; store?: FakeRateStore; rpcDown?: boolean } = {}) {
  const sent: Sent[] = []
  const logs: string[] = []
  const intakes = opts.intakes ?? [INTAKE_A, INTAKE_B]
  const store = opts.store ?? new FakeRateStore()
  const deps: SendIntakeDeps = {
    rateCheck: (u, e, i) => (opts.rpcDown ? Promise.reject(new Error('rate_check_failed')) : store.check(u, e, i)),
    getUserId: async (jwt) => ({ 'jwt-a': USER_A, 'jwt-b': USER_B, 'jwt-client': USER_CLIENT })[jwt] ?? null,
    getProfile: async (id) => ({ [USER_A]: { empresa_id: EMPRESA_A, role: 'empresa' }, [USER_B]: { empresa_id: EMPRESA_B, role: 'empresa' }, [USER_CLIENT]: { empresa_id: EMPRESA_A, role: 'cliente' } })[id] ?? null,
    findIntakeById: async (id) => intakes.find((r) => r.id === id) ?? null,
    findIntakeByToken: async (token) => intakes.find((r) => r.token === token) ?? null,
    getEmpresa: async (id) => (id === EMPRESA_A ? { id, name: 'Empresa A <SL>', trade_name: null, language: opts.langA ?? 'es' } : { id, name: 'Empresa B', language: 'en' }),
    sendMail: async (mail) => {
      if (opts.resendFails) throw new Error('resend_422: detalle interno del proveedor')
      sent.push(mail)
      return 'msg_1'
    },
    env: (name) => (name === 'RESEND_API_KEY' ? (opts.noKey ? undefined : 're_test') : name === 'INTAKE_FROM_EMAIL' ? 'Feblio <notificaciones@feblio.com>' : name === 'APP_URL' ? 'https://feblio-production.up.railway.app' : undefined),
    log: (event) => logs.push(event),
  }
  return { deps, sent, logs, store }
}

const post = (body: unknown, jwt?: string, origin = 'https://feblio.com') =>
  new Request('https://x.supabase.co/functions/v1/send-intake-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}), Origin: origin },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

Deno.test('1. petición sin JWT → 401 sin envío', async () => {
  const { deps, sent } = makeDeps()
  const out = await handleSendIntake(post({ intake_id: INTAKE_A.id }), deps)
  assertEquals(out, { status: 401, body: { ok: false, code: 'unauthorized' } })
  assertEquals(sent.length, 0)
})

Deno.test('2. JWT inválido o sesión inexistente → 401 sin envío', async () => {
  const { deps, sent } = makeDeps()
  const out = await handleSendIntake(post({ intake_id: INTAKE_A.id }, 'jwt-falso'), deps)
  assertEquals(out.status, 401)
  assertEquals(out.body.code, 'unauthorized')
  assertEquals(sent.length, 0)
})

Deno.test('3. usuario válido y formulario propio → envía al destinatario de la base de datos con enlace y empresa del servidor', async () => {
  const { deps, sent } = makeDeps()
  const out = await handleSendIntake(post({ intake_id: INTAKE_A.id, to: 'atacante@example.com', empresa: 'Falsa', link: 'https://evil.example/x' }, 'jwt-a'), deps)
  assertEquals(out.status, 200)
  assertEquals(out.body.ok, true)
  assertEquals(out.body.locale, 'es')
  assertEquals(out.body.to, 'cliente@example.com')
  assertEquals(out.body.link, `https://feblio.com/form/${INTAKE_A.token}`)
  assertEquals(sent.length, 1)
  assertEquals(sent[0].to, 'cliente@example.com') // el `to` del payload se ignora
  assertEquals(sent[0].from, 'Feblio <notificaciones@feblio.com>')
  assertEquals(sent[0].subject, 'Completa tus datos · Empresa A <SL>')
  assert(sent[0].html.includes('Empresa A &lt;SL&gt;')) // nombre escapado en HTML
  assert(!sent[0].html.includes('evil.example') && !sent[0].text.includes('Falsa'))
  assert(sent[0].text.includes(`https://feblio.com/form/${INTAKE_A.token}`))
})

Deno.test('4. usuario válido intentando un formulario de otra empresa → 404 neutro, sin envío', async () => {
  const { deps, sent } = makeDeps()
  for (const body of [{ intake_id: INTAKE_B.id }, { token: INTAKE_B.token }, { link: `https://feblio.com/form/${INTAKE_B.token}` }]) {
    const out = await handleSendIntake(post(body, 'jwt-a'), deps)
    assertEquals(out, { status: 404, body: { ok: false, code: 'not_found' } })
  }
  assertEquals(sent.length, 0)
  // y la empresa B sí puede con el suyo (aislamiento simétrico)
  const ok = await handleSendIntake(post({ intake_id: INTAKE_B.id }, 'jwt-b'), deps)
  assertEquals(ok.status, 200)
  assertEquals(ok.body.locale, 'en')
})

Deno.test('5. recurso inexistente → misma respuesta que el de otra empresa', async () => {
  const { deps, sent } = makeDeps()
  const out = await handleSendIntake(post({ intake_id: '99999999-9999-4999-8999-999999999999' }, 'jwt-a'), deps)
  assertEquals(out, { status: 404, body: { ok: false, code: 'not_found' } })
  assertEquals(sent.length, 0)
})

Deno.test('6. payload manipulado → 400 invalid_payload; cuenta de cliente → 403; sin envío', async () => {
  const { deps, sent } = makeDeps()
  for (const body of [{}, { intake_id: 'no-es-uuid' }, { intake_id: `${INTAKE_A.id}' or 1=1` }, { link: 'https://feblio.com/form/../../admin' }, { token: 123 }, [], 'texto', '{no json']) {
    const out = await handleSendIntake(post(body, 'jwt-a'), deps)
    assertEquals(out.status, 400, JSON.stringify(body))
    assertEquals(out.body.code, 'invalid_payload')
  }
  const big = await handleSendIntake(post({ intake_id: INTAKE_A.id, pad: 'x'.repeat(5000) }, 'jwt-a'), deps)
  assertEquals(big.body.code, 'invalid_payload')
  const client = await handleSendIntake(post({ intake_id: INTAKE_A.id }, 'jwt-client'), deps)
  assertEquals(client, { status: 403, body: { ok: false, code: 'forbidden' } })
  const get = await handleSendIntake(new Request('https://x/f', { method: 'GET', headers: { Authorization: 'Bearer jwt-a' } }), deps)
  assertEquals(get.status, 405)
  assertEquals(sent.length, 0)
})

Deno.test('7. idioma: empresa en inglés → correo en inglés; en español → español; el cliente no lo elige', async () => {
  const es = makeDeps({ langA: 'es' })
  await handleSendIntake(post({ intake_id: INTAKE_A.id, language: 'en' }, 'jwt-a'), es.deps)
  assertMatch(es.sent[0].subject, /^Completa tus datos/)
  assert(es.sent[0].text.includes('Enviado con Feblio'))
  const en = makeDeps({ langA: 'en' })
  await handleSendIntake(post({ intake_id: INTAKE_A.id, language: 'es' }, 'jwt-a'), en.deps)
  assertMatch(en.sent[0].subject, /^Complete your details/)
  assert(en.sent[0].html.includes('Complete the form') && en.sent[0].text.includes('Sent with Feblio'))
  const bad = makeDeps({ langA: 'fr' })
  await handleSendIntake(post({ intake_id: INTAKE_A.id }, 'jwt-a'), bad.deps)
  assertMatch(bad.sent[0].subject, /^Completa tus datos/)
})

Deno.test('8. error de Resend simulado → 502 send_failed sin detalles del proveedor; sin clave → 500 not_configured', async () => {
  const failing = makeDeps({ resendFails: true })
  const out = await handleSendIntake(post({ intake_id: INTAKE_A.id }, 'jwt-a'), failing.deps)
  assertEquals(out, { status: 502, body: { ok: false, code: 'send_failed' } })
  assert(!JSON.stringify(out).includes('proveedor'))
  assertEquals(failing.logs.length, 1)
  const noKey = makeDeps({ noKey: true })
  const out2 = await handleSendIntake(post({ intake_id: INTAKE_A.id }, 'jwt-a'), noKey.deps)
  assertEquals(out2, { status: 500, body: { ok: false, code: 'not_configured' } })
  assertEquals(noKey.sent.length, 0)
})

Deno.test('9. formulario completado o caducado, o sin destinatario válido → no se envía', async () => {
  const done = makeDeps({ intakes: [{ ...INTAKE_A, status: 'completado' }] })
  assertEquals((await handleSendIntake(post({ intake_id: INTAKE_A.id }, 'jwt-a'), done.deps)).body.code, 'form_closed')
  const expired = makeDeps({ intakes: [{ ...INTAKE_A, expires_at: '2020-01-01T00:00:00Z' }] })
  assertEquals((await handleSendIntake(post({ intake_id: INTAKE_A.id }, 'jwt-a'), expired.deps)).body.code, 'form_closed')
  const noMail = makeDeps({ intakes: [{ ...INTAKE_A, client_email: 'no-es-un-correo' }] })
  assertEquals((await handleSendIntake(post({ intake_id: INTAKE_A.id }, 'jwt-a'), noMail.deps)).body.code, 'no_recipient')
  assertEquals(done.sent.length + expired.sent.length + noMail.sent.length, 0)
})

Deno.test('10. CORS y enlace: solo orígenes permitidos; el enlace usa el token de la fila, nunca el del payload', () => {
  const app = 'https://feblio-production.up.railway.app'
  assertEquals(allowedOrigin('https://feblio.com', app), 'https://feblio.com')
  assertEquals(allowedOrigin(app, app), app)
  assertEquals(allowedOrigin('https://evil.example', app), null)
  assertEquals(allowedOrigin(null, app), null)
  assertEquals(publicBase('https://evil.example', app), app)
  assertEquals(publicBase(null, undefined), 'https://feblio.com')
  const h = corsHeaders('https://evil.example', app)
  assert(!('Access-Control-Allow-Origin' in h))
  assertEquals(h['Access-Control-Allow-Methods'], 'POST, OPTIONS')
  assertEquals(parsePayload({ link: 'https://evil.example/form/44444444-4444-4444-8444-444444444444?x=1' }), { token: '44444444-4444-4444-8444-444444444444' })
  assertEquals(parsePayload({ intake_id: INTAKE_A.id.toUpperCase() }), { intake_id: INTAKE_A.id })
})

/* ------------------------------------------------------------------------------------------------ */
/* Límite de frecuencia (0017)                                                                        */
/* ------------------------------------------------------------------------------------------------ */

const own = (jwt = 'jwt-a', id = INTAKE_A.id) => post({ intake_id: id }, jwt)

Deno.test('11. cinco intentos permitidos y el sexto bloqueado con 429 rate_limited y Retry-After (1..3600)', async () => {
  const { deps, sent, store } = makeDeps()
  for (let n = 1; n <= 5; n++) assertEquals((await handleSendIntake(own(), deps)).status, 200, `intento ${n}`)
  const sixth = await handleSendIntake(own(), deps)
  assertEquals(sixth.status, 429)
  assertEquals(sixth.body, { ok: false, code: 'rate_limited' })
  const ra = Number(sixth.headers?.['Retry-After'])
  assert(ra >= 1 && ra <= 3600, `Retry-After fuera de rango: ${ra}`)
  assertEquals(sent.length, 5)
  // el rechazo no consume cuota
  assertEquals(store.hits(`ie:u:${USER_A}:i:${INTAKE_A.id}`), 5)
  assertEquals(store.hits(`ie:e:${EMPRESA_A}`), 5)
  assertEquals(retryAfterSeconds(0), 1)
  assertEquals(retryAfterSeconds(99999), 3600)
  assertEquals(retryAfterSeconds(undefined), 60)
})

Deno.test('12. usuarios, formularios y empresas distintos mantienen cuotas independientes', async () => {
  const store = new FakeRateStore()
  const intakeA2: IntakeRow = { ...INTAKE_A, id: '77777777-7777-4777-8777-777777777777', token: '88888888-8888-4888-8888-888888888888' }
  const { deps, sent } = makeDeps({ store, intakes: [INTAKE_A, INTAKE_B, intakeA2] })
  for (let n = 1; n <= 5; n++) await handleSendIntake(own(), deps)
  assertEquals((await handleSendIntake(own(), deps)).status, 429)
  assertEquals((await handleSendIntake(own('jwt-a', intakeA2.id), deps)).status, 200) // otro formulario, mismo usuario
  assertEquals((await handleSendIntake(post({ intake_id: INTAKE_B.id }, 'jwt-b'), deps)).status, 200) // otra empresa
  assertEquals(store.hits(`ie:e:${EMPRESA_A}`), 6)
  assertEquals(store.hits(`ie:e:${EMPRESA_B}`), 1)
  assertEquals(sent.length, 7)
})

Deno.test('13. llamadas simultáneas: nunca más de 5 envíos para el mismo usuario+formulario', async () => {
  const { deps, sent } = makeDeps()
  const results = await Promise.all(Array.from({ length: 12 }, () => handleSendIntake(own(), deps)))
  assertEquals(results.filter((r) => r.status === 200).length, 5)
  assertEquals(results.filter((r) => r.status === 429).length, 7)
  assertEquals(sent.length, 5)
})

Deno.test('14. límite de empresa (30): bloquea aunque el usuario+formulario tenga cuota; el rechazo no incrementa nada', async () => {
  const store = new FakeRateStore()
  const intakes: IntakeRow[] = Array.from({ length: 7 }, (_, k) => ({ ...INTAKE_A, id: `${String(k + 1).repeat(8)}-0000-4000-8000-000000000000`, token: `${String(k + 1).repeat(8)}-1111-4111-8111-111111111111` }))
  const { deps, sent } = makeDeps({ store, intakes })
  let ok = 0
  for (const it of intakes) for (let n = 0; n < 5; n++) if ((await handleSendIntake(own('jwt-a', it.id), deps)).status === 200) ok++
  assertEquals(ok, 30) // 7 formularios × 5 = 35 intentos, solo 30 pasan
  assertEquals(sent.length, 30)
  assertEquals(store.hits(`ie:e:${EMPRESA_A}`), 30)
  assertEquals(store.hits(`ie:u:${USER_A}:i:${intakes[6].id}`), 0) // el último formulario quedó bloqueado sin consumir su cuota propia
})

Deno.test('15. expiración de la ventana: pasados 60 minutos vuelve a permitir', async () => {
  const store = new FakeRateStore()
  let t = Date.parse('2026-09-21T10:00:00Z')
  store.now = () => t
  const { deps } = makeDeps({ store })
  for (let n = 1; n <= 5; n++) await handleSendIntake(own(), deps)
  const blocked = await handleSendIntake(own(), deps)
  assertEquals(blocked.status, 429)
  assertEquals(Number(blocked.headers?.['Retry-After']), 3600)
  t += 30 * 60 * 1000
  assertEquals((await handleSendIntake(own(), deps)).status, 429)
  assertEquals(Number((await handleSendIntake(own(), deps)).headers?.['Retry-After']), 1800)
  t += 31 * 60 * 1000
  assertEquals((await handleSendIntake(own(), deps)).status, 200)
  assertEquals(store.hits(`ie:u:${USER_A}:i:${INTAKE_A.id}`), 1)
})

Deno.test('16. un error de Resend consume cuota igualmente; la RPC caída cierra la función', async () => {
  const store = new FakeRateStore()
  const { deps, logs } = makeDeps({ store, resendFails: true })
  for (let n = 1; n <= 5; n++) assertEquals((await handleSendIntake(own(), deps)).status, 502)
  assertEquals((await handleSendIntake(own(), deps)).status, 429)
  assertEquals(store.hits(`ie:u:${USER_A}:i:${INTAKE_A.id}`), 5)
  assertEquals(logs.length, 5)
  const down = makeDeps({ rpcDown: true })
  const out = await handleSendIntake(own(), down.deps)
  assertEquals(out, { status: 500, body: { ok: false, code: 'error' } })
  assertEquals(down.sent.length, 0)
})

Deno.test('17. los intentos rechazados antes del proveedor (pertenencia, payload, sin clave) no consumen cuota', async () => {
  const store = new FakeRateStore()
  const { deps } = makeDeps({ store })
  await handleSendIntake(post({ intake_id: INTAKE_B.id }, 'jwt-a'), deps) // ajeno
  await handleSendIntake(post({}, 'jwt-a'), deps) // payload inválido
  await handleSendIntake(own('jwt-client'), deps) // cuenta cliente
  const noKey = makeDeps({ store, noKey: true })
  await handleSendIntake(own(), noKey.deps)
  assertEquals(store.calls, 0)
})
