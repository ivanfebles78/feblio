import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, Send, Paperclip, X, Loader2, File } from 'lucide-react'
import { Logo } from '../components/Logo'
import { supabase } from '../lib/supabase'

interface FormInfo {
  status: 'pendiente' | 'completado'
  empresa: string
  logo_url: string | null
  project_types: string[]
}

interface Attachment {
  name: string
  url: string
}

const BUCKET = 'intake-files'

export default function PublicIntakeForm() {
  const { token } = useParams<{ token: string }>()
  const [info, setInfo] = useState<FormInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [invalid, setInvalid] = useState(false)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [data, setData] = useState({
    name: '',
    email: '',
    phone: '',
    cif: '',
    address: '',
    project_type: '',
    description: '',
  })
  const [files, setFiles] = useState<Attachment[]>([])

  useEffect(() => {
    ;(async () => {
      const { data: res, error } = await supabase.rpc('get_intake_form', { p_token: token })
      if (error || !res) setInvalid(true)
      else setInfo(res as FormInfo)
      setLoading(false)
    })()
  }, [token])

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? [])
    if (!selected.length) return
    setError(null)
    setUploading(true)
    for (const f of selected) {
      const safe = f.name.replace(/[^\w.\-]/g, '_')
      const path = `${token}/${Date.now()}-${safe}`
      const { error } = await supabase.storage.from(BUCKET).upload(path, f)
      if (error) {
        setError(`No se pudo subir ${f.name}: ${error.message}`)
        continue
      }
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)
      setFiles((prev) => [...prev, { name: f.name, url: pub.publicUrl }])
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  function removeFile(url: string) {
    setFiles((prev) => prev.filter((f) => f.url !== url))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const { data: res, error } = await supabase.rpc('submit_intake_form', {
      p_token: token,
      p_data: { ...data, files },
    })
    setBusy(false)
    if (error) setError('No se pudo enviar. Inténtalo de nuevo.')
    else if (res && (res as { ok: boolean }).ok) setDone(true)
    else setError((res as { error?: string })?.error ?? 'No se pudo enviar.')
  }

  if (loading)
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 text-slate-400">
        Cargando…
      </div>
    )

  if (invalid)
    return (
      <Shell>
        <p className="text-center text-slate-500">Este enlace no es válido o ha caducado.</p>
      </Shell>
    )

  if (done || info?.status === 'completado')
    return (
      <Shell empresa={info?.empresa} logo={info?.logo_url}>
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          <h2 className="text-lg font-bold text-slate-800">¡Datos enviados!</h2>
          <p className="text-sm text-slate-500">
            Gracias. {info?.empresa} ya tiene tus datos y se pondrá en contacto contigo.
          </p>
        </div>
      </Shell>
    )

  const inputCls =
    'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100'

  const field = (label: string, key: keyof typeof data, type = 'text', required = false) => (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      <input
        type={type}
        required={required}
        value={data[key]}
        onChange={(e) => setData({ ...data, [key]: e.target.value })}
        className={inputCls}
      />
    </label>
  )

  const types = info?.project_types ?? []

  return (
    <Shell empresa={info?.empresa} logo={info?.logo_url}>
      <p className="mb-5 text-sm text-slate-500">
        Completa tus datos para que <strong>{info?.empresa}</strong> pueda darte de alta como
        cliente.
      </p>
      <form onSubmit={submit} className="space-y-3">
        {field('Nombre o razón social', 'name', 'text', true)}
        {field('Email', 'email', 'email', true)}
        {field('Teléfono', 'phone', 'tel')}
        {field('CIF / NIF', 'cif')}
        {field('Dirección', 'address')}

        {types.length > 0 && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              Tipo de proyecto
            </span>
            <select
              value={data.project_type}
              onChange={(e) => setData({ ...data, project_type: e.target.value })}
              className={inputCls}
            >
              <option value="">Selecciona una opción…</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            Describe lo que necesitas
          </span>
          <textarea
            rows={4}
            value={data.description}
            onChange={(e) => setData({ ...data, description: e.target.value })}
            placeholder="Cuéntanos qué proyecto tienes en mente…"
            className={inputCls}
          />
        </label>

        {/* Adjuntos */}
        <div>
          <span className="mb-1 block text-xs font-medium text-slate-500">
            Archivos adjuntos (planos, fotos, documentos…)
          </span>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600 hover:border-brand-400 hover:bg-brand-50 disabled:opacity-60"
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Subiendo…
              </>
            ) : (
              <>
                <Paperclip className="h-4 w-4" /> Añadir archivos
              </>
            )}
          </button>
          <input ref={fileRef} type="file" multiple className="hidden" onChange={onFiles} />
          {files.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {files.map((f) => (
                <li
                  key={f.url}
                  className="flex items-center gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2 text-xs"
                >
                  <File className="h-3.5 w-3.5 text-brand-600" />
                  <span className="min-w-0 flex-1 truncate text-slate-700">{f.name}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(f.url)}
                    className="text-slate-400 hover:text-red-500"
                    aria-label="Quitar"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}
        <button type="submit" disabled={busy || uploading} className="btn-primary w-full">
          <Send className="h-4 w-4" />
          {busy ? 'Enviando…' : 'Enviar mis datos'}
        </button>
      </form>
    </Shell>
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
  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-brand-50 via-white to-slate-100 p-5">
      <div className="w-full max-w-md">
        <div className="mb-4 flex flex-col items-center gap-2 text-center">
          {logo ? (
            <img src={logo} alt={empresa} className="h-10 max-w-[160px] object-contain" />
          ) : (
            <Logo size={34} />
          )}
          {empresa && <p className="text-sm font-semibold text-slate-500">{empresa}</p>}
        </div>
        <div className="surface p-7 shadow-float">{children}</div>
        <p className="mt-4 text-center text-xs text-slate-400">Formulario seguro · Feblio</p>
      </div>
    </div>
  )
}
