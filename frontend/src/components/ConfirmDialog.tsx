import { useEffect, useId, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

interface ConfirmDialogProps {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'default' | 'danger' | 'warning'
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Diálogo de confirmación accesible: role="dialog", foco atrapado, Escape cierra,
 * foco devuelto al elemento que lo abrió.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel,
  tone = 'default',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation()
  const titleId = useId()
  const descId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    previouslyFocused.current = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    const focusables = () =>
      Array.from(panel?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? [])
    focusables()[0]?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
      if (e.key === 'Tab') {
        const els = focusables()
        if (els.length === 0) return
        const first = els[0]
        const last = els[els.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previouslyFocused.current?.focus()
    }
  }, [open, onCancel])

  if (!open) return null

  const confirmCls =
    tone === 'danger'
      ? 'bg-red-600 hover:bg-red-700 focus-visible:ring-red-400'
      : tone === 'warning'
        ? 'bg-amber-600 hover:bg-amber-700 focus-visible:ring-amber-400'
        : 'bg-brand-600 hover:bg-brand-700 focus-visible:ring-brand-400'

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4" onClick={onCancel}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-float"
      >
        <h2 id={titleId} className="text-lg font-bold text-slate-900">
          {title}
        </h2>
        <div id={descId} className="mt-2 text-sm text-slate-600">
          {children}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          >
            {cancelLabel ?? t('common.actions.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`rounded-xl px-4 py-2 text-sm font-semibold text-white transition focus:outline-none focus-visible:ring-2 disabled:opacity-60 ${confirmCls}`}
          >
            {busy ? t('common.actions.oneMoment') : (confirmLabel ?? t('common.actions.confirm'))}
          </button>
        </div>
      </div>
    </div>
  )
}
