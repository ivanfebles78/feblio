// Feblio · Pruebas del webhook de Stripe (sin red). Ejecutar con:
//   cd supabase/functions && deno test _shared/billing/webhook.test.ts
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { encodeForm, timingSafeEqual, verifyStripeSignature } from './stripe.ts'
import { handleWebhook, interpretEvent, mapStatus, type WebhookDeps } from './webhook.ts'

const EMP = '11111111-1111-4111-8111-111111111111'

Deno.test('encodeForm anida como espera Stripe', () => {
  assertEquals(encodeForm({ a: 1, b: { c: 'x' } }), 'a=1&b%5Bc%5D=x')
})

Deno.test('mapStatus mapea a la semántica de Feblio', () => {
  assertEquals(mapStatus('active'), 'active')
  assertEquals(mapStatus('trialing'), 'active')
  assertEquals(mapStatus('past_due'), 'past_due')
  assertEquals(mapStatus('unpaid'), 'past_due')
  assertEquals(mapStatus('canceled'), 'canceled')
  assertEquals(mapStatus('incomplete_expired'), 'canceled')
  assertEquals(mapStatus(undefined), 'past_due')
})

Deno.test('timingSafeEqual', () => {
  assert(timingSafeEqual('abc', 'abc'))
  assert(!timingSafeEqual('abc', 'abd'))
  assert(!timingSafeEqual('abc', 'ab'))
})

Deno.test('verifyStripeSignature acepta una firma válida y rechaza la manipulada', async () => {
  const secret = 'whsec_test'
  const payload = '{"hello":"world"}'
  const t = Math.floor(Date.now() / 1000)
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`))
  const v1 = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('')

  assert(await verifyStripeSignature(payload, `t=${t},v1=${v1}`, secret))
  assert(!(await verifyStripeSignature(payload + 'x', `t=${t},v1=${v1}`, secret)))
  assert(!(await verifyStripeSignature(payload, `t=${t},v1=${v1}`, 'otro_secreto')))
  assert(!(await verifyStripeSignature(payload, `t=${t - 10000},v1=${v1}`, secret))) // fuera de tolerancia
  assert(!(await verifyStripeSignature(payload, null, secret)))
})

Deno.test('interpretEvent: checkout.session.completed', () => {
  const info = interpretEvent({ type: 'checkout.session.completed', data: { object: { client_reference_id: EMP, customer: 'cus_1', subscription: 'sub_1' } } })
  assertEquals(info?.status, 'active')
  assertEquals(info?.empresaId, EMP)
  assertEquals(info?.customerId, 'cus_1')
  assertEquals(info?.subscriptionId, 'sub_1')
})

Deno.test('interpretEvent: subscription.updated con periodo', () => {
  const end = 1893456000 // 2030-01-01
  const info = interpretEvent({ type: 'customer.subscription.updated', data: { object: { id: 'sub_9', customer: 'cus_9', status: 'active', current_period_end: end, metadata: { empresa_id: EMP } } } })
  assertEquals(info?.status, 'active')
  assertEquals(info?.empresaId, EMP)
  assertEquals(info?.periodEnd, new Date(end * 1000).toISOString())
})

Deno.test('interpretEvent: deleted → canceled; payment_failed → past_due; desconocido → null', () => {
  assertEquals(interpretEvent({ type: 'customer.subscription.deleted', data: { object: { id: 's', metadata: { empresa_id: EMP } } } })?.status, 'canceled')
  assertEquals(interpretEvent({ type: 'invoice.payment_failed', data: { object: { customer: 'cus_2' } } })?.status, 'past_due')
  assertEquals(interpretEvent({ type: 'customer.updated', data: { object: {} } }), null)
})

function deps(over: Partial<WebhookDeps> = {}): { deps: WebhookDeps; applied: unknown[]; customers: unknown[] } {
  const applied: unknown[] = []
  const customers: unknown[] = []
  return {
    applied, customers,
    deps: {
      applySubscription: (empresaId, status, subscriptionId, periodEnd) => { applied.push({ empresaId, status, subscriptionId, periodEnd }); return Promise.resolve() },
      setCustomer: (empresaId, customerId) => { customers.push({ empresaId, customerId }); return Promise.resolve() },
      findEmpresaByCustomer: () => Promise.resolve(null),
      log: () => {},
      ...over,
    },
  }
}

Deno.test('handleWebhook: aplica el estado usando empresa_id de metadata', async () => {
  const { deps: d, applied, customers } = deps()
  const r = await handleWebhook({ type: 'customer.subscription.updated', data: { object: { id: 'sub_1', customer: 'cus_1', status: 'active', metadata: { empresa_id: EMP } } } }, d)
  assert(r.handled)
  assertEquals(applied, [{ empresaId: EMP, status: 'active', subscriptionId: 'sub_1', periodEnd: null }])
  assertEquals(customers, [{ empresaId: EMP, customerId: 'cus_1' }])
})

Deno.test('handleWebhook: resuelve la empresa por customer cuando no hay metadata', async () => {
  const { deps: d, applied } = deps({ findEmpresaByCustomer: () => Promise.resolve(EMP) })
  const r = await handleWebhook({ type: 'invoice.payment_failed', data: { object: { customer: 'cus_x' } } }, d)
  assert(r.handled)
  assertEquals((applied[0] as { status: string }).status, 'past_due')
})

Deno.test('handleWebhook: sin empresa resoluble no hace nada', async () => {
  const { deps: d, applied } = deps()
  const r = await handleWebhook({ type: 'invoice.payment_failed', data: { object: { customer: 'cus_x' } } }, d)
  assert(!r.handled)
  assertEquals(applied.length, 0)
})
