import { useState, type FormEvent } from 'react'
import { Check, Copy, PhoneCall } from 'lucide-react'
import { CheckboxField, SelectField, TextField, TextareaField } from '../forms/Field'
import { createRequestFromCall } from '../../lib/onboarding/api'
import { validateEmail, validatePhone, validateRequiredText } from '../../lib/validation'
import type { IntakeFormTemplate } from '../../lib/onboarding/types'

interface CreateRequestFromCallProps {
  templates: IntakeFormTemplate[]
  /** Marca lo creado como datos de prueba (sandbox) */
  isTest?: boolean
  onCreated?: () => void
}

const EMPTY = { name: '', phone: '', email: '', reason: '', form_template_id: '', notes: '', consent: false, send_via: 'copy' }

/** Acción rápida: registrar una llamada y generar la solicitud + enlace del formulario. */
export function CreateRequestFromCall({ templates, isTest = false, onCreated }: CreateRequestFromCallProps) {
  const [v, setV] = useState({ ...EMPTY, form_template_id: templates.find((t) => t.is_default)?.id ?? '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ token: string } | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const errs: Record<string, string> = {}
    const n = validateRequiredText(v.name, 'Indica el nombre del cliente.')
    if (!n.ok) errs.name = n.message!
    const p = validatePhone(v.phone, { required: true })
    if (!p.ok) errs.phone = p.message!
    if (v.email) {
      const em = validateEmail(v.email)
      if (!em.ok) errs.email = em.message!
    }
    if (!v.reason.trim()) errs.reason = 'Indica el motivo de la llamada.'
    if (!v.consent) errs.consent = 'Debes registrar que el cliente ha dado su consentimiento.'
    if (v.send_via === 'email' && !v.email) errs.email = 'Para enviar por email necesitas el email del cliente.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    setApiError(null)
    try {
      const res = await createRequestFromCall({ ...v, is_test: isTest })
      setResult({ token: res.token })
      onCreated?.()
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'No se pudo crear la solicitud.')
    } finally {
      setBusy(false)
    }
  }

  const link = result ? `${window.location.origin}/form/${result.token}` : ''

  if (result) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900" role="status">
        <p className="flex items-center gap-2 font-semibold">
          <Check className="h-4 w-4" aria-hidden="true" /> Solicitud creada{isTest ? ' (prueba)' : ''}.
        </p>
        <p className="mt-1 text-xs">Enlace del formulario para el cliente:</p>
        <div className="mt-1 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-2 py-1 text-xs">{link}</code>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(link)
              setCopied(true)
              setTimeout(() => setCopied(false), 1800)
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-emerald-100"
          >
            {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />} {copied ? 'Copiado' : 'Copiar'}
          </button>
        </div>
        <p className="mt-2 text-xs">
          Canal elegido para enviar la URL: <strong>{v.send_via === 'copy' ? 'copiar enlace' : v.send_via}</strong>. El envío automático por SMS/WhatsApp requiere ese canal conectado; mientras tanto, la tarea queda en tu bandeja de pendientes.
        </p>
        <button type="button" onClick={() => setResult(null)} className="mt-3 text-xs font-semibold underline">
          Registrar otra llamada
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3 rounded-xl border border-slate-200 p-4" aria-labelledby="crc-title">
      <h3 id="crc-title" className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        <PhoneCall className="h-4 w-4 text-brand-600" aria-hidden="true" /> Crear solicitud desde llamada
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Nombre del cliente" required value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} error={errors.name} />
        <TextField label="Teléfono" type="tel" required value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} error={errors.phone} />
        <TextField label="Email" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} error={errors.email} />
        <SelectField label="Tipo de formulario" value={v.form_template_id} onChange={(e) => setV({ ...v, form_template_id: e.target.value })} options={templates.map((t) => ({ value: t.id, label: t.name }))} placeholder="Predeterminado" />
        <TextField label="Motivo" required value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} error={errors.reason} className="sm:col-span-2" />
        <TextareaField label="Notas" rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} className="sm:col-span-2" />
        <SelectField
          label="Canal para enviar la URL"
          value={v.send_via}
          onChange={(e) => setV({ ...v, send_via: e.target.value })}
          options={[
            { value: 'copy', label: 'Copiar enlace (lo envío yo)' },
            { value: 'sms', label: 'SMS' },
            { value: 'whatsapp', label: 'WhatsApp' },
            { value: 'email', label: 'Email' },
          ]}
        />
      </div>
      <CheckboxField required checked={v.consent} onChange={(c) => setV({ ...v, consent: c })} error={errors.consent} label="El cliente ha dado su consentimiento para que tratemos sus datos y le enviemos el formulario." />
      {apiError && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {apiError}
        </p>
      )}
      <button type="submit" disabled={busy} className="btn-primary !py-2.5 text-sm">
        {busy ? 'Creando…' : 'Crear solicitud'}
      </button>
    </form>
  )
}
