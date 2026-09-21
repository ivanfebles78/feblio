import { createClient } from '@supabase/supabase-js'
// Captura #type=recovery / errores del enlace ANTES de que supabase-js limpie la URL.
import { INITIAL_AUTH_PARAMS } from './authUrl'
import { t } from '../i18n'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!url || !anonKey) {
  throw new Error(t('auth.config.missingSupabaseEnv'))
}

export const initialAuthParams = INITIAL_AUTH_PARAMS

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
