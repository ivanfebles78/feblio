// Feblio · resolución del idioma en el servidor (Edge Functions). Sin React ni i18n del frontend.
//
//   comunicación empresarial (clientes, pruebas de canal, formularios) → empresas.language
//   comunicación de autenticación (OTP, correos personales)           → auth user_metadata.language
//   ausente, vacío o no soportado                                       → 'es'
// Nunca se detecta el idioma del navegador en el servidor.

export const SUPPORTED_LOCALES = ['es', 'en'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'es'

/** Normaliza cualquier valor a 'es' | 'en'; lo demás → 'es'. */
export function toLocale(value: unknown): Locale {
  if (typeof value !== 'string') return DEFAULT_LOCALE
  const base = value.trim().toLowerCase().split(/[-_]/)[0]
  return (SUPPORTED_LOCALES as readonly string[]).includes(base) ? (base as Locale) : DEFAULT_LOCALE
}

/** Idioma de una comunicación empresarial a partir de la fila de la empresa. */
export function companyLocale(empresa: { language?: unknown } | null | undefined): Locale {
  return toLocale(empresa?.language)
}

/** Idioma de una comunicación de autenticación a partir de los metadatos del usuario. */
export function userLocale(user: { user_metadata?: Record<string, unknown> | null } | null | undefined): Locale {
  return toLocale(user?.user_metadata?.language)
}

/** Cliente mínimo (evita importar supabase-js en las pruebas). */
export interface LocaleDb {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: unknown): { maybeSingle(): Promise<{ data: Record<string, unknown> | null }> }
    }
  }
}

/** empresas.language por id de empresa (service role); empresa inexistente → 'es'. */
export async function companyLocaleById(db: LocaleDb, empresaId: string | null | undefined): Promise<Locale> {
  if (!empresaId) return DEFAULT_LOCALE
  const { data } = await db.from('empresas').select('language').eq('id', empresaId).maybeSingle()
  return companyLocale(data as { language?: unknown } | null)
}
