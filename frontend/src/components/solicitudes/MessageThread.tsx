import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Send } from 'lucide-react'
import { Button } from '../v2/Button'
import { INPUT_CLS } from '../forms/Field'
import { formatDateTime } from '../../lib/solicitudes/format'
import type { AuthorKind, MessageKind } from '../../lib/solicitudes/types'

export interface ThreadMessage {
  id: string
  author_kind: AuthorKind
  author_name: string
  kind: MessageKind
  body: string
  created_at: string
  /** Leído por la otra parte (solo aplica a los mensajes propios). */
  read?: boolean
}

export interface MessageThreadProps {
  messages: ThreadMessage[]
  /** Quién mira la conversación: alinea sus mensajes a la derecha. */
  viewer: 'empresa' | 'cliente'
  onSend: (body: string) => Promise<void>
  disabled?: boolean
  disabledReason?: string
  placeholder?: string
  emptyText?: string
}

export const MAX_MESSAGE_LENGTH = 4000

/**
 * Conversación empresa ↔ cliente. Sin mensajes internos privados: todo lo que se escribe
 * lo ve la otra parte. Los avisos del sistema y las peticiones de información se
 * muestran centrados y diferenciados.
 */
export function MessageThread({ messages, viewer, onSend, disabled = false, disabledReason, placeholder = 'Escribe un mensaje…', emptyText = 'Todavía no hay mensajes.' }: MessageThreadProps) {
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const listRef = useRef<HTMLOListElement>(null)
  const lastCount = useRef(0)

  useEffect(() => {
    // Solo desplaza la lista interna (no la página) cuando llegan mensajes nuevos
    if (messages.length > lastCount.current && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
    lastCount.current = messages.length
  }, [messages.length])

  async function submit(e: FormEvent) {
    e.preventDefault()
    const text = body.trim()
    if (!text || sending) return
    setSending(true)
    setError(null)
    try {
      await onSend(text)
      setBody('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar el mensaje.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col">
      <ol ref={listRef} className="max-h-[28rem] space-y-3 overflow-y-auto pr-1" aria-label="Mensajes" aria-live="polite">
        {messages.length === 0 && <li className="py-6 text-center text-sm text-slate-500">{emptyText}</li>}
        {messages.map((m) => {
          if (m.author_kind === 'sistema' || m.kind === 'system') {
            return (
              <li key={m.id} className="flex justify-center">
                <p className="max-w-[85%] rounded-full bg-slate-100 px-3 py-1 text-center text-xs text-slate-600">
                  {m.body} · <time dateTime={m.created_at}>{formatDateTime(m.created_at)}</time>
                </p>
              </li>
            )
          }
          const mine = m.author_kind === viewer
          const infoRequest = m.kind === 'info_request'
          return (
            <li key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-[0_1px_2px_rgba(15,23,42,.04)] ${
                infoRequest ? 'border border-amber-200 bg-amber-50 text-amber-950' : mine ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-white text-slate-800'
              }`}>
                <p className={`mb-1 text-[11px] font-semibold ${infoRequest ? 'text-amber-800' : mine ? 'text-brand-100' : 'text-slate-500'}`}>
                  {infoRequest ? 'Información solicitada · ' : ''}
                  {m.author_name}
                </p>
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className={`mt-1 text-[11px] ${infoRequest ? 'text-amber-700' : mine ? 'text-brand-100' : 'text-slate-500'}`}>
                  <time dateTime={m.created_at}>{formatDateTime(m.created_at)}</time>
                  {mine && m.read !== undefined && <span> · {m.read ? 'Leído' : 'Enviado'}</span>}
                </p>
              </div>
            </li>
          )
        })}
      </ol>
      <form onSubmit={submit} className="mt-3 border-t border-slate-100 pt-3">
        <label htmlFor="thread-composer" className="sr-only">
          Nuevo mensaje
        </label>
        <textarea
          id="thread-composer"
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void submit(e)
          }}
          rows={2}
          disabled={disabled || sending}
          placeholder={disabled ? (disabledReason ?? 'La conversación está cerrada.') : placeholder}
          className={`${INPUT_CLS} border-slate-200 focus:border-brand-400 focus:ring-brand-100 resize-y`}
          aria-describedby="thread-composer-hint"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p id="thread-composer-hint" className="text-xs text-slate-500">
            {disabled ? (disabledReason ?? '') : 'La otra parte recibirá una notificación. Ctrl+Intro para enviar.'}
          </p>
          <Button type="submit" size="sm" disabled={disabled || sending || !body.trim()} leading={<Send className="h-4 w-4" aria-hidden="true" />}>
            {sending ? 'Enviando…' : 'Enviar'}
          </Button>
        </div>
        {error && (
          <p className="mt-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
      </form>
    </div>
  )
}
