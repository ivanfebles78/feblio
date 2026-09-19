import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AlertCircle, CheckCircle2, ShieldCheck } from 'lucide-react'
import { Logo } from '../components/Logo'
import { Button } from '../components/v2/Button'
import { StatusPill } from '../components/v2/Card'
import { MessageThread } from '../components/solicitudes/MessageThread'
import { ClienteForm, validateClienteForm, type ClienteFormData } from '../components/solicitudes/ClienteForm'
import * as api from '../lib/solicitudes/api'
import { clientObjectPath, uploadSolicitudFile } from '../lib/solicitudes/files'
import { formatDate, formatDateTime } from '../lib/solicitudes/format'
import type { ClienteVista, SolicitudStatus } from '../lib/solicitudes/types'

/** Estados traducidos para el cliente (sin jerga interna). */
const CLIENT_STATUS: Record<SolicitudStatus, { label: string; tone: 'pending' | 'info' | 'success' | 'neutral' }> = {
  draft: { label: 'Pendiente de completar', tone: 'pending' },
  awaiting_client: { label: 'Pendiente de completar', tone: 'pending' },
  submitted: { label: 'Recibida', tone: 'info' },
  under_review: { label: 'En revisión', tone: 'info' },
  missing_information: { label: 'Necesitamos más información', tone: 'pending' },
  ready_for_scope: { label: 'Información completa', tone: 'success' },
  closed: { label: 'Cerrada', tone: 'neutral' },
}
const EDITABLE: SolicitudStatus[] = ['draft', 'awaiting_client', 'missing_information']

function initialData(v: ClienteVista): ClienteFormData {
  const out: ClienteFormData = {}
  for (const [k, val] of Object.entries(v.solicitud.form_data ?? {})) if (val !== null && val !== undefined) out[k] = String(val)
  out.contact_name = out.contact_name ?? v.solicitud.contact_name ?? ''
  out.contact_email = out.contact_email ?? v.solicitud.contact_email ?? ''
  out.contact_phone = out.contact_phone ?? v.solicitud.contact_phone ?? ''
  return out
}

function InvalidLink() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <Logo size={32} />
      <h1 className="mt-6 text-xl font-semibold text-slate-900">Este enlace no está disponible</h1>
      <p className="mt-2 text-sm text-slate-600">Puede haber caducado o haberse desactivado. Si necesitas seguir con tu solicitud, ponte en contacto con la empresa que te lo envió para que te facilite uno nuevo.</p>
    </main>
  )
}

/** Página pública del cliente: acceso por enlace seguro, sin cuenta ni identificadores internos. */
export default function SolicitudCliente() {
  const { token = '' } = useParams()
  const [vista, setVista] = useState<ClienteVista | null>(null)
  const [invalid, setInvalid] = useState(false)
  const [data, setData] = useState<ClienteFormData>({})
  const [consents, setConsents] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<'draft' | 'submit' | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [dirty, setDirty] = useState(false)

  const apply = useCallback((v: ClienteVista, resetForm: boolean) => {
    setVista(v)
    if (resetForm) {
      setData(initialData(v))
      setDirty(false)
    }
  }, [])

  useEffect(() => {
    let alive = true
    if (!token || token.length < 32) {
      setInvalid(true)
      return
    }
    api
      .clienteObtener(token)
      .then((v) => {
        if (!alive) return
        apply(v, true)
        if (v.mensajes.some((m) => m.author_kind === 'empresa' && !m.read)) void api.clienteMarcarLeido(token).catch(() => undefined)
      })
      .catch(() => alive && setInvalid(true))
    return () => {
      alive = false
    }
  }, [token, apply])

  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  useEffect(() => {
    if (Object.keys(errors).length > 0) document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [errors])

  const editable = useMemo(() => !!vista && EDITABLE.includes(vista.solicitud.status), [vista])

  function payload(): Record<string, string> {
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(data)) if (v.trim() !== '') out[k] = v.trim()
    return out
  }

  async function saveDraft() {
    setSaving('draft')
    setNotice(null)
    try {
      apply(await api.clienteGuardar(token, payload()), false)
      setDirty(false)
      setNotice({ tone: 'ok', text: 'Borrador guardado. Puedes volver a este enlace cuando quieras.' })
    } catch (e) {
      setNotice({ tone: 'error', text: e instanceof Error ? e.message : 'No se pudo guardar.' })
    } finally {
      setSaving(null)
    }
  }

  async function submit() {
    if (!vista) return
    const errs = validateClienteForm(data, vista, consents)
    setErrors(errs)
    if (Object.keys(errs).length > 0) {
      setNotice({ tone: 'error', text: 'Revisa los campos marcados antes de enviar.' })
      return
    }
    setSaving('submit')
    setNotice(null)
    try {
      const consentKeys = Object.entries(consents)
        .filter(([, v]) => v)
        .map(([k]) => k)
      apply(await api.clienteEnviar(token, { ...payload(), ...(consentKeys.length ? { consents: consentKeys.join(',') } : {}) }), true)
      setNotice({ tone: 'ok', text: 'Formulario enviado. Te avisaremos por este mismo enlace si necesitamos algo más.' })
      // Tras el re-render, lleva al aviso de confirmación (arriba)
      window.requestAnimationFrame?.(() => {
        try {
          window.scrollTo(0, 0)
        } catch {
          /* entorno sin scroll */
        }
      })
    } catch (e) {
      setNotice({ tone: 'error', text: e instanceof Error ? e.message : 'No se pudo enviar.' })
    } finally {
      setSaving(null)
    }
  }

  async function upload(file: File, mime: string, ext: string, requisitoId: string | null) {
    if (!vista) return
    const path = clientObjectPath(vista.access_id, ext)
    await uploadSolicitudFile(path, file, mime)
    apply(await api.clienteRegistrarDocumento(token, path, file.name, mime, file.size, requisitoId), false)
  }

  if (invalid) return <InvalidLink />
  if (!vista) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-slate-500" aria-live="polite">
        Cargando tu solicitud…
      </main>
    )
  }

  const status = CLIENT_STATUS[vista.solicitud.status]
  const pendientes = vista.requisitos.filter((r) => r.status === 'pending')
  const fieldPendientes = pendientes.filter((r) => r.kind === 'field')

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {vista.empresa?.logo_url ? <img src={vista.empresa.logo_url} alt="" width={36} height={36} className="h-9 w-9 rounded-lg object-contain" /> : <Logo size={28} />}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{vista.empresa?.name ?? 'Solicitud'}</p>
              <p className="truncate text-xs text-slate-500">Enlace seguro · válido hasta el {formatDate(vista.expires_at)}</p>
            </div>
          </div>
          <StatusPill tone={status.tone}>{status.label}</StatusPill>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{vista.solicitud.title}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {editable ? 'Completa la información y adjunta lo que tengas. Puedes guardar y volver más tarde.' : vista.solicitud.form_submitted_at ? `Enviado el ${formatDateTime(vista.solicitud.form_submitted_at)}.` : ''}
          </p>
        </div>

        {notice && (
          <p className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${notice.tone === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50 text-red-800'}`} role={notice.tone === 'ok' ? 'status' : 'alert'}>
            {notice.tone === 'ok' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
            {notice.text}
          </p>
        )}

        {pendientes.length > 0 && (
          <section aria-labelledby="pendientes" className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <h2 id="pendientes" className="text-base font-semibold text-amber-950">
              {vista.empresa?.name ?? 'La empresa'} necesita lo siguiente
            </h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
              {pendientes.map((r) => (
                <li key={r.id}>
                  {r.label} <span className="text-amber-700">({r.kind === 'document' ? 'documento' : 'dato'})</span>
                </li>
              ))}
            </ul>
            {fieldPendientes.length > 0 && <p className="mt-2 text-xs text-amber-800">Los datos puedes indicarlos en el formulario o responder en la conversación de abajo.</p>}
          </section>
        )}

        <ClienteForm
          vista={vista}
          data={data}
          onChange={(next) => {
            setData(next)
            setDirty(true)
          }}
          consents={consents}
          onConsentChange={(k, v) => setConsents((c) => ({ ...c, [k]: v }))}
          errors={errors}
          readOnly={!editable}
          onUpload={upload}
        />

        {editable && (
          <div className="sticky bottom-0 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:rounded-2xl sm:border sm:px-5">
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-500">
                <ShieldCheck className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                Tus datos solo los ve {vista.empresa?.name ?? 'la empresa'}.
              </p>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => void saveDraft()} disabled={saving !== null} className="flex-1 sm:flex-none">
                  {saving === 'draft' ? 'Guardando…' : 'Guardar borrador'}
                </Button>
                <Button onClick={() => void submit()} disabled={saving !== null} className="flex-1 sm:flex-none">
                  {saving === 'submit' ? 'Enviando…' : vista.solicitud.status === 'missing_information' ? 'Enviar información' : 'Enviar solicitud'}
                </Button>
              </div>
            </div>
          </div>
        )}

        <section aria-labelledby="conversacion" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,.04)] sm:p-6">
          <h2 id="conversacion" className="text-base font-semibold text-slate-900">
            Conversación con {vista.empresa?.name ?? 'la empresa'}
          </h2>
          <p className="mt-0.5 text-sm text-slate-600">Si tienes dudas o quieres añadir algo, escríbelo aquí.</p>
          <div className="mt-3">
            <MessageThread
              viewer="cliente"
              messages={vista.mensajes.map((m) => ({ ...m, read: m.author_kind === 'cliente' ? undefined : m.read }))}
              onSend={async (body) => apply(await api.clienteMensaje(token, body), false)}
              disabled={vista.solicitud.status === 'closed'}
              disabledReason="Esta solicitud está cerrada."
              placeholder="Escribe tu mensaje…"
              emptyText="Todavía no hay mensajes. Si tienes dudas, escríbenos."
            />
          </div>
        </section>

        <footer className="pb-6 pt-2 text-center text-xs text-slate-400">
          Formulario seguro gestionado con Feblio.
        </footer>
      </main>
    </div>
  )
}
