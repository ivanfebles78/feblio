// Feblio · plantillas por defecto de los canales (WhatsApp, SMS, voz, formularios) en español e inglés.
//
// Son textos que la empresa envía a SUS clientes, así que su idioma es el de la empresa
// (`empresas.language`), no el de la interfaz del empleado. Solo se usan al inicializar un paso: los
// valores ya guardados (personalizados o no) se conservan tal cual y nunca se reescriben. Las variables
// {empresa}, {nombre}, {url} son idénticas en ambos idiomas.
import type { Language } from '../../i18n'

export type ChannelDefaultKey =
  | 'form_message'
  | 'whatsapp_welcome'
  | 'whatsapp_off_hours'
  | 'whatsapp_consent'
  | 'whatsapp_escalation_keywords'
  | 'sms_form_message'
  | 'sms_opt_out_keyword'
  | 'voice_welcome'

export const CHANNEL_DEFAULTS: Record<ChannelDefaultKey, Record<Language, string>> = {
  form_message: {
    es: 'Hola {nombre}, soy {empresa}. Para atender tu solicitud necesitamos algunos datos. Complétalos aquí: {url}',
    en: 'Hi {nombre}, this is {empresa}. To handle your request we need a few details. Complete them here: {url}',
  },
  whatsapp_welcome: {
    es: 'Hola, gracias por escribir a {empresa}. Cuéntanos en qué podemos ayudarte.',
    en: 'Hello, thanks for contacting {empresa}. Tell us how we can help you.',
  },
  whatsapp_off_hours: {
    es: 'Gracias por tu mensaje. Ahora mismo estamos fuera de horario; te responderemos el próximo día laborable.',
    en: 'Thanks for your message. We are currently out of office hours; we will reply on the next business day.',
  },
  whatsapp_consent: {
    es: 'Al continuar aceptas que tratemos tus datos para atender tu solicitud.',
    en: 'By continuing you agree that we process your data to handle your request.',
  },
  whatsapp_escalation_keywords: {
    es: 'persona, agente, humano',
    en: 'person, agent, human',
  },
  sms_form_message: {
    es: '{empresa}: completa tus datos aquí {url}. Responde BAJA para no recibir más SMS.',
    en: '{empresa}: complete your details here {url}. Reply STOP to opt out of SMS.',
  },
  sms_opt_out_keyword: {
    es: 'BAJA',
    en: 'STOP',
  },
  voice_welcome: {
    es: 'Gracias por llamar a {empresa}. En un momento le atendemos.',
    en: 'Thank you for calling {empresa}. We will be with you in a moment.',
  },
}

/** Normaliza el idioma de la empresa: solo es | en; cualquier otro valor → es. */
export function channelLanguage(value: unknown): Language {
  return value === 'en' ? 'en' : 'es'
}

/** Plantilla por defecto de Feblio para un canal en el idioma de la empresa. */
export function channelDefault(key: ChannelDefaultKey, language: unknown): string {
  return CHANNEL_DEFAULTS[key][channelLanguage(language)]
}

/** Variables {x} de una plantilla de canal, ordenadas (para comprobar paridad es/en). */
export function templateVariables(template: string): string[] {
  return [...template.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]).sort()
}
