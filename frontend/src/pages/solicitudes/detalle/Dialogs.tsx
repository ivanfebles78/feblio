import { useState } from 'react'
import { Check, Copy, Plus, Trash2 } from 'lucide-react'
import { Modal } from '../../../components/v2/Modal'
import { Button } from '../../../components/v2/Button'
import { INPUT_CLS, TextareaField } from '../../../components/forms/Field'
import { formatDate } from '../../../lib/solicitudes/format'
import type { AnalysisItem } from '../../../lib/solicitudes/types'

const FIELD_CLS = `${INPUT_CLS} border-slate-200 focus:border-brand-400 focus:ring-brand-100`

/* ---------------- Enlace del cliente ---------------- */

export interface LinkDialogProps {
  open: boolean
  onClose: () => void
  link: { url: string; expires_at: string } | null
  /** Enlace activo (sin token, ya no se puede volver a mostrar). */
  activeExpiresAt: string | null
  onGenerate: () => Promise<void>
  onRevoke: () => Promise<void>
  busy: boolean
}

export function LinkDialog({ open, onClose, link, activeExpiresAt, onGenerate, onRevoke, busy }: LinkDialogProps) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link.url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Enlace del cliente" description="El cliente abre el formulario sin crear cuenta. El enlace caduca y se puede revocar en cualquier momento.">
      {link ? (
        <div className="space-y-3">
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
            Copia el enlace ahora: por seguridad no volverá a mostrarse. Si lo pierdes, genera uno nuevo (el anterior dejará de funcionar).
          </p>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Enlace seguro</span>
            <div className="flex gap-2">
              <input readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} className={`${FIELD_CLS} font-mono text-xs`} data-autofocus="true" />
              <Button type="button" variant="secondary" onClick={() => void copy()} leading={copied ? <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />} aria-live="polite">
                {copied ? 'Copiado' : 'Copiar'}
              </Button>
            </div>
          </label>
          <p className="text-xs text-slate-500">Caduca el {formatDate(link.expires_at)}.</p>
        </div>
      ) : activeExpiresAt ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-700">
            Hay un enlace activo que caduca el <strong>{formatDate(activeExpiresAt)}</strong>. Por seguridad no se guarda en claro: si necesitas volver a enviarlo, genera uno nuevo.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void onGenerate()} disabled={busy}>
              {busy ? 'Generando…' : 'Generar enlace nuevo'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => void onRevoke()} disabled={busy} leading={<Trash2 className="h-4 w-4" aria-hidden="true" />}>
              Revocar acceso
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-700">No hay ningún enlace activo para esta solicitud.</p>
          <Button type="button" onClick={() => void onGenerate()} disabled={busy}>
            {busy ? 'Generando…' : 'Generar enlace (30 días)'}
          </Button>
        </div>
      )}
    </Modal>
  )
}

/* ---------------- Solicitar información ---------------- */

export interface RequestInfoItem {
  kind: 'field' | 'document'
  key?: string
  label: string
}

export interface RequestInfoDialogProps {
  open: boolean
  onClose: () => void
  /** Elementos pendientes sugeridos por el último análisis. */
  suggestedFields: AnalysisItem[]
  suggestedDocuments: AnalysisItem[]
  onSubmit: (items: RequestInfoItem[], message: string) => Promise<void>
  busy: boolean
}

export function RequestInfoDialog({ open, onClose, suggestedFields, suggestedDocuments, onSubmit, busy }: RequestInfoDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [custom, setCustom] = useState<RequestInfoItem[]>([])
  const [customLabel, setCustomLabel] = useState('')
  const [customKind, setCustomKind] = useState<'field' | 'document'>('document')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)

  const suggestions: RequestInfoItem[] = [
    ...suggestedFields.map((f) => ({ kind: 'field' as const, key: f.key, label: f.label })),
    ...suggestedDocuments.map((d) => ({ kind: 'document' as const, key: d.key, label: d.label })),
  ]
  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  function addCustom() {
    const label = customLabel.trim()
    if (!label) return
    setCustom((prev) => [...prev, { kind: customKind, label }])
    setCustomLabel('')
  }
  async function submit() {
    const items = [...suggestions.filter((s) => selected.has(`${s.kind}:${s.key}`)), ...custom]
    if (items.length === 0 && !message.trim()) {
      setError('Elige al menos un elemento o escribe un mensaje.')
      return
    }
    setError(null)
    try {
      await onSubmit(items, message.trim())
      setSelected(new Set())
      setCustom([])
      setMessage('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar la petición.')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Solicitar información al cliente"
      description="El cliente verá la lista de pendientes en su enlace y recibirá un aviso. La solicitud pasará a «Falta información»."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy ? 'Enviando…' : 'Enviar petición'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {suggestions.length > 0 && (
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-700">Pendiente según la última comprobación</legend>
            <ul className="space-y-1.5">
              {suggestions.map((s) => {
                const k = `${s.kind}:${s.key}`
                return (
                  <li key={k}>
                    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50 focus-within:ring-2 focus-within:ring-brand-300">
                      <input type="checkbox" checked={selected.has(k)} onChange={() => toggle(k)} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-300" />
                      <span className="flex-1 text-slate-800">{s.label}</span>
                      <span className="text-xs text-slate-500">{s.kind === 'document' ? 'Documento' : 'Dato'}</span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </fieldset>
        )}
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Añadir otro requisito</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="flex-1">
              <span className="sr-only">Descripción del requisito</span>
              <input value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustom())} placeholder="Planos actuales del local" className={FIELD_CLS} data-autofocus="true" />
            </label>
            <label>
              <span className="sr-only">Tipo</span>
              <select value={customKind} onChange={(e) => setCustomKind(e.target.value as 'field' | 'document')} className={FIELD_CLS}>
                <option value="document">Documento</option>
                <option value="field">Dato</option>
              </select>
            </label>
            <Button type="button" variant="secondary" onClick={addCustom} leading={<Plus className="h-4 w-4" aria-hidden="true" />}>
              Añadir
            </Button>
          </div>
          {custom.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Requisitos añadidos">
              {custom.map((c, i) => (
                <li key={`${c.label}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-800 ring-1 ring-brand-100">
                  {c.label}
                  <button type="button" onClick={() => setCustom((prev) => prev.filter((_, j) => j !== i))} className="rounded-full text-brand-500 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400" aria-label={`Quitar ${c.label}`}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <TextareaField label="Mensaje para el cliente" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} hint="Opcional. Si lo dejas vacío se enviará un texto estándar con la lista." />
        {error && (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}

/* ---------------- Cerrar con motivo ---------------- */

export interface CloseDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (reason: string) => Promise<void>
  busy: boolean
}

export function CloseDialog({ open, onClose, onSubmit, busy }: CloseDialogProps) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  async function submit() {
    if (reason.trim().length < 3) {
      setError('Indica el motivo del cierre.')
      return
    }
    setError(null)
    try {
      await onSubmit(reason.trim())
      setReason('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cerrar la solicitud.')
    }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cerrar solicitud"
      description="El cliente recibirá un aviso. Podrás reabrirla mientras no exista un presupuesto asociado."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy ? 'Cerrando…' : 'Cerrar solicitud'}
          </Button>
        </>
      }
    >
      <TextareaField label="Motivo" required rows={3} value={reason} onChange={(e) => setReason(e.target.value)} error={error ?? undefined} placeholder="El cliente ha desistido / duplicada / fuera de servicio…" />
    </Modal>
  )
}
