// Feblio · Pruebas de seguridad de `send-intake-email` (sin red, sin envíos reales; proveedor simulado).
// Ejecutar con:  cd supabase/functions && deno test _shared/intake/sendIntake.test.ts
import { assert, assertEquals, assertMatch } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { allowedOrigin, corsHeaders, handleSendIntake, parsePayload, publicBase, type IntakeRow, type SendIntakeDeps } from './sendIntake.ts'

const EMPRESA_A = '11111111-1111-4111-8111-111111111111'
const EMPRESA_B = '22222222-2222-4222-8222-222222222222'
const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const USER_CLIENT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const INTAKE_A: IntakeRow = { id: '33333333-3333-4333-8333-333333333333', empresa_id: EMPRESA_A, token: '44444444-4444-4444-8444-444444444444', status: 'pendiente', client_email: 'cliente@example.com', expires_at: null }
const INTAKE_B: IntakeRow = { id: '55555555-5555-4555-8555-555555555555', empresa_id: EMPRESA_B, token: '66666666-6666-4666-8666-666666666666', status: 'pendiente', client_email: 'otro@example.com', expires_at: null }

interface Sent { from: string; to: string; subject: string; html: string; text: string }

function makeDeps(opts: { langA?: string; resendFails?: boolean; noKey?: boolean; intakes?: IntakeRow[] } = {}) {
  const sent: Sent[] = []
  const logs: string[] = []
  const intakes = opts.intakes ?? [INTAKE_A, INTAKE_B]
  const deps: SendIntakeDeps = {
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
  return { deps, sent, logs }
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
