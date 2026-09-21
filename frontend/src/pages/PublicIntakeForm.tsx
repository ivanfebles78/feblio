import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, Send, Paperclip, X, Loader2, File } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import { Logo } from '../components/Logo'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { applyCompanyLanguage, type Language } from '../i18n'
import { supabase } from '../lib/supabase'
import { serverErrorMessage, type ServerResult } from '../lib/serverErrors'

interface FormFieldDef {
  key: string
  label: string
  type: 'text' | 'email' | 'tel' | 'date' | 'select' | 'textarea' | 'number'
  required: boolean
  options?: string[]
  condition?: { field: string; equals: string }
}

interface FormInfo {
  status: 'pendiente' | 'completado' | 'caducado'
  empresa: string
  logo_url: string | null
  primary_color?: string | null
  project_types: string[]
  is_test?: boolean
  /** Idioma configurado por la empresa (migración 0015): solo se aplica si el visitante no eligió otro. */
  language?: Language | string | null
  /** Plantilla (migración 0009). Si es null se muestra el formulario básico. */
  form?: {
    name: string
    fields: FormFieldDef[]
    required_documents: { key: string; label: string; required: boolean }[]
    consents: { key: string; label: string; required: boolean }[]
  } | null
}

/** Adjunto subido al bucket privado: se guarda la ruta, nunca una URL pública. */
interface Attachment {
  name: string
  path: string
}

const BUCKET = 'intake-files'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export default function PublicIntakeForm() {
  const { t } = useTranslation()
  const { token } = useParams<{ token: string }>()
  const [info, setInfo] = useState<FormInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [invalid, setInvalid] = useState(false)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [data, setData] = useState<Record<string, string>>({
    name: '',
    email: '',
    phone: '',
    cif: '',
    address: '',
    project_type: '',
    description: '',
  })
  const [files, setFiles] = useState<Attachment[]>([])
  const [consents, setConsents] = useState<Record<string, boolean>>({})
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    ;(async () => {
      const { data: res, error } = await supabase.rpc('get_intake_form', { p_token: token })
      if (error || !res) setInvalid(true)
      else {
        const form = res as FormInfo
        applyCompanyLanguage(form.language)
        setInfo(form)
      }
      setLoading(false)
    })()
  }, [token])

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? [])
    if (!selected.length) return
    setError(null)
    setUploading(true)
    for (const f of selected) {
      const safe = f.name.replace(/[^\w.-]/g, '_')
      const path = `${token}/${Date.now()}-${safe}`
      const { error } = await supabase.storage.from(BUCKET).upload(path, f)
      if (error) {
        setError(t('intake.attachments.uploadFailed', { name: f.name, message: error.message }))
        continue
      }
      setFiles((prev) => [...prev, { name: f.name, path }])
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  function removeFile(path: string) {
    setFiles((prev) => prev.filter((f) => f.path !== path))
  }

  /** Validación en cliente de la plantilla (el servidor vuelve a validar lo esencial). */
  function validateTemplate(): boolean {
    const form = info?.form
    if (!form) return true
    const errs: Record<string, string> = {}
    for (const f of visibleFields(form.fields, data)) {
      if (f.required && !(data[f.key] ?? '').trim()) errs[f.key] = t('intake.validation.required')
      if (f.type === 'email' && data[f.key] && !EMAIL_RE.test(data[f.key])) errs[f.key] = t('intake.validation.invalidEmail')
    }
    for (const c of form.consents) if (c.required && !consents[c.key]) errs[`consent.${c.key}`] = t('intake.validation.consentRequired')
    for (const d of form.required_documents) {
      if (d.required && !files.some((f) => f.name.startsWith(`[${d.key}]`))) errs[`doc.${d.key}`] = t('intake.validation.documentRequired')
    }
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!validateTemplate()) return
    setBusy(true)
    const { data: res, error } = await supabase.rpc('submit_intake_form', {
      p_token: token,
      p_data: { ...data, files, consents },
    })
    setBusy(false)
    if (error) setError(t('intake.submit.failedRetry'))
    else if (res && (res as { ok: boolean }).ok) setDone(true)
    else setError(serverErrorMessage(res as ServerResult, 'intake.submit.serverErrors', t('intake.submit.failed')))
  }

  if (loading)
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 text-slate-400">
        {t('intake.loading')}
      </div>
    )

  if (invalid || info?.status === 'caducado')
    return (
      <Shell empresa={info?.empresa} logo={info?.logo_url}>
        <p className="text-center text-slate-500">{t('intake.invalidLink')}</p>
      </Shell>
    )

  if (done || info?.status === 'completado')
    return (
      <Shell empresa={info?.empresa} logo={info?.logo_url}>
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          <h2 className="text-lg font-bold text-slate-800">{t('intake.done.title')}</h2>
          <p className="text-sm text-slate-500">{t('intake.done.message', { company: info?.empresa ?? '' })}</p>
        </div>
      </Shell>
    )

  const inputCls =
    'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100'

  const field = (label: string, key: string, type = 'text', required = false) => (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      <input
        type={type}
        required={required}
        value={data[key] ?? ''}
        onChange={(e) => setData({ ...data, [key]: e.target.value })}
        className={inputCls}
      />
    </label>
  )

  const types = info?.project_types ?? []
  const form = info?.form ?? null

  /** Campo dinámico definido por la plantilla (con etiqueta visible y error asociado). */
  const dynamicField = (f: FormFieldDef) => {
    const id = `f-${f.key}`
    const err = fieldErrors[f.key]
    const common = {
      id,
      'aria-invalid': err ? true : undefined,
      'aria-describedby': err ? `${id}-err` : undefined,
      value: data[f.key] ?? '',
      className: `${inputCls} ${err ? 'border-red-400' : ''}`,
    }
    const opts = f.options && f.options.length > 0 ? f.options : f.key === 'project_type' ? types : []
    return (
      <div key={f.key}>
        <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-500">
          {f.label}
          {f.required && <span aria-hidden="true"> *</span>}
        </label>
        {f.type === 'textarea' ? (
          <textarea rows={4} {...common} onChange={(e) => setData({ ...data, [f.key]: e.target.value })} />
        ) : f.type === 'select' ? (
          <select {...common} onChange={(e) => setData({ ...data, [f.key]: e.target.value })}>
            <option value="">{t('common.actions.select')}</option>
            {opts.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : (
          <input type={f.type} {...common} onChange={(e) => setData({ ...data, [f.key]: e.target.value })} />
        )}
        {err && (
          <p id={`${id}-err`} className="mt-1 text-xs font-medium text-red-600" role="alert">
            {err}
          </p>
        )}
      </div>
    )
  }

  return (
    <Shell empresa={info?.empresa} logo={info?.logo_url}>
      {info?.is_test && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-1.5 text-center text-xs font-semibold text-amber-800">{t('intake.sandbox')}</p>
      )}
      <p className="mb-5 text-sm text-slate-500">
        {form ? (
          <Trans i18nKey="intake.intro.template" values={{ company: info?.empresa ?? '', form: form.name }} components={{ strong: <strong /> }} />
        ) : (
          <Trans i18nKey="intake.intro.basic" values={{ company: info?.empresa ?? '' }} components={{ strong: <strong /> }} />
        )}
      </p>
      <form onSubmit={submit} className="space-y-3" noValidate={!!form}>
        {form ? (
          <>
            {visibleFields(form.fields, data).map(dynamicField)}
            {form.required_documents.map((d) => (
              <div key={d.key}>
                <span className="mb-1 block text-xs font-medium text-slate-500">
                  {d.label}
                  {d.required && <span aria-hidden="true"> *</span>}
                </span>
                <DocSlot
                  token={token ?? ''}
                  docKey={d.key}
                  files={files}
                  onAdd={(f) => setFiles((prev) => [...prev, f])}
                  onRemove={removeFile}
                  onError={setError}
                />
                {fieldErrors[`doc.${d.key}`] && (
                  <p className="mt-1 text-xs font-medium text-red-600" role="alert">
                    {fieldErrors[`doc.${d.key}`]}
                  </p>
                )}
              </div>
            ))}
          </>
        ) : (
          <>
            {field(t('intake.fields.name'), 'name', 'text', true)}
            {field(t('intake.fields.email'), 'email', 'email', true)}
            {field(t('intake.fields.phone'), 'phone', 'tel')}
            {field(t('intake.fields.taxId'), 'cif')}
            {field(t('intake.fields.address'), 'address')}

            {types.length > 0 && (
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-500">{t('intake.fields.projectType')}</span>
                <select
                  value={data.project_type}
                  onChange={(e) => setData({ ...data, project_type: e.target.value })}
                  className={inputCls}
                >
                  <option value="">{t('common.actions.select')}</option>
                  {types.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">{t('intake.fields.description')}</span>
              <textarea
                rows={4}
                value={data.description}
                onChange={(e) => setData({ ...data, description: e.target.value })}
                placeholder={t('intake.fields.descriptionPlaceholder')}
                className={inputCls}
              />
            </label>
          </>
        )}

        {/* Adjuntos */}
        <div>
          <span className="mb-1 block text-xs font-medium text-slate-500">{t('intake.attachments.label')}</span>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600 hover:border-brand-400 hover:bg-brand-50 disabled:opacity-60"
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> {t('intake.attachments.uploading')}
              </>
            ) : (
              <>
                <Paperclip className="h-4 w-4" /> {t('intake.attachments.add')}
              </>
            )}
          </button>
          <input ref={fileRef} type="file" multiple className="hidden" onChange={onFiles} />
          {files.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {files.map((f) => (
                <li
                  key={f.path}
                  className="flex items-center gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2 text-xs"
                >
                  <File className="h-3.5 w-3.5 text-brand-600" />
                  <span className="min-w-0 flex-1 truncate text-slate-700">{f.name}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(f.path)}
                    className="text-slate-400 hover:text-red-500"
                    aria-label={t('common.actions.remove')}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {form?.consents.map((c) => {
          const id = `c-${c.key}`
          const err = fieldErrors[`consent.${c.key}`]
          return (
            <div key={c.key}>
              <div className="flex items-start gap-2">
                <input
                  id={id}
                  type="checkbox"
                  checked={!!consents[c.key]}
                  onChange={(e) => setConsents({ ...consents, [c.key]: e.target.checked })}
                  aria-invalid={err ? true : undefined}
                  aria-describedby={err ? `${id}-err` : undefined}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600"
                />
                <label htmlFor={id} className="text-xs text-slate-600">
                  {c.label}
                  {c.required && <span aria-hidden="true"> *</span>}
                </label>
              </div>
              {err && (
                <p id={`${id}-err`} className="mt-1 text-xs font-medium text-red-600" role="alert">
                  {err}
                </p>
              )}
            </div>
          )
        })}

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600" role="alert">{error}</p>
        )}
        <button type="submit" disabled={busy || uploading} className="btn-primary w-full">
          <Send className="h-4 w-4" />
          {busy ? t('common.actions.sending') : t('intake.submit.button')}
        </button>
      </form>
    </Shell>
  )
}

/** Campos visibles según condiciones (campo=valor). */
function visibleFields(fields: FormFieldDef[], data: Record<string, string>): FormFieldDef[] {
  return fields.filter((f) => !f.condition || (data[f.condition.field] ?? '') === f.condition.equals)
}

/** Subida de un documento concreto solicitado por la plantilla. */
function DocSlot({
  token,
  docKey,
  files,
  onAdd,
  onRemove,
  onError,
}: {
  token: string
  docKey: string
  files: Attachment[]
  onAdd: (f: Attachment) => void
  onRemove: (path: string) => void
  onError: (msg: string) => void
}) {
  const { t } = useTranslation()
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const mine = files.filter((f) => f.name.startsWith(`[${docKey}]`))
  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setBusy(true)
    const safe = f.name.replace(/[^\w.-]/g, '_')
    const path = `${token}/${Date.now()}-${docKey}-${safe}`
    const { error } = await supabase.storage.from(BUCKET).upload(path, f)
    if (error) onError(t('intake.attachments.uploadFailed', { name: f.name, message: error.message }))
    else onAdd({ name: `[${docKey}] ${f.name}`, path })
    setBusy(false)
    if (ref.current) ref.current.value = ''
  }
  return (
    <div>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-2.5 text-xs font-medium text-slate-600 hover:border-brand-400 hover:bg-brand-50 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Paperclip className="h-4 w-4" aria-hidden="true" />}
        {busy ? t('intake.attachments.uploading') : mine.length ? t('intake.attachments.replaceOrAdd') : t('intake.attachments.attach')}
      </button>
      <input ref={ref} type="file" className="hidden" onChange={pick} aria-label={t('intake.attachments.fileFor', { key: docKey })} />
      {mine.length > 0 && (
        <ul className="mt-1.5 space-y-1">
          {mine.map((f) => (
            <li key={f.path} className="flex items-center gap-2 rounded-lg border border-slate-100 bg-white px-3 py-1.5 text-xs">
              <File className="h-3.5 w-3.5 text-brand-600" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-slate-700">{f.name.replace(`[${docKey}] `, '')}</span>
              <button type="button" onClick={() => onRemove(f.path)} className="text-slate-400 hover:text-red-500" aria-label={t('intake.attachments.removeNamed', { name: f.name })}>
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Shell({
  children,
  empresa,
  logo,
}: {
  children: React.ReactNode
  empresa?: string
  logo?: string | null
}) {
  const { t } = useTranslation()
  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-brand-50 via-white to-slate-100 p-5">
      <div className="w-full max-w-md">
        <div className="mb-3 flex justify-end">
          <LanguageSwitcher />
        </div>
        <div className="mb-4 flex flex-col items-center gap-2 text-center">
          {logo ? (
            <img src={logo} alt={empresa} className="h-10 max-w-[160px] object-contain" />
          ) : (
            <Logo size={34} />
          )}
          {empresa && <p className="text-sm font-semibold text-slate-500">{empresa}</p>}
        </div>
        <div className="surface p-7 shadow-float">{children}</div>
        <p className="mt-4 text-center text-xs text-slate-400">{t('intake.footer')}</p>
      </div>
    </div>
  )
}
