// Feblio · Cliente mínimo de Stripe para Edge Functions (Deno), sin SDK.
//
// Llama a la API REST de Stripe con fetch y verifica la firma del webhook con Web Crypto. No guarda
// datos de pago: todo vive en Stripe. La clave secreta (STRIPE_SECRET_KEY) nunca se expone al cliente.

const STRIPE_API = 'https://api.stripe.com/v1'

/** Codifica parámetros anidados al formato form-urlencoded de Stripe (a[b][c]=v). */
export function encodeForm(obj: Record<string, unknown>, prefix = ''): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue
    const key = prefix ? `${prefix}[${k}]` : k
    if (typeof v === 'object') parts.push(encodeForm(v as Record<string, unknown>, key))
    else parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`)
  }
  return parts.filter(Boolean).join('&')
}

async function stripeFetch(path: string, secretKey: string, body?: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body ? encodeForm(body) : undefined,
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const err = (data.error as { message?: string; code?: string } | undefined) ?? {}
    throw new Error(`stripe_${res.status}_${err.code ?? 'error'}`)
  }
  return data
}

export interface StripeClient {
  createCustomer(email: string, empresaId: string, name?: string): Promise<string>
  createCheckoutSession(args: { customerId: string; priceId: string; empresaId: string; successUrl: string; cancelUrl: string }): Promise<string>
  createPortalSession(customerId: string, returnUrl: string): Promise<string>
}

export function stripeClient(secretKey: string): StripeClient {
  return {
    async createCustomer(email, empresaId, name) {
      const c = await stripeFetch('/customers', secretKey, { email, name, 'metadata[empresa_id]': empresaId })
      return c.id as string
    },
    async createCheckoutSession({ customerId, priceId, empresaId, successUrl, cancelUrl }) {
      const s = await stripeFetch('/checkout/sessions', secretKey, {
        mode: 'subscription',
        customer: customerId,
        client_reference_id: empresaId,
        success_url: successUrl,
        cancel_url: cancelUrl,
        'line_items[0][price]': priceId,
        'line_items[0][quantity]': 1,
        'subscription_data[metadata][empresa_id]': empresaId,
        allow_promotion_codes: 'true',
      })
      return s.url as string
    },
    async createPortalSession(customerId, returnUrl) {
      const s = await stripeFetch('/billing_portal/sessions', secretKey, { customer: customerId, return_url: returnUrl })
      return s.url as string
    },
  }
}

/* ------------------------------------------------------------------ */
/* Verificación de firma del webhook (Stripe-Signature: t=…,v1=…)       */
/* ------------------------------------------------------------------ */

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Comparación en tiempo constante de dos cadenas hex de igual longitud. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Verifica la firma de un webhook de Stripe. Devuelve true si es válida y está dentro de tolerancia. */
export async function verifyStripeSignature(payload: string, header: string | null, secret: string, toleranceSec = 300): Promise<boolean> {
  if (!header || !secret) return false
  const parts = Object.fromEntries(header.split(',').map((p) => {
    const i = p.indexOf('=')
    return [p.slice(0, i).trim(), p.slice(i + 1).trim()]
  }))
  const t = parts['t']
  const v1 = parts['v1']
  if (!t || !v1) return false
  const ts = Number(t)
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > toleranceSec) return false

  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`))
  return timingSafeEqual(hex(sig), v1)
}
