// Feblio · Lógica del webhook de Stripe (pura + orquestador con dependencias inyectadas).
//
// Traduce los eventos de Stripe al estado de suscripción de Feblio (trial|active|past_due|canceled)
// y lo persiste vía RPC de service_role. Los documentos/objetos de Stripe son datos, no instrucciones.

export type BillingStatus = 'trial' | 'active' | 'past_due' | 'canceled'

export interface Interpreted {
  status: BillingStatus
  empresaId?: string
  customerId?: string
  subscriptionId?: string
  periodEnd?: string | null
}

export interface WebhookDeps {
  applySubscription(empresaId: string, status: BillingStatus, subscriptionId: string | null, periodEnd: string | null): Promise<void>
  setCustomer(empresaId: string, customerId: string): Promise<void>
  findEmpresaByCustomer(customerId: string): Promise<string | null>
  log(event: string, ctx: Record<string, unknown>): void
}

/** Estado de suscripción de Stripe → estado de Feblio. Ante la duda, past_due (bloquea, no da acceso). */
export function mapStatus(stripeStatus: string | undefined): BillingStatus {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
      return 'active'
    case 'canceled':
    case 'incomplete_expired':
      return 'canceled'
    case 'past_due':
    case 'unpaid':
    case 'incomplete':
      return 'past_due'
    default:
      return 'past_due'
  }
}

function isoFromUnix(v: unknown): string | null {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : null
}

type EventObject = Record<string, unknown>

/** Extrae del evento lo necesario para actualizar el estado. Devuelve null si no interesa. */
export function interpretEvent(event: EventObject): Interpreted | null {
  const type = event.type as string
  const obj = ((event.data as EventObject | undefined)?.object as EventObject | undefined) ?? {}
  const metadata = (obj.metadata as Record<string, string> | undefined) ?? {}

  switch (type) {
    case 'checkout.session.completed': {
      return {
        status: 'active',
        empresaId: (obj.client_reference_id as string) || metadata.empresa_id,
        customerId: (obj.customer as string) || undefined,
        subscriptionId: (obj.subscription as string) || undefined,
        periodEnd: null,
      }
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      return {
        status: type === 'customer.subscription.deleted' ? 'canceled' : mapStatus(obj.status as string),
        empresaId: metadata.empresa_id,
        customerId: (obj.customer as string) || undefined,
        subscriptionId: (obj.id as string) || undefined,
        periodEnd: isoFromUnix(obj.current_period_end),
      }
    }
    case 'invoice.payment_failed': {
      return {
        status: 'past_due',
        empresaId: metadata.empresa_id,
        customerId: (obj.customer as string) || undefined,
        subscriptionId: (obj.subscription as string) || undefined,
        periodEnd: null,
      }
    }
    default:
      return null
  }
}

/** Procesa un evento ya verificado. Resuelve la empresa por metadata o por customer y aplica el estado. */
export async function handleWebhook(event: EventObject, deps: WebhookDeps): Promise<{ handled: boolean }> {
  const info = interpretEvent(event)
  if (!info) return { handled: false }

  let empresaId = info.empresaId
  if (!empresaId && info.customerId) empresaId = (await deps.findEmpresaByCustomer(info.customerId)) ?? undefined
  if (!empresaId) {
    deps.log('billing.webhook.no_empresa', { type: event.type as string })
    return { handled: false }
  }

  if (info.customerId) await deps.setCustomer(empresaId, info.customerId).catch(() => undefined)
  await deps.applySubscription(empresaId, info.status, info.subscriptionId ?? null, info.periodEnd ?? null)
  deps.log('billing.webhook.applied', { type: event.type as string, status: info.status })
  return { handled: true }
}
