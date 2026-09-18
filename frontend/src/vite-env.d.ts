/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  /** 'true' muestra las cuentas de demostración en la landing. Oculto por defecto. */
  readonly VITE_DEMO_MODE?: string
  /** Lista "Etiqueta:email,Etiqueta:email" de cuentas demo (solo emails, nunca contraseñas). */
  readonly VITE_DEMO_ACCOUNTS?: string
  /** URL pública de la app (enlaces en emails y vuelta de OAuth). */
  readonly VITE_APP_URL?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
