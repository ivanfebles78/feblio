import { useEffect, useRef, useState } from 'react'
import { MailCheck, RefreshCw, LogOut, ShieldCheck } from 'lucide-react'
import { Logo } from '../components/Logo'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export function VerifyEmailScreen({
  email,
  onVerified,
}: {
  email: string
  onVerified: () => void
}) {
  const { signOut } = useAuth()
  const [code, setCode] = useState('')
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const sentOnce = useRef(false)

  async function sendCode() {
    setSending(true)
    setError(null)
    setNotice(null)
    const { data, error } = await supabase.functions.invoke('send-otp', { body: {} })
    setSending(false)
    if (error || !(data as { ok?: boolean })?.ok) {
      setError(
        (data as { error?: string })?.error ??
          'No se pudo enviar el código (¿falta configurar Resend?).',
      )
    } else {
      setNotice(`Código enviado a ${email}. Revisa tu bandeja (y spam).`)
    }
  }

  useEffect(() => {
    if (sentOnce.current) return
    sentOnce.current = true
    sendCode()
  }, []) // eslint-disable-line

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    if (code.trim().length !== 6) return
    setVerifying(true)
    setError(null)
    const { data, error } = await supabase.rpc('verify_email_otp', { p_code: code.trim() })
    setVerifying(false)
    if (error) setError('No se pudo verificar. Inténtalo de nuevo.')
    else if ((data as { ok?: boolean })?.ok) onVerified()
    else setError((data as { error?: string })?.error ?? 'Código incorrecto.')
  }

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-brand-50 via-white to-slate-100 p-5">
      <div className="w-full max-w-md">
        <div className="mb-5 flex justify-center">
          <Logo size={38} />
        </div>
        <div className="surface p-8 shadow-float">
          <div className="mb-5 flex flex-col items-center text-center">
            <span className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-indigo-600 text-white shadow-lg">
              <MailCheck className="h-7 w-7" />
            </span>
            <h1 className="text-xl font-bold text-slate-900">Verifica tu email</h1>
            <p className="mt-1 text-sm text-slate-500">
              Hemos enviado un código de 6 dígitos a{' '}
              <span className="font-medium text-slate-700">{email}</span>. Introdúcelo para
              activar tu cuenta.
            </p>
          </div>

          <form onSubmit={verify} className="space-y-4">
            <input
              inputMode="numeric"
              autoFocus
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="______"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-4 text-center text-3xl font-bold tracking-[0.5em] text-slate-800 focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-100"
            />

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
            )}
            {notice && !error && (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-600">
                {notice}
              </p>
            )}

            <button
              type="submit"
              disabled={verifying || code.length !== 6}
              className="btn-primary w-full"
            >
              <ShieldCheck className="h-4 w-4" />
              {verifying ? 'Verificando…' : 'Verificar cuenta'}
            </button>
          </form>

          <div className="mt-4 flex items-center justify-between text-sm">
            <button
              onClick={sendCode}
              disabled={sending}
              className="flex items-center gap-1.5 font-medium text-brand-600 hover:underline disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${sending ? 'animate-spin' : ''}`} />
              {sending ? 'Enviando…' : 'Reenviar código'}
            </button>
            <button
              onClick={signOut}
              className="flex items-center gap-1.5 font-medium text-slate-400 hover:text-slate-600"
            >
              <LogOut className="h-3.5 w-3.5" /> Salir
            </button>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">
          Tienes 14 días de prueba gratis al verificar tu cuenta.
        </p>
      </div>
    </div>
  )
}
