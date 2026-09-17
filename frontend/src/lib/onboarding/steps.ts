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
  title: string
  short: string
  description: string
  required: boolean
}

export const STEPS: StepDefinition[] = [
  { key: 'company', order: 1, title: 'Empresa y propietario', short: 'Empresa', description: 'Revisa los datos fiscales, de contacto y de marca.', required: true },
  { key: 'repository', order: 2, title: 'Repositorio documental', short: 'Documentos', description: 'Dónde se guardarán las carpetas y archivos de cada proyecto.', required: true },
  { key: 'email', order: 3, title: 'Correo electrónico', short: 'Email', description: 'Cuenta de recepción y envío de correos.', required: false },
  { key: 'whatsapp', order: 4, title: 'WhatsApp', short: 'WhatsApp', description: 'Número empresarial y mensajes automáticos.', required: false },
  { key: 'sms', order: 5, title: 'SMS', short: 'SMS', description: 'Envío de formularios y recordatorios por SMS.', required: false },
  { key: 'voice', order: 6, title: 'Llamadas', short: 'Llamadas', description: 'Cómo se registran o atienden las llamadas.', required: false },
  { key: 'forms', order: 7, title: 'Formularios', short: 'Formularios', description: 'Plantillas de formulario y asignación por canal.', required: true },
  { key: 'automation', order: 8, title: 'Reglas de automatización', short: 'Automatización', description: 'Qué hace Feblio solo y qué requiere aprobación.', required: true },
  { key: 'billing', order: 9, title: 'Presupuestos, facturación y pagos', short: 'Facturación', description: 'Series, impuestos, anticipo y cobros.', required: true },
  { key: 'review', order: 10, title: 'Resumen, prueba y activación', short: 'Activar', description: 'Comprueba la configuración, ejecuta una prueba y activa Feblio.', required: true },
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

export const STEP_STATUS_LABEL: Record<StepStatus, string> = {
  pending: 'Pendiente',
  in_progress: 'En curso',
  completed: 'Completado',
  skipped: 'Omitido',
  error: 'Error',
  requires_attention: 'Requiere atención',
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

export const LANGUAGES = [
  { code: 'es', label: 'Español' },
  { code: 'en', label: 'English' },
  { code: 'pt', label: 'Português' },
  { code: 'ca', label: 'Català' },
]

export const COUNTRIES = [
  { code: 'ES', label: 'España' },
  { code: 'PT', label: 'Portugal' },
  { code: 'FR', label: 'Francia' },
  { code: 'IT', label: 'Italia' },
  { code: 'DE', label: 'Alemania' },
  { code: 'GB', label: 'Reino Unido' },
  { code: 'MX', label: 'México' },
  { code: 'CO', label: 'Colombia' },
  { code: 'AR', label: 'Argentina' },
  { code: 'CL', label: 'Chile' },
  { code: 'PE', label: 'Perú' },
  { code: 'US', label: 'Estados Unidos' },
]

export const SPAIN_PROVINCES = [
  'A Coruña', 'Álava', 'Albacete', 'Alicante', 'Almería', 'Asturias', 'Ávila', 'Badajoz', 'Barcelona', 'Burgos',
  'Cáceres', 'Cádiz', 'Cantabria', 'Castellón', 'Ceuta', 'Ciudad Real', 'Córdoba', 'Cuenca', 'Girona', 'Granada',
  'Guadalajara', 'Guipúzcoa', 'Huelva', 'Huesca', 'Islas Baleares', 'Jaén', 'La Rioja', 'Las Palmas', 'León',
  'Lleida', 'Lugo', 'Madrid', 'Málaga', 'Melilla', 'Murcia', 'Navarra', 'Ourense', 'Palencia', 'Pontevedra',
  'Salamanca', 'Santa Cruz de Tenerife', 'Segovia', 'Sevilla', 'Soria', 'Tarragona', 'Teruel', 'Toledo',
  'Valencia', 'Valladolid', 'Vizcaya', 'Zamora', 'Zaragoza',
]
