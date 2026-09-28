// Feblio · Edge Function: webhook de Stripe. Refleja el estado real de la suscripción en la empresa.
//
// PÚBLICA pero verificada por firma (Stripe-Signature) con STRIPE_WEBHOOK_SECRET: sin firma válida no
// se procesa nada. Usa service_role para escribir vía RPC (billing_apply_subscription / billing_set_customer).
//
// Secrets: STRIPE_WEBHOOK_SECRET.  Deploy:  supabase functions deploy stripe-webhook --no-verify-jwt
// Registra el endpoint en Stripe: <SUPABASE_URL>/functions/v1/stripe-webhook con los eventos
//   checkout.session.completed, customer.subscription.created/updated/deleted, invoice.payment_failed
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyStripeSignature } from '../_shared/billing/stripe.ts'
import { handleWebhook, type BillingStatus, type WebhookDeps } from '../_shared/billing/webhook.ts'

function deps(): WebhookDeps {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  return {
    async applySubscription(empresaId: string, status: BillingStatus, subscriptionId: string | null, periodEnd: string | null) {
      const { error } = await admin.rpc('billing_apply_subscription', {
        p_empresa: empresaId, p_status: status, p_subscription: subscriptionId, p_period_end: periodEnd,
      })
      if (error) throw new Error(`apply_${error.code ?? 'failed'}`)
    },
    async setCustomer(empresaId: string, customerId: string) {
      await admin.rpc('billing_set_customer', { p_empresa: empresaId, p_customer: customerId })
    },
    async findEmpresaByCustomer(customerId: string) {
      const { data } = await admin.from('empresas').select('id').eq('stripe_customer_id', customerId).maybeSingle()
      return (data as { id?: string } | null)?.id ?? null
    },
    log: (event, ctx) => console.error(event, ctx),
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response(JSON.stringify({ ok: false }), { status: 405 })

  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
  const sig = req.headers.get('Stripe-Signature')
  const raw = await req.text()

  if (!secret || !(await verifyStripeSignature(raw, sig, secret))) {
    return new Response(JSON.stringify({ ok: false, code: 'invalid_signature' }), { status: 400 })
  }

  let event: Record<string, unknown>
  try {
    event = JSON.parse(raw)
  } catch {
    return new Response(JSON.stringify({ ok: false, code: 'invalid_payload' }), { status: 400 })
  }

  try {
    const res = await handleWebhook(event, deps())
    // 200 siempre que la firma sea válida: un evento no manejado no debe provocar reintentos infinitos.
    return new Response(JSON.stringify({ ok: true, handled: res.handled }), { status: 200 })
  } catch (e) {
    // 500 solo ante fallo real de escritura: Stripe reintentará.
    console.error('stripe-webhook: error', { reason: e instanceof Error ? e.message : 'unknown' })
    return new Response(JSON.stringify({ ok: false, code: 'error' }), { status: 500 })
  }
})
