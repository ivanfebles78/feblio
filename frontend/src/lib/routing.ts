import type { UserRole } from './types'

export type OnboardingStatus = 'not_started' | 'in_progress' | 'completed' | 'requires_attention'

export interface EmpresaAccessState {
  /** La cuenta tiene una empresa asociada */
  hasEmpresa: boolean
  emailVerified: boolean
  onboardingStatus: OnboardingStatus | null
  onboardingCurrentStep: string | null
  /** La bienvenida de primera entrada ya se mostró (0013). */
  welcomeSeen: boolean
}

export type EmpresaDestination =
  | { kind: 'verify' }
  | { kind: 'welcome'; path: '/bienvenida' }
  | { kind: 'dashboard'; path: '/empresa' }

/**
 * Decide a dónde debe ir una cuenta de empresa según su estado.
 * verificación → bienvenida (una sola vez, solo empresas nuevas) → dashboard.
 * El wizard ya no es obligatorio: la configuración es progresiva desde el dashboard.
 * Es una función pura para poder probarla sin React ni Supabase.
 */
export function resolveEmpresaDestination(state: EmpresaAccessState): EmpresaDestination {
  if (!state.hasEmpresa) return { kind: 'dashboard', path: '/empresa' }
  if (!state.emailVerified) return { kind: 'verify' }
  if (!state.welcomeSeen && state.onboardingStatus !== 'completed') return { kind: 'welcome', path: '/bienvenida' }
  return { kind: 'dashboard', path: '/empresa' }
}

/** Ruta "home" de cada rol. Admin y cliente nunca pasan por el wizard de empresa. */
export function homePathForRole(role: UserRole): string {
  switch (role) {
    case 'admin':
      return '/admin'
    case 'cliente':
      return '/cliente'
    case 'empresa':
    default:
      return '/empresa'
  }
}

export const ONBOARDING_BASE = '/onboarding'
export const WELCOME_PATH = '/bienvenida'
export const REGISTER_PATH = '/registro'
export const FORGOT_PASSWORD_PATH = '/recuperar-contrasena'
export const RESET_PASSWORD_PATH = '/restablecer-contrasena'
export const onboardingStepPath = (step: string) => `${ONBOARDING_BASE}/${step}`

/** Rutas anidadas del panel de empresa (/empresa/*). */
export const EMPRESA_PATHS = {
  home: '/empresa',
  solicitudes: '/empresa/solicitudes',
  nuevaSolicitud: '/empresa/solicitudes/nueva',
  plantillas: '/empresa/plantillas',
  configuracion: '/empresa/configuracion',
} as const
export const solicitudPath = (id: string) => `${EMPRESA_PATHS.solicitudes}/${id}`
/** Enlace público (sin cuenta) del cliente a su solicitud. */
export const CLIENT_LINK_BASE = '/s'
export const clientLinkPath = (token: string) => `${CLIENT_LINK_BASE}/${token}`

/* ------------------------------------------------------------------ */
/* Conservación de la ruta solicitada antes de autenticar              */
/* ------------------------------------------------------------------ */

const RETURN_TO_KEY = 'feblio:return_to'
const RETURN_TO_TTL_MS = 10 * 60 * 1000

/**
 * Acepta solo rutas internas relativas ("/algo?x=1#y"). Rechaza URLs absolutas,
 * protocol-relative ("//evil"), esquemas, barras invertidas y cualquier open redirect.
 */
export function sanitizeReturnTo(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  const v = raw.trim()
  if (v.length === 0 || v.length > 2048) return null
  if (!v.startsWith('/') || v.startsWith('//')) return null
  // Barras invertidas (el navegador las normaliza a "/"), espacios y variantes codificadas de "//" o "\"
  if (/[\\\s]|%2f%2f|%5c/i.test(v)) return null
  let url: URL
  try {
    url = new URL(v, 'http://internal.local')
  } catch {
    return null
  }
  if (url.origin !== 'http://internal.local' || url.username || url.password) return null
  const path = `${url.pathname}${url.search}${url.hash}`
  if (path === '/' || path.startsWith('//')) return null
  return path
}

/** Prefijos que puede abrir cada rol al volver a la ruta guardada. */
const ROLE_PREFIXES: Record<UserRole, string[]> = {
  admin: ['/admin'],
  empresa: ['/empresa', '/onboarding', '/bienvenida', '/integraciones/callback'],
  cliente: ['/cliente'],
}

export function pathAllowedForRole(path: string, role: UserRole): boolean {
  const pathname = path.split(/[?#]/)[0]
  return (ROLE_PREFIXES[role] ?? []).some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/** Ruta a la que volver tras autenticar: la guardada si es interna y permitida; si no, la home del rol. */
export function resolveReturnTo(raw: string | null | undefined, role: UserRole): string {
  const path = sanitizeReturnTo(raw)
  return path && pathAllowedForRole(path, role) ? path : homePathForRole(role)
}

// localStorage (no sessionStorage): un magic link se abre en OTRA pestaña, y Supabase Auth solo conserva
// el redirect si está en su lista permitida; la ruta guardada aquí sobrevive al cambio de pestaña.
function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

/** Guarda la ruta interna pedida sin sesión (caduca a los 10 minutos; se consume una sola vez). No guarda nada si no es válida. */
export function rememberReturnTo(raw: string | null | undefined): void {
  const path = sanitizeReturnTo(raw)
  const s = storage()
  if (!s || !path) return
  try {
    s.setItem(RETURN_TO_KEY, JSON.stringify({ path, at: Date.now() }))
  } catch {
    /* almacenamiento no disponible */
  }
}

/** Devuelve y borra la ruta guardada (null si no hay, caducó o no es válida). */
export function takeReturnTo(now: number = Date.now()): string | null {
  const s = storage()
  if (!s) return null
  try {
    const raw = s.getItem(RETURN_TO_KEY)
    s.removeItem(RETURN_TO_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { path?: unknown; at?: unknown }
    if (typeof parsed.at !== 'number' || now - parsed.at > RETURN_TO_TTL_MS) return null
    return sanitizeReturnTo(typeof parsed.path === 'string' ? parsed.path : null)
  } catch {
    return null
  }
}

export function clearReturnTo(): void {
  storage()?.removeItem(RETURN_TO_KEY)
}
