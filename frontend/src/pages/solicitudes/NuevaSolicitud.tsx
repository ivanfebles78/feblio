import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button } from '../../components/v2/Button'
import { Card, CardHeader } from '../../components/v2/Card'
import { CheckboxField, RadioCards, SelectField, TextField, TextareaField } from '../../components/forms/Field'
import { crearSolicitud, generarEnlace, listClientes, listFormTemplates } from '../../lib/solicitudes/api'
import { CHANNEL_LABEL } from '../../lib/solicitudes/status'
import type { NuevaSolicitudInput, SourceChannel } from '../../lib/solicitudes/types'
import { EMPRESA_PATHS, solicitudPath } from '../../lib/routing'
import { validateEmail } from '../../lib/validation'

type Mode = 'existing' | 'new'

interface FormState {
  mode: Mode
  cliente_id: string
  contact_name: string
  contact_email: string
  contact_phone: string
  source_channel: SourceChannel
  title: string
  service_type: string
  description: string
  deadline: string
  form_template_id: string
  generate_link: boolean
}

const INITIAL: FormState = {
  mode: 'new',
  cliente_id: '',
  contact_name: '',
  contact_email: '',
  contact_phone: '',
  source_channel: 'llamada',
  title: '',
  service_type: '',
  description: '',
  deadline: '',
  form_template_id: '',
  generate_link: true,
}

export function validateNueva(f: FormState): Record<string, string> {
  const errs: Record<string, string> = {}
  if (f.mode === 'existing' && !f.cliente_id) errs.cliente_id = 'Elige un cliente.'
  if (!f.contact_name.trim()) errs.contact_name = 'Indica el nombre de la persona de contacto.'
  if (f.contact_email && !validateEmail(f.contact_email).ok) errs.contact_email = 'Escribe un correo válido.'
  if (!f.title.trim()) errs.title = 'Resume en una línea qué pide el cliente.'
  return errs
}

export function toInput(f: FormState): NuevaSolicitudInput {
  return {
    cliente_id: f.mode === 'existing' ? f.cliente_id : null,
    contact_name: f.contact_name.trim(),
    contact_email: f.contact_email.trim() || undefined,
    contact_phone: f.contact_phone.trim() || undefined,
    source_channel: f.source_channel,
    title: f.title.trim(),
    service_type: f.service_type.trim() || undefined,
    description: f.description.trim() || undefined,
    deadline: f.deadline || undefined,
    form_template_id: f.form_template_id || null,
  }
}

export default function NuevaSolicitud() {
  const navigate = useNavigate()
  const [form, setForm] = useState<FormState>(INITIAL)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [clientes, setClientes] = useState<{ id: string; name: string; email: string | null }[]>([])
  const [templates, setTemplates] = useState<{ id: string; name: string; is_default: boolean }[]>([])
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    Promise.all([listClientes(), listFormTemplates()])
      .then(([c, t]) => {
        if (!alive) return
        setClientes(c)
        setTemplates(t)
      })
      .catch((e: Error) => alive && setServerError(e.message))
    return () => {
      alive = false
    }
  }, [])

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))

  useEffect(() => {
    // Tras validar, lleva el foco al primer campo con error (ya renderizado con aria-invalid)
    if (Object.keys(errors).length > 0) document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [errors])

  function pickCliente(id: string) {
    const c = clientes.find((x) => x.id === id)
    setForm((f) => ({ ...f, cliente_id: id, contact_name: f.contact_name || c?.name || '', contact_email: f.contact_email || c?.email || '' }))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const errs = validateNueva(form)
    setErrors(errs)
    if (Object.keys(errs).length > 0) return
    setSaving(true)
    setServerError(null)
    try {
      const id = await crearSolicitud(toInput(form))
      const enlace = form.generate_link ? await generarEnlace(id) : null
      navigate(solicitudPath(id), { replace: true, state: enlace ? { enlace } : undefined })
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'No se pudo crear la solicitud.')
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link to={EMPRESA_PATHS.solicitudes} className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Volver a solicitudes
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Nueva solicitud</h1>
        <p className="mt-1 text-sm text-slate-600">Registra lo que el cliente ha pedido por llamada, email o mensaje. Después podrás enviarle un enlace seguro para completar los datos.</p>
      </div>

      <form onSubmit={submit} noValidate className="space-y-5">
        <Card className="space-y-4 p-5">
          <CardHeader title="Cliente" description="Elige un cliente existente o registra un contacto nuevo." />
          <RadioCards<Mode>
            legend="Tipo de cliente"
            name="mode"
            value={form.mode}
            onChange={(v) => set('mode', v)}
            options={[
              { value: 'new', label: 'Contacto nuevo', description: 'Aún no está en tu lista de clientes.' },
              { value: 'existing', label: 'Cliente existente', description: 'Ya trabajas con esta persona o empresa.' },
            ]}
          />
          {form.mode === 'existing' && (
            <SelectField
              label="Cliente"
              required
              value={form.cliente_id}
              onChange={(e) => pickCliente(e.target.value)}
              options={clientes.map((c) => ({ value: c.id, label: c.name }))}
              placeholder={clientes.length ? 'Selecciona un cliente…' : 'No tienes clientes todavía'}
              error={errors.cliente_id}
            />
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Persona de contacto" required value={form.contact_name} onChange={(e) => set('contact_name', e.target.value)} error={errors.contact_name} autoComplete="off" className="sm:col-span-2" />
            <TextField label="Correo electrónico" type="email" value={form.contact_email} onChange={(e) => set('contact_email', e.target.value)} error={errors.contact_email} autoComplete="off" hint="Opcional; lo podrá completar el cliente." />
            <TextField label="Teléfono" type="tel" value={form.contact_phone} onChange={(e) => set('contact_phone', e.target.value)} autoComplete="off" />
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <CardHeader title="Qué ha pedido" description="Un resumen breve. El detalle lo aportará el cliente en el formulario." />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Canal de entrada"
              value={form.source_channel}
              onChange={(e) => set('source_channel', e.target.value as SourceChannel)}
              options={(Object.keys(CHANNEL_LABEL) as SourceChannel[]).map((c) => ({ value: c, label: CHANNEL_LABEL[c] }))}
            />
            <TextField label="Tipo de servicio" value={form.service_type} onChange={(e) => set('service_type', e.target.value)} placeholder="Reforma, asesoría, diseño…" />
            <TextField label="Asunto" required value={form.title} onChange={(e) => set('title', e.target.value)} error={errors.title} className="sm:col-span-2" placeholder="Reforma integral de local comercial" />
            <TextareaField label="Notas de la conversación" rows={4} value={form.description} onChange={(e) => set('description', e.target.value)} className="sm:col-span-2" hint="Lo que te ha contado el cliente. Se mostrará en la solicitud como descripción inicial." />
            <TextField label="Fecha límite orientativa" type="date" value={form.deadline} onChange={(e) => set('deadline', e.target.value)} />
            <SelectField
              label="Formulario para el cliente"
              value={form.form_template_id}
              onChange={(e) => set('form_template_id', e.target.value)}
              options={templates.map((t) => ({ value: t.id, label: t.is_default ? `${t.name} (por defecto)` : t.name }))}
              placeholder={templates.length ? 'Plantilla por defecto' : 'Sin plantillas activas'}
              hint="Define qué preguntas y documentos se piden."
            />
          </div>
          <CheckboxField label="Generar ahora el enlace seguro para el cliente" checked={form.generate_link} onChange={(v) => set('generate_link', v)} hint="Podrás copiarlo en la pantalla siguiente. Caduca a los 30 días y se puede revocar." />
        </Card>

        {serverError && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            {serverError}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => navigate(EMPRESA_PATHS.solicitudes)} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Creando…' : 'Crear solicitud'}
          </Button>
        </div>
      </form>
    </div>
  )
}
