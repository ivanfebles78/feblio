import { useCallback, useMemo } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { ChipsField, RadioCards, SelectField, TextField, TextareaField, ToggleField } from '../../../components/forms/Field'
import { BusinessHoursEditor } from '../../../components/forms/BusinessHoursEditor'
import { IntegrationCard } from '../../../components/onboarding/IntegrationCard'
import { CreateRequestFromCall } from '../../../components/onboarding/CreateRequestFromCall'
import { useIntegration } from '../../../lib/integrations/useIntegration'
import { adapterById } from '../../../lib/integrations/adapters'
import { TIMEZONES, defaultVoiceData } from '../../../lib/onboarding/steps'
import { onboardingStepPath } from '../../../lib/routing'
import type { VoiceMode, VoiceStepData } from '../../../lib/onboarding/types'
import { useChannelStep } from './useChannelStep'
import type { StepProps } from './types'

type Data = VoiceStepData & Record<string, unknown>

export function VoiceChannelStep({ errors, showErrors, mode }: StepProps) {
  const integration = useIntegration('voice')
  const tz = integration.connection?.settings?.timezone as string | undefined
  const defaults = useCallback(() => defaultVoiceData(tz ?? 'Europe/Madrid') as Data, [tz])
  const { ctx, data, set, connection } = useChannelStep<Data>('voice', 'voice', defaults)
  const err = (k: string) => (showErrors ? errors[k] : undefined)
  const returnTo = mode === 'wizard' ? onboardingStepPath('voice') : '/empresa?settings=integrations'
  const settings = useMemo(() => data as Record<string, unknown>, [data])
  const automated = data.mode === 'agent' || data.mode === 'integrated' || data.mode === 'forward'
  const adapter = data.mode === 'manual' ? adapterById('manual_log') : automated ? adapterById('voice_provider') : undefined
  const empresaTz = ctx.snapshot?.empresa.timezone ?? 'Europe/Madrid'

  async function choose(m: VoiceMode) {
    set({ mode: m, timezone: data.timezone || empresaTz })
    if (m === 'later') {
      await integration.configure(connection?.provider ?? 'manual_log', 'not_configured', {})
    } else if (m === 'manual') {
      const ok = await integration.configure('manual_log', 'connected', { ...settings, mode: 'manual' }, undefined, 'Registro manual')
      if (ok) await integration.test('manual_log')
    } else if (connection?.provider !== 'voice_provider') {
      await integration.configure('voice_provider', 'not_configured', { ...settings, mode: m })
    }
  }

  function setExt(i: number, patch: Partial<{ name: string; number: string }>) {
    set({ extensions: data.extensions.map((e, idx) => (idx === i ? { ...e, ...patch } : e)) })
  }

  return (
    <div className="space-y-8">
      <RadioCards<VoiceMode>
        legend="¿Cómo se atienden las llamadas?"
        name="voice_mode"
        value={data.mode}
        onChange={choose}
        options={[
          { value: 'manual', label: 'Registro manual', description: 'Atiendes tú y registras la solicitud en un clic. Recomendado para empezar.', badge: <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">Listo ya</span> },
          { value: 'integrated', label: 'Telefonía integrada', description: 'Número virtual con grabación y transcripción. Requiere proveedor.' },
          { value: 'agent', label: 'Agente de voz', description: 'Un asistente atiende, recoge datos y envía el formulario. Requiere proveedor.' },
          { value: 'forward', label: 'Desvío de número existente', description: 'Desvías tu número actual a Feblio. Requiere proveedor.' },
          { value: 'later', label: 'Configurar después', description: 'Puedes omitir este paso.' },
        ]}
      />

      {adapter && <IntegrationCard adapter={adapter} actions={integration} settings={settings} returnTo={returnTo} />}

      {data.mode === 'manual' && (
        <CreateRequestFromCall templates={ctx.snapshot?.form_templates ?? []} isTest={mode === 'wizard'} />
      )}

      {automated && (
        <>
          <section aria-labelledby="sec-voice-basic" className="grid gap-4 sm:grid-cols-2">
            <h2 id="sec-voice-basic" className="text-sm font-semibold text-slate-800 sm:col-span-2">
              Número y horario
            </h2>
            <TextField label="Número principal" type="tel" required value={data.main_number} onChange={(e) => set({ main_number: e.target.value }, e.target.value)} error={err('main_number')} />
            <SelectField label="Zona horaria" required value={data.timezone} onChange={(e) => set({ timezone: e.target.value })} error={err('timezone')} options={TIMEZONES.map((t) => ({ value: t, label: t }))} />
            <div className="sm:col-span-2">
              <BusinessHoursEditor value={data.hours} onChange={(v) => set({ hours: v })} error={err('hours')} />
            </div>
            <TextField label="Teléfono de desbordamiento" type="tel" value={data.overflow_number} onChange={(e) => set({ overflow_number: e.target.value })} error={err('overflow_number')} hint="Si nadie atiende o fuera de horario." />
            <ChipsField label="Idiomas" values={data.languages} onChange={(v) => set({ languages: v })} suggestions={['es', 'en', 'pt', 'ca']} />
          </section>

          <section aria-labelledby="sec-voice-notices" className="space-y-1 divide-y divide-slate-100">
            <h2 id="sec-voice-notices" className="pb-2 text-sm font-semibold text-slate-800">
              Mensajes y avisos legales
            </h2>
            <TextareaField label="Mensaje de bienvenida" rows={2} value={data.welcome_message} onChange={(e) => set({ welcome_message: e.target.value })} />
            <ToggleField label="Aviso de grabación" description="Obligatorio si se graban llamadas." checked={data.recording_notice} onChange={(c) => set({ recording_notice: c })} error={err('recording_notice')} />
            <ToggleField label="Aviso de transcripción" description="Obligatorio si se transcriben llamadas." checked={data.transcription_notice} onChange={(c) => set({ transcription_notice: c })} error={err('transcription_notice')} />
            <ToggleField label="Requerir consentimiento" description="El agente pide consentimiento antes de recoger datos." checked={data.consent_required} onChange={(c) => set({ consent_required: c })} error={err('consent_required')} />
          </section>

          <section aria-labelledby="sec-voice-flow" className="space-y-4">
            <h2 id="sec-voice-flow" className="text-sm font-semibold text-slate-800">
              Flujo de la llamada
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Tiempo máximo de espera (s)" type="number" inputMode="numeric" value={data.max_wait_seconds} onChange={(e) => set({ max_wait_seconds: Number(e.target.value) })} error={err('max_wait_seconds')} />
              <TextField label="Duración máxima (min)" type="number" inputMode="numeric" value={data.max_duration_minutes} onChange={(e) => set({ max_duration_minutes: Number(e.target.value) })} error={err('max_duration_minutes')} />
              <SelectField
                label="Enviar formulario por"
                value={data.send_form_via}
                onChange={(e) => set({ send_form_via: e.target.value as Data['send_form_via'] })}
                options={[
                  { value: 'sms', label: 'SMS' },
                  { value: 'whatsapp', label: 'WhatsApp' },
                  { value: 'email', label: 'Email' },
                  { value: 'none', label: 'No enviar automáticamente' },
                ]}
              />
            </div>
            <ToggleField label="Transferencia a empleado" description="Permite pasar la llamada a una extensión." checked={data.transfer_to_employee} onChange={(c) => set({ transfer_to_employee: c })} />
            <ToggleField label="Programación de llamadas" description="El agente puede proponer una cita telefónica." checked={data.scheduling_enabled} onChange={(c) => set({ scheduling_enabled: c })} />

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium text-slate-600">Extensiones</p>
                <button type="button" onClick={() => set({ extensions: [...data.extensions, { name: '', number: '' }] })} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Añadir
                </button>
              </div>
              {data.extensions.length === 0 && <p className="text-xs text-slate-400">Sin extensiones.</p>}
              <ul className="space-y-2">
                {data.extensions.map((ext, i) => (
                  <li key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                    <TextField label={`Nombre (ext. ${i + 1})`} value={ext.name} onChange={(e) => setExt(i, { name: e.target.value })} error={err(`extensions.${i}`)} />
                    <TextField label="Número" type="tel" value={ext.number} onChange={(e) => setExt(i, { number: e.target.value })} />
                    <button type="button" onClick={() => set({ extensions: data.extensions.filter((_, idx) => idx !== i) })} className="mb-[2px] rounded-xl border border-slate-200 p-2.5 text-slate-400 hover:text-red-500" aria-label={`Quitar extensión ${i + 1}`}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
