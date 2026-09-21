import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import { es } from '../locales/es'
import { en } from '../locales/en'
import { DEFAULT_LANGUAGE, LANGUAGE_STORAGE_KEY, resolveLanguage, toLanguage, type Language } from './types'

export * from './types'

/**
 * Instancia única de i18next. Sin detección automática del navegador: Feblio abre en español
 * salvo preferencia explícita del usuario (localStorage) o idioma configurado en su empresa.
 * Las rutas no cambian con el idioma y el cambio nunca recarga la aplicación.
 */
function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

/** Preferencia explícita guardada por el usuario (null si no la hay o no es válida). */
export function readStoredLanguage(): Language | null {
  try {
    return toLanguage(storage()?.getItem(LANGUAGE_STORAGE_KEY))
  } catch {
    return null
  }
}

function applyDocumentLanguage(lang: string) {
  if (typeof document !== 'undefined') document.documentElement.lang = lang
}

const initial = resolveLanguage(readStoredLanguage(), null)

void i18next.use(initReactI18next).init({
  resources: { es: { translation: es }, en: { translation: en } },
  lng: initial,
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: ['es', 'en'],
  interpolation: { escapeValue: false },
  returnNull: false,
  initAsync: false,
})
applyDocumentLanguage(initial)
i18next.on('languageChanged', applyDocumentLanguage)

/** Idioma actual de la interfaz. */
export function currentLanguage(): Language {
  return toLanguage(i18next.language) ?? DEFAULT_LANGUAGE
}

/** El usuario elige idioma en el selector: se guarda localmente y se aplica sin recargar. */
export function setUserLanguage(lang: Language): void {
  try {
    storage()?.setItem(LANGUAGE_STORAGE_KEY, lang)
  } catch {
    /* almacenamiento no disponible: el cambio sigue aplicándose en la sesión */
  }
  if (i18next.language !== lang) void i18next.changeLanguage(lang)
}

/**
 * Idioma de la empresa (empresas.language) o del contexto público: solo se aplica si el usuario
 * no ha elegido uno manualmente. Nunca se guarda como preferencia del usuario.
 */
export function applyCompanyLanguage(companyLanguage: unknown): Language {
  const lang = resolveLanguage(readStoredLanguage(), companyLanguage)
  if (i18next.language !== lang) void i18next.changeLanguage(lang)
  return lang
}

/** Solo para pruebas: vuelve al estado inicial (español, sin preferencia guardada). */
export function resetLanguageForTests(): void {
  try {
    storage()?.removeItem(LANGUAGE_STORAGE_KEY)
  } catch {
    /* noop */
  }
  if (i18next.language !== DEFAULT_LANGUAGE) void i18next.changeLanguage(DEFAULT_LANGUAGE)
  applyDocumentLanguage(DEFAULT_LANGUAGE)
}

export const i18n = i18next
/** Traducción fuera de componentes React (validaciones, mapas de etiquetas, mensajes de API). */
export const t = i18next.t.bind(i18next)
export default i18next
