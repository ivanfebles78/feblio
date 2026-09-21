import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { t } from '../../i18n'
import { Button } from '../../components/v2/Button'
import { Card, CardHeader } from '../../components/v2/Card'
import { CheckboxField, RadioCards, SelectField, TextField, TextareaField } from '../../components/forms/Field'
import { crearSolicitud, generarEnlace, listClientes, listFormTemplates } from '../../lib/solicitudes/api'
import { CHANNEL_ORDER, channelLabel } from '../../lib/solicitudes/status'
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
  if (f.mode === 'existing' && !f.cliente_id) errs.cliente_id = t('requests.new.validation.pickClient')
  if (!f.contact_name.trim()) errs.contact_name = t('requests.new.validation.contactName')
  if (f.contact_email && !validateEmail(f.contact_email).ok) errs.contact_email = t('requests.new.validation.email')
  if (!f.title.trim()) errs.title = t('requests.new.validation.title')
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
  const { t } = useTranslation()
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
      .then(([c, tpl]) => {
        if (!alive) return
        setClientes(c)
        setTemplates(tpl)
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
      setServerError(err instanceof Error ? err.message : t('requests.api.create'))
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link to={EMPRESA_PATHS.solicitudes} className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t('requests.backToList')}
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t('requests.new.title')}</h1>
        <p className="mt-1 text-sm text-slate-600">{t('requests.new.subtitle')}</p>
      </div>

      <form onSubmit={submit} noValidate className="space-y-5">
        <Card className="space-y-4 p-5">
          <CardHeader title={t('requests.new.client.title')} description={t('requests.new.client.description')} />
          <RadioCards<Mode>
            legend={t('requests.new.client.legend')}
            name="mode"
            value={form.mode}
            onChange={(v) => set('mode', v)}
            options={[
              { value: 'new', label: t('requests.new.client.newLabel'), description: t('requests.new.client.newDescription') },
              { value: 'existing', label: t('requests.new.client.existingLabel'), description: t('requests.new.client.existingDescription') },
            ]}
          />
          {form.mode === 'existing' && (
            <SelectField
              label={t('requests.new.client.select')}
              required
              value={form.cliente_id}
              onChange={(e) => pickCliente(e.target.value)}
              options={clientes.map((c) => ({ value: c.id, label: c.name }))}
              placeholder={clientes.length ? t('requests.new.client.selectPlaceholder') : t('requests.new.client.noClients')}
              error={errors.cliente_id}
            />
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label={t('requests.new.fields.contactName')} required value={form.contact_name} onChange={(e) => set('contact_name', e.target.value)} error={errors.contact_name} autoComplete="off" className="sm:col-span-2" />
            <TextField label={t('requests.new.fields.email')} type="email" value={form.contact_email} onChange={(e) => set('contact_email', e.target.value)} error={errors.contact_email} autoComplete="off" hint={t('requests.new.fields.emailHint')} />
            <TextField label={t('requests.new.fields.phone')} type="tel" value={form.contact_phone} onChange={(e) => set('contact_phone', e.target.value)} autoComplete="off" />
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <CardHeader title={t('requests.new.request.title')} description={t('requests.new.request.description')} />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label={t('requests.new.fields.channel')}
              value={form.source_channel}
              onChange={(e) => set('source_channel', e.target.value as SourceChannel)}
              options={CHANNEL_ORDER.map((c) => ({ value: c, label: channelLabel(c) }))}
            />
            <TextField label={t('requests.new.fields.serviceType')} value={form.service_type} onChange={(e) => set('service_type', e.target.value)} placeholder={t('requests.new.fields.serviceTypePlaceholder')} />
            <TextField label={t('requests.new.fields.subject')} required value={form.title} onChange={(e) => set('title', e.target.value)} error={errors.title} className="sm:col-span-2" placeholder={t('requests.new.fields.subjectPlaceholder')} />
            <TextareaField label={t('requests.new.fields.notes')} rows={4} value={form.description} onChange={(e) => set('description', e.target.value)} className="sm:col-span-2" hint={t('requests.new.fields.notesHint')} />
            <TextField label={t('requests.new.fields.deadline')} type="date" value={form.deadline} onChange={(e) => set('deadline', e.target.value)} />
            <SelectField
              label={t('requests.new.fields.template')}
              value={form.form_template_id}
              onChange={(e) => set('form_template_id', e.target.value)}
              options={templates.map((tpl) => ({ value: tpl.id, label: tpl.is_default ? t('requests.new.fields.templateDefault', { name: tpl.name }) : tpl.name }))}
              placeholder={templates.length ? t('requests.new.fields.templatePlaceholder') : t('requests.new.fields.noTemplates')}
              hint={t('requests.new.fields.templateHint')}
            />
          </div>
          <CheckboxField label={t('requests.new.generateLink')} checked={form.generate_link} onChange={(v) => set('generate_link', v)} hint={t('requests.new.generateLinkHint')} />
        </Card>

        {serverError && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            {serverError}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => navigate(EMPRESA_PATHS.solicitudes)} disabled={saving}>
            {t('common.actions.cancel')}
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? t('requests.new.creating') : t('requests.new.submit')}
          </Button>
        </div>
      </form>
    </div>
  )
}
