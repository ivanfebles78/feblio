import { describe, expect, it } from 'vitest'
import { setUserLanguage } from '../../i18n'
import { ADAPTERS, KIND_LABEL, STATUS_LABEL, adapterById, capabilityLabel, integrationStatusLabel, kindLabel } from './adapters'
import { STEPS, stepStatusLabel } from '../onboarding/steps'
import { SETUP_AREAS } from '../onboarding/areas'

describe('adaptadores e integraciones: etiquetas según idioma', () => {
  it('en español por defecto (textos originales)', () => {
    expect(adapterById('gmail')!.label).toBe('Google Workspace / Gmail')
    expect(adapterById('feblio_storage')!.description).toBe('Sin configuración. Archivos cifrados en reposo, aislados por empresa y proyecto.')
    expect(adapterById('imap')!.credentialFields![1].label).toBe('Contraseña o contraseña de aplicación')
    expect(adapterById('imap')!.credentialFields![1].hint).toBe('Nunca se muestra ni se guarda en el navegador.')
    expect(KIND_LABEL.document_repository).toBe('Repositorio documental')
    expect(STATUS_LABEL.pending_credentials).toBe('Requiere configuración del administrador de Feblio')
    expect(capabilityLabel('create_folders')).toBe('Crear carpetas')
    expect(STEPS[0].title).toBe('Empresa y propietario')
    expect(SETUP_AREAS[0].title).toBe('Perfil de empresa')
    expect(stepStatusLabel('requires_attention')).toBe('Requiere atención')
  })

  it('cambian a inglés sin recrear los objetos (getters)', () => {
    const gmail = adapterById('gmail')!
    setUserLanguage('en')
    expect(gmail.label).toBe('Google Workspace / Gmail')
    expect(adapterById('manual_log')!.label).toBe('Manual logging')
    expect(adapterById('imap')!.credentialFields![0].label).toBe('Username')
    expect(kindLabel('voice')).toBe('Calls')
    expect(KIND_LABEL.voice).toBe('Calls')
    expect(integrationStatusLabel('expired')).toBe('Expired')
    expect(STATUS_LABEL.expired).toBe('Expired')
    expect(STEPS[0].title).toBe('Company and owner')
    expect(SETUP_AREAS[2].description).toBe('Email, WhatsApp, SMS and calls. All optional.')
    expect(stepStatusLabel('skipped')).toBe('Skipped')
    // Los identificadores y códigos no cambian con el idioma
    expect(ADAPTERS.map((a) => a.id)).toContain('feblio_inbox')
    expect(gmail.capabilities).toEqual(['read_labels', 'create_drafts', 'send_with_approval'])
  })
})
