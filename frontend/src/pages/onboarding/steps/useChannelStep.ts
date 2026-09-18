import { useCallback } from 'react'
import { useOnboarding } from '../../../lib/onboarding/OnboardingContext'
import { updateIntegrationSettings } from '../../../lib/onboarding/api'
import type { IntegrationKind, OnboardingStepKey } from '../../../lib/onboarding/types'

const SECRET_KEY_RE = /(password|token|secret|api_key)/i

/**
 * Estado de un paso de canal: los datos viven en onboarding_steps.data y, en
 * paralelo, se replican (sin secretos) en integration_connections.settings para
 * que el panel de integraciones y las Edge Functions los lean.
 */
export function useChannelStep<T extends Record<string, unknown>>(stepKey: OnboardingStepKey, kind: IntegrationKind, defaults: () => T) {
  const ctx = useOnboarding()
  const data = ctx.getStepData<T>(stepKey, defaults)
  const connection = ctx.snapshot?.integrations.find((i) => i.kind === kind) ?? null

  const set = useCallback(
    (patch: Partial<T>, accountIdentifier?: string) => {
      ctx.updateStepData<T>(stepKey, patch, defaults)
      const next = { ...data, ...patch }
      // Sincroniza ajustes con la conexión (nunca credenciales)
      const safe = Object.fromEntries(Object.entries(next).filter(([k]) => !SECRET_KEY_RE.test(k)))
      ctx.scheduleSave(`${stepKey}:settings`, async () => {
        const row = await updateIntegrationSettings(kind, safe, accountIdentifier)
        ctx.patchSnapshot((s) => ({ ...s, integrations: s.integrations.map((i) => (i.kind === kind ? row : i)) }))
      })
    },
    [ctx, data, defaults, kind, stepKey],
  )

  return { ctx, data, set, connection }
}
