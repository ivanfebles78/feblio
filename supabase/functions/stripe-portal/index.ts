// Feblio · Edge Function: crea una sesión del Portal de Facturación de Stripe (gestionar/cancelar).
//
// Privada (verify_jwt). Solo cuentas de empresa con customer de Stripe ya creado.
// Secrets: STRIPE_SECRET_KEY, APP_URL.  Deploy:  supabase functions deploy stripe-portal
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

    const { data: profile } = await admin.from('profiles').select('empresa_id, role').eq('id', userData.user.id).maybeSingle()
    const empresaId = (profile as { empresa_id?: string; role?: string } | null)?.empresa_id
    if (!profile || (profile as { role?: string }).role !== 'empresa' || !empresaId) {
      return new Response(JSON.stringify({ ok: false, code: 'not_company' }), { status: 403, headers })
    }

    const { data: empresa } = await admin.from('empresas').select('stripe_customer_id').eq('id', empresaId).maybeSingle()
    const customerId = (empresa as { stripe_customer_id?: string } | null)?.stripe_customer_id
    if (!customerId) return new Response(JSON.stringify({ ok: false, code: 'no_customer' }), { status: 409, headers })

    const secretKey = Deno.env.get('STRIPE_SECRET_KEY')
    const appUrl = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '')
    if (!secretKey) return new Response(JSON.stringify({ ok: false, code: 'billing_not_configured' }), { status: 503, headers })

    const url = await stripeClient(secretKey).createPortalSession(customerId, `${appUrl}/empresa`)
    return new Response(JSON.stringify({ ok: true, url }), { status: 200, headers })
  } catch (e) {
    console.error('stripe-portal: error', { reason: e instanceof Error ? e.message : 'unknown' })
    return new Response(JSON.stringify({ ok: false, code: 'error' }), { status: 500, headers })
  }
})
