/** Idiomas de la interfaz. El español es el predeterminado y la versión jurídica principal. */
export const SUPPORTED_LANGUAGES = ['es', 'en'] as const
export type Language = (typeof SUPPORTED_LANGUAGES)[number]

export const DEFAULT_LANGUAGE: Language = 'es'

/** Clave de la preferencia explícita del usuario en localStorage. */
export const LANGUAGE_STORAGE_KEY = 'feblio.uiLanguage'

/** Locale BCP 47 usado por Intl para cada idioma (moneda, fechas y números). */
export const INTL_LOCALE: Record<Language, string> = { es: 'es-ES', en: 'en-GB' }

/** Nombre nativo de cada idioma (nunca banderas). */
export const LANGUAGE_NAME: Record<Language, string> = { es: 'Español', en: 'English' }

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value)
}

/** Normaliza cualquier valor (p. ej. "en-US", " ES ") a un idioma soportado; null si no lo es. */
export function toLanguage(value: unknown): Language | null {
  if (typeof value !== 'string') return null
  const base = value.trim().toLowerCase().split(/[-_]/)[0]
  return isLanguage(base) ? base : null
}

/**
 * Prioridad del idioma: elección explícita del usuario → idioma de la empresa → español.
 * Cualquier valor no soportado se ignora.
 */
export function resolveLanguage(userChoice: unknown, companyLanguage: unknown): Language {
  return toLanguage(userChoice) ?? toLanguage(companyLanguage) ?? DEFAULT_LANGUAGE
}
