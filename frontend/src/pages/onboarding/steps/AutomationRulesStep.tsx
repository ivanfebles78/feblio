import { useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { ChipsField, RadioCards, ToggleField } from '../../../components/forms/Field'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { useOnboarding } from '../../../lib/onboarding/OnboardingContext'
import { logAudit, saveAutomation } from '../../../lib/onboarding/api'
import type { AutomationLevel, AutomationSettings } from '../../../lib/onboarding/types'
import type { StepProps } from './types'

const LEVEL3_SCOPES = ['enviar_formulario', 'solicitar_documentacion', 'enviar_recordatorios', 'enviar_presupuesto', 'programar_llamada']

const TOGGLES: { key: keyof AutomationSettings; label: string; description: string; minLevel: AutomationLevel }[] = [
  { key: 'auto_create_request', label: 'Crear solicitud automáticamente', description: 'Al recibir un contacto por cualquier canal.', minLevel: 1 },
  { key: 'auto_create_project', label: 'Crear proyecto automáticamente', description: 'Cuando la solicitud tiene la información completa.', minLevel: 2 },
  { key: 'auto_send_form', label: 'Enviar formulario automáticamente', description: 'Sin revisión previa. Requiere Nivel 2 o superior.', minLevel: 2 },
  { key: 'auto_request_missing_docs', label: 'Solicitar documentación pendiente', description: 'Feblio pide al cliente lo que falte.', minLevel: 2 },
  { key: 'auto_schedule_call', label: 'Programar llamada', description: 'Propone una llamada si la información es insuficiente.', minLevel: 2 },
  { key: 'auto_draft_quote', label: 'Generar presupuesto como borrador', description: 'Siempre revisable antes de enviar.', minLevel: 1 },
  { key: 'auto_send_quote', label: 'Enviar presupuesto', description: 'Sin aprobación humana. Requiere Nivel 3.', minLevel: 3 },
  { key: 'auto_reminders', label: 'Enviar recordatorios', description: 'Formularios y pagos pendientes.', minLevel: 2 },
  { key: 'pause_outside_hours', label: 'Suspender fuera de horario', description: 'No ejecutar acciones hacia clientes fuera del horario configurado.', minLevel: 1 },
]

export function AutomationRulesStep({ errors, showErrors }: StepProps) {
  const ctx = useOnboarding()
  const a = ctx.snapshot?.automation
  const empresaId = ctx.snapshot?.empresa.id ?? ''
  const [confirmL3, setConfirmL3] = useState(false)
  const err = (k: string) => (showErrors ? errors[k] : undefined)
  if (!a) return null

  function patch(p: Partial<AutomationSettings>) {
    const next = { ...a!, ...p }
    ctx.patchSnapshot((s) => ({ ...s, automation: next }))
    ctx.scheduleSave('automation', async () => {
      await saveAutomation(empresaId, p)
    })
  }

  function setLevel(level: AutomationLevel) {
    if (level === 3) {
      setConfirmL3(true)
      return
    }
    applyLevel(level)
  }

  function applyLevel(level: AutomationLevel) {
    const p: Partial<AutomationSettings> = { level, require_human_approval: level < 3 ? true : a!.require_human_approval }
    if (level === 1) {
      p.auto_send_form = false
      p.auto_send_quote = false
    }
    if (level < 3) p.auto_send_quote = false
    patch(p)
    ctx.scheduleSave('automation:audit', () => logAudit('automation.level_changed', 'automation_settings', undefined, 'ok', { level }).then(() => undefined))
  }

  return (
    <div className="space-y-8">
      <RadioCards<'1' | '2' | '3'>
        legend="Nivel de automatización"
        name="automation_level"
        value={String(a.level) as '1' | '2' | '3'}
        onChange={(v) => setLevel(Number(v) as AutomationLevel)}
        columns={3}
        error={err('level')}
        options={[
          { value: '1', label: 'Nivel 1 · Solo borradores', description: 'Feblio prepara todo; una persona revisa y envía. Recomendado para empezar.', badge: <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">Predeterminado</span> },
          { value: '2', label: 'Nivel 2 · Ejecutar tras aprobación', description: 'Feblio ejecuta acciones cuando alguien las aprueba en un clic.' },
          { value: '3', label: 'Nivel 3 · Automatización autorizada', description: 'Feblio ejecuta procesos concretos sin aprobación. Requiere confirmación.' },
        ]}
      />

      {a.level === 3 && (
        <div className="space-y-3 rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900" role="note">
          <p className="flex items-start gap-2 font-semibold">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> Nivel 3 activo: Feblio actuará sin aprobación en los procesos autorizados.
          </p>
          <ChipsField label="Procesos autorizados" values={a.level3_scopes} onChange={(v) => patch({ level3_scopes: v })} error={err('level3_scopes')} suggestions={LEVEL3_SCOPES} hint="Elige de la lista o escribe uno y pulsa Intro." />
        </div>
      )}

      <section aria-labelledby="sec-auto-rules" className="divide-y divide-slate-100">
        <h2 id="sec-auto-rules" className="pb-2 text-sm font-semibold text-slate-800">
          Reglas
        </h2>
        <ToggleField
          label="Requerir aprobación humana"
          description="Ninguna acción hacia clientes u organismos se ejecuta sin aprobación. Obligatorio en niveles 1 y 2."
          checked={a.require_human_approval}
          disabled={a.level < 3}
          onChange={(c) => patch({ require_human_approval: c })}
          error={err('require_human_approval')}
        />
        {TOGGLES.map((t) => {
          const locked = a.level < t.minLevel
          return (
            <ToggleField
              key={t.key}
              label={t.label}
              description={locked ? `${t.description} (disponible a partir del Nivel ${t.minLevel})` : t.description}
              checked={Boolean(a[t.key])}
              disabled={locked}
              onChange={(c) => patch({ [t.key]: c } as Partial<AutomationSettings>)}
            />
          )
        })}
      </section>

      <ConfirmDialog open={confirmL3} title="Activar Nivel 3" tone="warning" confirmLabel="Entiendo, activar Nivel 3" onConfirm={() => { setConfirmL3(false); applyLevel(3) }} onCancel={() => setConfirmL3(false)}>
        <p>
          En Nivel 3 Feblio puede enviar formularios, solicitudes de documentación, recordatorios o presupuestos <strong>sin que nadie los revise</strong>, solo en
          los procesos que autorices. Eres responsable del contenido enviado a tus clientes. Puedes volver a Nivel 1 o 2 en cualquier momento.
        </p>
      </ConfirmDialog>
    </div>
  )
}
