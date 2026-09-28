// Feblio · Edge Function: crea una sesión de Checkout de Stripe para la suscripción de la empresa.
//
// Privada (verify_jwt por defecto). Solo cuentas de empresa. Crea/reutiliza el customer de Stripe,
// guarda su id vía RPC de service_role y devuelve la URL de pago. No maneja tarjetas: eso es Stripe.
//
// Secrets: STRIPE_SECRET_KEY, STRIPE_PRICE_ID (precio recurrente 29,99€/mes), APP_URL.
// Deploy:  supabase functions deploy stripe-checkout
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { stripeClient } from '../_shared/billing/stripe.ts'

function cors(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

Deno.serve(async (req) => {
  const headers = { ...cors(req.headers.get('Origin')), 'Content-Type': 'application/json' }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req.headers.get('Origin')) })
  if (req.method !== 'POST') return new Response(JSON.stringify({ ok: false, code: 'method_not_allowed' }), { status: 405, headers })

  try {
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
    if (userErr || !userData?.user) return new Response(JSON.stringify({ ok: false, code: 'unauthorized' }), { status: 401, headers })
    const user = userData.user

    const { data: profile } = await admin.from('profiles').select('empresa_id, role').eq('id', user.id).maybeSingle()
    const empresaId = (profile as { empresa_id?: string; role?: string } | null)?.empresa_id
    if (!profile || (profile as { role?: string }).role !== 'empresa' || !empresaId) {
      return new Response(JSON.stringify({ ok: false, code: 'not_company' }), { status: 403, headers })
    }

    const { data: empresa } = await admin.from('empresas').select('name, stripe_customer_id').eq('id', empresaId).maybeSingle()
    const emp = (empresa as { name?: string; stripe_customer_id?: string } | null) ?? {}

    const priceId = Deno.env.get('STRIPE_PRICE_ID')
    const secretKey = Deno.env.get('STRIPE_SECRET_KEY')
    const appUrl = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '')
    if (!priceId || !secretKey) return new Response(JSON.stringify({ ok: false, code: 'billing_not_configured' }), { status: 503, headers })

    const stripe = stripeClient(secretKey)
    let customerId = emp.stripe_customer_id
    if (!customerId) {
      customerId = await stripe.createCustomer(user.email ?? '', empresaId, emp.name ?? undefined)
      await admin.rpc('billing_set_customer', { p_empresa: empresaId, p_customer: customerId })
    }

    const url = await stripe.createCheckoutSession({
      customerId,
      priceId,
      empresaId,
      successUrl: `${appUrl}/empresa?billing=success`,
      cancelUrl: `${appUrl}/empresa?billing=cancel`,
    })
    return new Response(JSON.stringify({ ok: true, url }), { status: 200, headers })
  } catch (e) {
    console.error('stripe-checkout: error', { reason: e instanceof Error ? e.message : 'unknown' })
    return new Response(JSON.stringify({ ok: false, code: 'error' }), { status: 500, headers })
  }
})
