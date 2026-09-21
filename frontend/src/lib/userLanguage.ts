// Feblio · sincroniza el idioma elegido por el usuario con `auth.user_metadata.language`.
//
// Solo se llama cuando el usuario pulsa explícitamente el selector ES/EN y existe sesión. Es el
// idioma de las comunicaciones de AUTENTICACIÓN (plantillas de Supabase Auth, OTP). Nunca escribe
// `empresas.language` (idioma de la empresa) ni se ejecuta al arrancar la aplicación. Si la
// sincronización falla o tarda, la interfaz ya ha cambiado: el error solo se registra sin datos.
import { supabase } from './supabase'
import { toLanguage, type Language } from '../i18n'

export type SyncResult = 'synced' | 'skipped' | 'failed'

export async function syncUserLanguageMetadata(lang: Language): Promise<SyncResult> {
  const language = toLanguage(lang)
  if (!language) return 'skipped'
  try {
    const { data } = await supabase.auth.getSession()
    if (!data.session) return 'skipped'
    if (data.session.user.user_metadata?.language === language) return 'skipped'
    const { error } = await supabase.auth.updateUser({ data: { language } })
    if (error) {
      console.warn('[i18n] No se pudo sincronizar el idioma del usuario', { status: error.status ?? null })
      return 'failed'
    }
    return 'synced'
  } catch {
    console.warn('[i18n] No se pudo sincronizar el idioma del usuario')
    return 'failed'
  }
}
