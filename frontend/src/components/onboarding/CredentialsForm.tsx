import { useState, type FormEvent } from 'react'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { TextField } from '../forms/Field'
import type { AdapterDescriptor } from '../../lib/integrations/adapters'

interface CredentialsFormProps {
  adapter: AdapterDescriptor
  busy: boolean
  onSubmit: (credentials: Record<string, string>) => Promise<boolean>
}

/**
 * Formulario de credenciales introducidas por la empresa (IMAP, Meta, Twilio…).
 * Los valores viajan por HTTPS a la Edge Function, que los cifra con
 * APP_ENCRYPTION_KEY. Nunca se guardan en localStorage ni en el estado global.
 */
export function CredentialsForm({ adapter, busy, onSubmit }: CredentialsFormProps) {
  const fields = adapter.credentialFields ?? []
  const [values, setValues] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  async function submit(e: FormEvent) {
    e.preventDefault()
    const errs: Record<string, string> = {}
    for (const f of fields) if (!values[f.key]?.trim()) errs[f.key] = `${f.label} es obligatorio.`
    setErrors(errs)
    if (Object.keys(errs).length) return
    const ok = await onSubmit(values)
    if (ok) setValues({})
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3" aria-label={`Credenciales de ${adapter.label}`}>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
        <KeyRound className="h-3.5 w-3.5 text-brand-600" aria-hidden="true" /> Credenciales
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => (
          <TextField
            key={f.key}
            label={f.label}
            type={f.secret ? 'password' : 'text'}
            autoComplete="off"
            required
            value={values[f.key] ?? ''}
            onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            error={errors[f.key]}
            hint={f.hint}
            spellCheck={false}
          />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="flex items-center gap-1 text-[11px] text-slate-500">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Se cifran en el servidor y no vuelven al navegador.
        </p>
        <button type="submit" disabled={busy} className="btn-primary !px-3 !py-2 text-xs">
          {busy ? 'Verificando…' : 'Guardar y probar'}
        </button>
      </div>
    </form>
  )
}
