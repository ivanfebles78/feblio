import { supabase } from '../supabase'

/** Respuesta común de las Edge Functions de facturación. */
interface BillingFnResult {
  ok?: boolean
  url?: string
  code?: string
}

async function invokeBilling(fn: 'stripe-checkout' | 'stripe-portal'): Promise<string> {
  const { data, error } = await supabase.functions.invoke<BillingFnResult>(fn, { body: {} })
  if (error || !data?.url) throw new Error(data?.code ?? 'billing_error')
  return data.url
}

/** Inicia el pago de la suscripción: redirige a Stripe Checkout. */
export async function startCheckout(): Promise<void> {
  window.location.href = await invokeBilling('stripe-checkout')
}

/** Abre el portal de facturación de Stripe (gestionar método de pago / cancelar). */
export async function openBillingPortal(): Promise<void> {
  window.location.href = await invokeBilling('stripe-portal')
}
