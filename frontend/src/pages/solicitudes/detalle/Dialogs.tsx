import { useState } from 'react'
import { Check, Copy, Plus, Trash2 } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import { Modal } from '../../../components/v2/Modal'
import { Button } from '../../../components/v2/Button'
import { INPUT_CLS, TextareaField } from '../../../components/forms/Field'
import { formatDate } from '../../../lib/intl'
import type { AnalysisItem } from '../../../lib/solicitudes/types'
import { analysisItemLabel } from '../../../lib/solicitudes/analysis'

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
  const { t } = useTranslation()
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
    <Modal open={open} onClose={onClose} title={t('requests.dialogs.link.title')} description={t('requests.dialogs.link.description')}>
      {link ? (
        <div className="space-y-3">
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
            {t('requests.dialogs.link.copyWarning')}
          </p>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">{t('requests.dialogs.link.secureLink')}</span>
            <div className="flex gap-2">
              <input readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} className={`${FIELD_CLS} font-mono text-xs`} data-autofocus="true" />
              <Button type="button" variant="secondary" onClick={() => void copy()} leading={copied ? <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />} aria-live="polite">
                {copied ? t('common.actions.copied') : t('common.actions.copy')}
              </Button>
            </div>
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">{t('requests.dialogs.link.expiresOn', { date: formatDate(link.expires_at) })}</p>
            <Button type="button" variant="ghost" size="sm" onClick={() => void onRevoke()} disabled={busy} leading={<Trash2 className="h-4 w-4" aria-hidden="true" />}>
              {t('requests.dialogs.link.revoke')}
            </Button>
          </div>
        </div>
      ) : activeExpiresAt ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-700">
            <Trans i18nKey="requests.dialogs.link.activeInfo" values={{ date: formatDate(activeExpiresAt) }} components={{ strong: <strong /> }} />
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void onGenerate()} disabled={busy}>
              {busy ? t('requests.dialogs.link.generating') : t('requests.dialogs.link.generateNew')}
            </Button>
            <Button type="button" variant="secondary" onClick={() => void onRevoke()} disabled={busy} leading={<Trash2 className="h-4 w-4" aria-hidden="true" />}>
              {t('requests.dialogs.link.revoke')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-700">{t('requests.dialogs.link.noActive')}</p>
          <Button type="button" onClick={() => void onGenerate()} disabled={busy}>
            {busy ? t('requests.dialogs.link.generating') : t('requests.dialogs.link.generate')}
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
  const { t } = useTranslation()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [custom, setCustom] = useState<RequestInfoItem[]>([])
  const [customLabel, setCustomLabel] = useState('')
  const [customKind, setCustomKind] = useState<'field' | 'document'>('document')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)

  const suggestions: RequestInfoItem[] = [
    ...suggestedFields.map((f) => ({ kind: 'field' as const, key: f.key, label: analysisItemLabel(f) })),
    ...suggestedDocuments.map((d) => ({ kind: 'document' as const, key: d.key, label: analysisItemLabel(d) })),
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
      setError(t('requests.dialogs.requestInfo.validation'))
      return
    }
    setError(null)
    try {
      await onSubmit(items, message.trim())
      setSelected(new Set())
      setCustom([])
      setMessage('')
    } catch (e) {
      setError(e instanceof Error ? e.message : t('requests.api.requestInfo'))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('requests.dialogs.requestInfo.title')}
      description={t('requests.dialogs.requestInfo.description')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('common.actions.cancel')}
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy ? t('common.actions.sending') : t('requests.dialogs.requestInfo.submit')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {suggestions.length > 0 && (
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-700">{t('requests.dialogs.requestInfo.suggestedLegend')}</legend>
            <ul className="space-y-1.5">
              {suggestions.map((s) => {
                const k = `${s.kind}:${s.key}`
                return (
                  <li key={k}>
                    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50 focus-within:ring-2 focus-within:ring-brand-300">
                      <input type="checkbox" checked={selected.has(k)} onChange={() => toggle(k)} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-300" />
                      <span className="flex-1 text-slate-800">{s.label}</span>
                      <span className="text-xs text-slate-500">{t(`requests.kind.${s.kind}`)}</span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </fieldset>
        )}
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">{t('requests.dialogs.requestInfo.addCustom')}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="flex-1">
              <span className="sr-only">{t('requests.dialogs.requestInfo.customLabel')}</span>
              <input value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustom())} placeholder={t('requests.dialogs.requestInfo.customPlaceholder')} className={FIELD_CLS} data-autofocus="true" />
            </label>
            <label>
              <span className="sr-only">{t('requests.dialogs.requestInfo.typeLabel')}</span>
              <select value={customKind} onChange={(e) => setCustomKind(e.target.value as 'field' | 'document')} className={FIELD_CLS}>
                <option value="document">{t('requests.kind.document')}</option>
                <option value="field">{t('requests.kind.field')}</option>
              </select>
            </label>
            <Button type="button" variant="secondary" onClick={addCustom} leading={<Plus className="h-4 w-4" aria-hidden="true" />}>
              {t('common.actions.add')}
            </Button>
          </div>
          {custom.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={t('requests.dialogs.requestInfo.addedList')}>
              {custom.map((c, i) => (
                <li key={`${c.label}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-800 ring-1 ring-brand-100">
                  {c.label}
                  <button type="button" onClick={() => setCustom((prev) => prev.filter((_, j) => j !== i))} className="rounded-full text-brand-500 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400" aria-label={t('requests.dialogs.requestInfo.remove', { label: c.label })}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <TextareaField label={t('requests.dialogs.requestInfo.message')} rows={3} value={message} onChange={(e) => setMessage(e.target.value)} hint={t('requests.dialogs.requestInfo.messageHint')} />
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
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  async function submit() {
    if (reason.trim().length < 3) {
      setError(t('requests.dialogs.close.validation'))
      return
    }
    setError(null)
    try {
      await onSubmit(reason.trim())
      setReason('')
    } catch (e) {
      setError(e instanceof Error ? e.message : t('requests.dialogs.close.failed'))
    }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('requests.dialogs.close.title')}
      description={t('requests.dialogs.close.description')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('common.actions.cancel')}
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy ? t('requests.dialogs.close.closing') : t('requests.dialogs.close.title')}
          </Button>
        </>
      }
    >
      <TextareaField label={t('requests.dialogs.close.reason')} required rows={3} value={reason} onChange={(e) => setReason(e.target.value)} error={error ?? undefined} placeholder={t('requests.dialogs.close.reasonPlaceholder')} />
    </Modal>
  )
}
