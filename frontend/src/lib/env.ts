/**
 * Acceso centralizado a variables de entorno del frontend.
 *
 * Solo pueden exponerse aquí variables VITE_* públicas. Nunca secretos:
 * cualquier VITE_* acaba en el bundle que descarga el navegador.
 */

/** Modo demo: muestra accesos rápidos de prueba. Oculto por defecto. */
export function isDemoMode(env: Record<string, string | undefined> = import.meta.env): boolean {
  return env.VITE_DEMO_MODE === 'true'
}

export interface DemoAccount {
  label: string
  email: string
}

/**
 * Cuentas de demostración, configuradas SOLO por entorno (VITE_DEMO_ACCOUNTS),
 * nunca escritas en el código. Formato: "Admin:correo,Empresa:correo,Cliente:correo".
 *
 * En la interfaz solo se muestran las etiquetas (Admin, Empresa, Cliente); el email
 * se usa internamente para iniciar sesión y no se imprime en pantalla. No hay
 * contraseñas ni login automático: la persona escribe la contraseña manualmente.
 */
export function demoAccounts(env: Record<string, string | undefined> = import.meta.env): DemoAccount[] {
  const raw = env.VITE_DEMO_ACCOUNTS ?? ''
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((pair) => {
      const idx = pair.indexOf(':')
      if (idx <= 0) return null
      const label = pair.slice(0, idx).trim()
      const email = pair.slice(idx + 1).trim()
      return label && email.includes('@') ? { label, email } : null
    })
    .filter((x): x is DemoAccount => x !== null)
}

/** URL pública de la app (para enlaces en emails, OAuth, etc.). */
export function appUrl(): string {
  return import.meta.env.VITE_APP_URL ?? window.location.origin
}
