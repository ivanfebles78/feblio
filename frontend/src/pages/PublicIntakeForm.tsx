import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, Send } from 'lucide-react'
import { Logo } from '../components/Logo'
import { supabase } from '../lib/supabase'

interface FormInfo {
  status: 'pendiente' | 'completado'
  empresa: string
  logo_url: string | null
}

export default function PublicIntakeForm() {
  const { token } = useParams<{ token: string }>()
  const [info, setInfo] = useState<FormInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [invalid, setInvalid] = useState(false)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [data, setData] = useState({ name: '', email: '', phone: '', cif: '', address: '' })

  useEffect(() => {
    ;(async () => {
      const { data: res, error } = await supabase.rpc('get_intake_form', {
        p_token: token,
      })
      if (error || !res) setInvalid(true)
      else setInfo(res as FormInfo)
      setLoading(false)
    })()
  }, [token])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const { data: res, error } = await supabase.rpc('submit_intake_form', {
      p_token: token,
      p_data: data,
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
        <p className="text-center text-slate-500">
          Este enlace no es válido o ha caducado.
        </p>
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

  const field = (
    label: string,
    key: keyof typeof data,
    type = 'text',
    required = false,
  ) => (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      <input
        type={type}
        required={required}
        value={data[key]}
        onChange={(e) => setData({ ...data, [key]: e.target.value })}
        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100"
      />
    </label>
  )

  return (
    <Shell empresa={info?.empresa} logo={info?.logo_url}>
      <p className="mb-5 text-sm text-slate-500">
        Completa tus datos para que <strong>{info?.empresa}</strong> pueda darte de alta
        como cliente.
      </p>
      <form onSubmit={submit} className="space-y-3">
        {field('Nombre o razón social', 'name', 'text', true)}
        {field('Email', 'email', 'email', true)}
        {field('Teléfono', 'phone', 'tel')}
        {field('CIF / NIF', 'cif')}
        {field('Dirección', 'address')}
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}
        <button type="submit" disabled={busy} className="btn-primary w-full">
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
