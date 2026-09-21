import { t } from '../../i18n'
import type { BusinessHours } from '../validation'
import type {
  EmailStepData,
  OnboardingStepKey,
  RepositoryStepData,
  SmsStepData,
  StepStatus,
  VoiceStepData,
  WhatsAppStepData,
} from './types'

export interface StepDefinition {
  key: OnboardingStepKey
  order: number
  /** Título traducido (se resuelve en el momento de leerlo, según el idioma activo). */
  readonly title: string
  readonly short: string
  readonly description: string
  required: boolean
}

export function stepTitle(key: OnboardingStepKey): string {
  return t(`onboarding.steps.${key}.title`)
}
export function stepShort(key: OnboardingStepKey): string {
  return t(`onboarding.steps.${key}.short`)
}
export function stepDescription(key: OnboardingStepKey): string {
  return t(`onboarding.steps.${key}.description`)
}

/** Los textos se leen con getters para que sigan al idioma de la interfaz sin recalcular la lista. */
function defineStep(key: OnboardingStepKey, order: number, required: boolean): StepDefinition {
  return {
    key,
    order,
    required,
    get title() {
      return stepTitle(key)
    },
    get short() {
      return stepShort(key)
    },
    get description() {
      return stepDescription(key)
    },
  }
}

export const STEPS: StepDefinition[] = [
  defineStep('company', 1, true),
  defineStep('repository', 2, true),
  defineStep('email', 3, false),
  defineStep('whatsapp', 4, false),
  defineStep('sms', 5, false),
  defineStep('voice', 6, false),
  defineStep('forms', 7, true),
  defineStep('automation', 8, true),
  defineStep('billing', 9, true),
  defineStep('review', 10, true),
]

export const STEP_KEYS = STEPS.map((s) => s.key)

export function stepDefinition(key: OnboardingStepKey): StepDefinition {
  const def = STEPS.find((s) => s.key === key)
  if (!def) throw new Error(`Paso desconocido: ${key}`)
  return def
}

export function isStepKey(value: string | undefined): value is OnboardingStepKey {
  return !!value && STEP_KEYS.includes(value as OnboardingStepKey)
}

export function nextStepKey(key: OnboardingStepKey): OnboardingStepKey | null {
  const i = STEP_KEYS.indexOf(key)
  return i >= 0 && i < STEP_KEYS.length - 1 ? STEP_KEYS[i + 1] : null
}

export function prevStepKey(key: OnboardingStepKey): OnboardingStepKey | null {
  const i = STEP_KEYS.indexOf(key)
  return i > 0 ? STEP_KEYS[i - 1] : null
}

export function stepStatusLabel(status: StepStatus): string {
  return t(`onboarding.stepStatus.${status}`)
}

/** Primer paso no completado/omitido, para reanudar. */
export function firstOpenStep(statuses: Partial<Record<OnboardingStepKey, StepStatus>>): OnboardingStepKey {
  for (const key of STEP_KEYS) {
    const s = statuses[key] ?? 'pending'
    if (s !== 'completed' && s !== 'skipped') return key
  }
  return 'review'
}

/* ------------------------------------------------------------------ */
/* Valores por defecto de cada paso                                     */
/* ------------------------------------------------------------------ */

export const DEFAULT_HOURS: BusinessHours = {
  lunes: { enabled: true, from: '09:00', to: '18:00' },
  martes: { enabled: true, from: '09:00', to: '18:00' },
  miércoles: { enabled: true, from: '09:00', to: '18:00' },
  jueves: { enabled: true, from: '09:00', to: '18:00' },
  viernes: { enabled: true, from: '09:00', to: '15:00' },
  sábado: { enabled: false, from: '09:00', to: '14:00' },
  domingo: { enabled: false, from: '09:00', to: '14:00' },
}

export const DEFAULT_FOLDERS = [
  '01_Requerimiento',
  '02_Datos_cliente',
  '03_Documentacion_recibida',
  '04_Trabajo_en_curso',
  '05_Entregables',
  '06_Facturacion',
  '07_Presentacion_oficial',
  '08_Justificantes',
]

export const DEFAULT_ROOT_PATTERN = '/Proyectos/{codigo_proyecto}_{nombre_cliente}/'

export const DEFAULT_FORM_MESSAGE =
  'Hola {nombre}, soy {empresa}. Para atender tu solicitud necesitamos algunos datos. Complétalos aquí: {url}'

export const defaultRepositoryData = (): RepositoryStepData => ({ provider: 'later' })

export const defaultEmailData = (): EmailStepData => ({
  provider: 'later',
  inbound_address: '',
  sender_address: '',
  sender_name: '',
  signature: '',
  scope: 'labeled',
  labels: ['Feblio'],
  auto_create_requests: true,
  prepare_drafts: true,
  require_approval: true,
  auto_send: false,
})

export const defaultWhatsAppData = (): WhatsAppStepData => ({
  provider: 'later',
  phone_number: '',
  business_account_id: '',
  phone_number_id: '',
  welcome_message: 'Hola, gracias por escribir a {empresa}. Cuéntanos en qué podemos ayudarte.',
  off_hours_message: 'Gracias por tu mensaje. Ahora mismo estamos fuera de horario; te responderemos el próximo día laborable.',
  form_message_template: DEFAULT_FORM_MESSAGE,
  hours: DEFAULT_HOURS,
  languages: ['es'],
  escalate_to_human: true,
  escalation_keywords: 'persona, agente, humano',
  consent_text: 'Al continuar aceptas que tratemos tus datos para atender tu solicitud.',
  create_request_rule: 'manual',
})

export const defaultSmsData = (): SmsStepData => ({
  provider: 'later',
  sender_number: '',
  reply_number: '',
  allowed_countries: ['ES'],
  monthly_limit: 200,
  form_message_template: '{empresa}: completa tus datos aquí {url}. Responde BAJA para no recibir más SMS.',
  reminders_enabled: true,
  reminder_days: [3, 7],
  opt_out_keyword: 'BAJA',
})

export const defaultVoiceData = (timezone = 'Europe/Madrid'): VoiceStepData => ({
  mode: 'manual',
  main_number: '',
  hours: DEFAULT_HOURS,
  timezone,
  welcome_message: 'Gracias por llamar a {empresa}. En un momento le atendemos.',
  recording_notice: true,
  transcription_notice: true,
  consent_required: true,
  extensions: [],
  overflow_number: '',
  max_wait_seconds: 60,
  max_duration_minutes: 15,
  languages: ['es'],
  transfer_to_employee: true,
  send_form_via: 'sms',
  scheduling_enabled: false,
})

/* ------------------------------------------------------------------ */
/* Sugerencias regionales                                               */
/* ------------------------------------------------------------------ */

export const CANARY_PROVINCES = ['Las Palmas', 'Santa Cruz de Tenerife']

export function isCanaryIslands(province: string | null | undefined, postalCode: string | null | undefined): boolean {
  if (province && CANARY_PROVINCES.some((p) => p.toLowerCase() === province.trim().toLowerCase())) return true
  return !!postalCode && /^(35|38)\d{3}$/.test(postalCode.trim())
}

export const TIMEZONES = [
  'Europe/Madrid',
  'Atlantic/Canary',
  'Europe/Lisbon',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Rome',
  'Atlantic/Azores',
  'America/Mexico_City',
  'America/Bogota',
  'America/Lima',
  'America/Santiago',
  'America/Argentina/Buenos_Aires',
  'America/New_York',
  'UTC',
]

export const CURRENCIES = ['EUR', 'USD', 'GBP', 'MXN', 'COP', 'PEN', 'CLP', 'ARS']

/** Idiomas de canal (WhatsApp/llamadas). Nombres nativos: no se traducen. */
export const LANGUAGES = [
  { code: 'es', label: 'Español' },
  { code: 'en', label: 'English' },
  { code: 'pt', label: 'Português' },
  { code: 'ca', label: 'Català' },
]

export const COUNTRY_CODES = ['ES', 'PT', 'FR', 'IT', 'DE', 'GB', 'MX', 'CO', 'AR', 'CL', 'PE', 'US']

export function countryLabel(code: string): string {
  return t(`onboarding.countries.${code}`, { defaultValue: code })
}

export const SPAIN_PROVINCES = [
  'A Coruña', 'Álava', 'Albacete', 'Alicante', 'Almería', 'Asturias', 'Ávila', 'Badajoz', 'Barcelona', 'Burgos',
  'Cáceres', 'Cádiz', 'Cantabria', 'Castellón', 'Ceuta', 'Ciudad Real', 'Córdoba', 'Cuenca', 'Girona', 'Granada',
  'Guadalajara', 'Guipúzcoa', 'Huelva', 'Huesca', 'Islas Baleares', 'Jaén', 'La Rioja', 'Las Palmas', 'León',
  'Lleida', 'Lugo', 'Madrid', 'Málaga', 'Melilla', 'Murcia', 'Navarra', 'Ourense', 'Palencia', 'Pontevedra',
  'Salamanca', 'Santa Cruz de Tenerife', 'Segovia', 'Sevilla', 'Soria', 'Tarragona', 'Teruel', 'Toledo',
  'Valencia', 'Valladolid', 'Vizcaya', 'Zamora', 'Zaragoza',
]
