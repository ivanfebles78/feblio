// Feblio · catálogo tipado de textos generados por el servidor (Edge Functions), español e inglés.
// Claves semánticas estables; interpolación segura {{variable}}; fallback a español; nunca se devuelve
// la clave técnica. Para HTML usa `escapeHtml` sobre cualquier valor dinámico antes de interpolar.
import { DEFAULT_LOCALE, toLocale, type Locale } from './locale.ts'

type Entry = { es: string; en: string }

export const MESSAGES = {
  // Correo OTP de verificación (autenticación → idioma del usuario)
  'otp.subject': { es: 'Tu código de verificación · Feblio', en: 'Your verification code · Feblio' },
  'otp.greeting': { es: '¡Gracias por registrarte{{name}}!', en: 'Thanks for signing up{{name}}!' },
  'otp.intro': { es: 'Introduce este código para verificar tu email y activar tu cuenta:', en: 'Enter this code to verify your email address and activate your account:' },
  'otp.expires': { es: 'El código caduca en 15 minutos. Si no te has registrado en Feblio, ignora este email.', en: 'The code expires in 15 minutes. If you did not sign up for Feblio, please ignore this email.' },
  'otp.footer': { es: 'Feblio · Gestiona tus proyectos de principio a fin', en: 'Feblio · Manage your projects from start to finish' },

  // Correo con el enlace del formulario de cliente (empresarial → idioma de la empresa)
  'intake.subject': { es: 'Completa tus datos · {{company}}', en: 'Complete your details · {{company}}' },
  'intake.greeting': { es: 'Hola,', en: 'Hello,' },
  'intake.body': { es: '{{company}} te invita a completar tus datos para darte de alta como cliente.', en: '{{company}} invites you to complete your details to register as a client.' },
  'intake.cta': { es: 'Completar formulario', en: 'Complete the form' },
  'intake.fallbackLink': { es: 'O copia este enlace: {{link}}', en: 'Or copy this link: {{link}}' },
  'intake.footer': { es: 'Enviado con Feblio', en: 'Sent with Feblio' },
  'intake.text': {
    es: 'Hola,\n\n{{company}} te invita a completar tus datos para darte de alta como cliente.\n\nCompleta el formulario aquí: {{link}}\n\nEnviado con Feblio',
    en: 'Hello,\n\n{{company}} invites you to complete your details to register as a client.\n\nComplete the form here: {{link}}\n\nSent with Feblio',
  },

  // Mensajes de prueba de canal (empresarial → idioma de la empresa)
  'test.email.subject': { es: 'Prueba de configuración · {{company}}', en: 'Configuration test · {{company}}' },
  'test.email.text': { es: 'Este es un correo de prueba enviado desde Feblio para verificar la configuración de {{company}}.', en: 'This is a test email sent from Feblio to verify the configuration of {{company}}.' },
  'test.sms.template': { es: '{empresa}: prueba de SMS desde Feblio. {url}', en: '{empresa}: SMS test from Feblio. {url}' },
  'test.sms.clientName': { es: 'cliente', en: 'client' },

  // Respuestas de API (mensaje de compatibilidad; el frontend traduce por `code`)
  'api.download.invalid': { es: 'Enlace no válido', en: 'Invalid link' },
  'api.download.rateLimited': { es: 'Demasiadas solicitudes. Inténtalo en unos minutos.', en: 'Too many requests. Please try again in a few minutes.' },
  'api.intake.missingData': { es: 'Faltan datos (to, link)', en: 'Missing data (to, link)' },
  'api.integrations.testVerified': { es: 'Conexión verificada.', en: 'Connection verified.' },
} as const satisfies Record<string, Entry>

export type MessageKey = keyof typeof MESSAGES

const PLACEHOLDER = /\{\{\s*([\w.]+)\s*\}\}/g

/** Traduce una clave del catálogo al idioma indicado con interpolación segura (texto plano). */
export function serverT(locale: Locale | string | null | undefined, key: MessageKey, args: Record<string, string | number | null | undefined> = {}): string {
  const entry = MESSAGES[key] as Entry | undefined
  if (!entry) throw new Error(`serverT: unknown key ${String(key)}`)
  const lang = toLocale(locale)
  const template = entry[lang] ?? entry[DEFAULT_LOCALE]
  return template.replace(PLACEHOLDER, (_, name: string) => {
    const v = args[name]
    return v === null || v === undefined ? '' : String(v)
  })
}

/** Escape para insertar valores dinámicos en HTML de correo. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Variante para HTML: interpola con todos los argumentos escapados. */
export function serverTHtml(locale: Locale | string | null | undefined, key: MessageKey, args: Record<string, string | number | null | undefined> = {}): string {
  const escaped: Record<string, string> = {}
  for (const [k, v] of Object.entries(args)) escaped[k] = escapeHtml(v)
  return serverT(locale, key, escaped)
}

/** Variables {x} de una plantilla de canal (SMS/WhatsApp), para comprobar paridad entre idiomas. */
export function channelVariables(template: string): string[] {
  return [...template.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]).sort()
}
