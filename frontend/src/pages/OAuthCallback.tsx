import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { LoadingScreen } from '../components/LoadingScreen'
import { ONBOARDING_BASE } from '../lib/routing'

const RETURN_KEY = 'feblio.oauth.returnTo'

/** Guarda a dónde volver tras el OAuth (ruta interna, nunca URL externa). */
export function rememberOAuthReturn(path: string) {
  try {
    sessionStorage.setItem(RETURN_KEY, path.startsWith('/') ? path : ONBOARDING_BASE)
  } catch {
    /* sin sessionStorage: se vuelve al wizard */
  }
}

/**
 * Destino tras el OAuth. La Edge Function `integrations` redirige aquí con
 * ?kind=...&status=connected|error&message=... y esta página reenvía al paso
 * correspondiente mostrando el resultado (sin tokens en la URL).
 */
export default function OAuthCallback() {
  const [params] = useSearchParams()
  const navigate = useNavigate()

  useEffect(() => {
    let returnTo = ONBOARDING_BASE
    try {
      returnTo = sessionStorage.getItem(RETURN_KEY) ?? ONBOARDING_BASE
      sessionStorage.removeItem(RETURN_KEY)
    } catch {
      /* ignorar */
    }
    const status = params.get('status') ?? 'error'
    const kind = params.get('kind') ?? ''
    const message = params.get('message') ?? ''
    const sep = returnTo.includes('?') ? '&' : '?'
    navigate(`${returnTo}${sep}oauth=${encodeURIComponent(status)}&kind=${encodeURIComponent(kind)}&message=${encodeURIComponent(message)}`, { replace: true })
  }, [params, navigate])

  return <LoadingScreen text="Finalizando la conexión…" />
}
