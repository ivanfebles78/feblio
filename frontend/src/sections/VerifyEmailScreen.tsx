import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { MailCheck, RefreshCw, LogOut, ShieldCheck } from 'lucide-react'
import { Logo } from '../components/Logo'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { claimNativeVerification } from '../lib/onboarding/api'

interface VerifyEmailScreenProps {
  email: string
  /** 'otp': código de 6 dígitos de Feblio · 'native': enlace de confirmación de Supabase */
  mode?: 'otp' | 'native'
  onVerified: () => void
}

/**
 * Verificación de email: una única experiencia.
 * - Modo 'otp' (por defecto): Feblio envía un código por Edge Function `send-otp` y lo valida con `verify_email_otp`.
 * - Modo 'native': el usuario confirma desde el enlace de Supabase; aquí solo se reconoce esa confirmación.
 */
export function VerifyEmailScreen({ email, mode = 'otp', onVerified }: VerifyEmailScreenProps) {
  const { signOut } = useAuth()
  const [code, setCode] = useState('')
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const sentOnce = useRef(false)
  const codeId = useId()
  const msgId = useId()

  const sendCode = useCallback(async () => {
    setSending(true)
    setError(null)
    setNotice(null)
    const { data, error } = await supabase.functions.invoke('send-otp', { body: {} })
    setSending(false)
    if (error || !(data as { ok?: boolean })?.ok) {
      setError((data as { error?: string })?.error ?? 'No se pudo enviar el código. Inténtalo de nuevo en unos segundos.')
    } else {
      setNotice(`Código enviado a ${email}. Revisa tu bandeja (y la carpeta de spam).`)
    }
  }, [email])

  useEffect(() => {
    if (mode !== 'otp' || sentOnce.current) return
    sentOnce.current = true
    sendCode()
  }, [mode, sendCode])

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault()
    if (code.trim().length !== 6) {
      setError('El código tiene 6 dígitos.')
      return
    }
    setVerifying(true)
    setError(null)
    const { data, error } = await supabase.rpc('verify_email_otp', { p_code: code.trim() })
    setVerifying(false)
    if (error) setError('No se pudo verificar. Inténtalo de nuevo.')
    else if ((data as { ok?: boolean })?.ok) onVerified()
    else setError((data as { error?: string })?.error ?? 'Código incorrecto.')
  }

  async function claimNative() {
    setVerifying(true)
    setError(null)
    try {
      // Refresca la sesión para leer email_confirmed_at actualizado
      await supabase.auth.refreshSession()
      const res = await claimNativeVerification()
      if (res.ok) onVerified()
      else setError(res.error ?? 'Todavía no consta la confirmación. Abre el enlace del correo y vuelve a intentarlo.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo comprobar la confirmación.')
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-brand-50 via-white to-slate-100 p-5">
      <main className="w-full max-w-md">
        <div className="mb-5 flex justify-center">
          <Logo size={38} />
        </div>
        <div className="surface p-8 shadow-float">
          <div className="mb-5 flex flex-col items-center text-center">
            <span className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-indigo-600 text-white shadow-lg">
              <MailCheck className="h-7 w-7" aria-hidden="true" />
            </span>
            <h1 className="text-xl font-bold text-slate-900">Verifica tu email</h1>
            <p className="mt-1 text-sm text-slate-500">
              {mode === 'otp' ? (
                <>
                  Hemos enviado un código de 6 dígitos a <span className="font-medium text-slate-700">{email}</span>.
                  Introdúcelo para continuar con la configuración.
                </>
              ) : (
                <>
                  Te hemos enviado un enlace de confirmación a <span className="font-medium text-slate-700">{email}</span>.
                  Ábrelo y después pulsa «Ya he confirmado».
                </>
              )}
            </p>
          </div>

          {mode === 'otp' ? (
            <form onSubmit={verifyOtp} className="space-y-4" noValidate>
              <label htmlFor={codeId} className="sr-only">
                Código de verificación de 6 dígitos
              </label>
              <input
                id={codeId}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                aria-describedby={msgId}
                aria-invalid={error ? true : undefined}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-4 text-center text-3xl font-bold tracking-[0.5em] text-slate-800 focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-100"
              />
              <div id={msgId} aria-live="polite">
                {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
                {notice && !error && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}
              </div>
              <button type="submit" disabled={verifying} className="btn-primary w-full">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                {verifying ? 'Verificando…' : 'Verificar cuenta'}
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              <div aria-live="polite">
                {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
              </div>
              <button type="button" onClick={claimNative} disabled={verifying} className="btn-primary w-full">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                {verifying ? 'Comprobando…' : 'Ya he confirmado'}
              </button>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between text-sm">
            {mode === 'otp' ? (
              <button
                type="button"
                onClick={sendCode}
                disabled={sending}
                className="flex items-center gap-1.5 font-medium text-brand-600 hover:underline disabled:opacity-60"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${sending ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
                {sending ? 'Enviando…' : 'Reenviar código'}
              </button>
            ) : (
              <span />
            )}
            <button type="button" onClick={signOut} className="flex items-center gap-1.5 font-medium text-slate-500 hover:text-slate-700">
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" /> Salir
            </button>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-slate-500">Tienes 14 días de prueba gratis al verificar tu cuenta.</p>
      </main>
    </div>
  )
}
