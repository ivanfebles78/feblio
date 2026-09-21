import { describe, expect, it } from 'vitest'
import { buildSignUpMetadata, signUpLanguage } from './AuthContext'
import { LEGAL_VERSIONS } from '../lib/legal'
import { setUserLanguage } from '../i18n'

const BASE = { email: 'a@b.es', password: 'x', fullName: 'A B', role: 'empresa' as const, termsAccepted: true }

describe('buildSignUpMetadata (metadatos para handle_new_user)', () => {
  it('separa full_name y company_name, infiere tax_type y normaliza tax_id', () => {
    const m = buildSignUpMetadata({
      email: 'ana@ralm.es',
      password: 'x',
      fullName: ' Ana Pérez ',
      role: 'empresa',
      companyName: ' RALM, S.L. ',
      entityType: 'self_employed',
      taxId: '12345678-z',
      termsAccepted: true,
      marketingConsent: true,
    }, 'Mozilla/5.0')
    expect(m).toMatchObject({
      full_name: 'Ana Pérez',
      company_name: 'RALM, S.L.',
      entity_type: 'self_employed',
      tax_type: 'NIF',
      tax_id: '12345678Z',
      terms_accepted: true,
      marketing_consent: true,
      terms_version: LEGAL_VERSIONS.terms,
      privacy_version: LEGAL_VERSIONS.privacy,
      user_agent: 'Mozilla/5.0',
      role: 'empresa',
    })
    expect(m).not.toHaveProperty('password')
    expect(m).not.toHaveProperty('confirmPassword')
  })
  it('mantiene compatibilidad con taxType cuando no se indica entityType', () => {
    const m = buildSignUpMetadata({ email: 'a@b.es', password: 'x', fullName: 'A B', role: 'empresa', taxType: 'CIF', termsAccepted: true })
    expect(m.entity_type).toBe('company')
    expect(m.tax_type).toBe('CIF')
    expect(m.marketing_consent).toBe(false)
  })

  describe('language (idioma de la interfaz al registrarse)', () => {
    it("incluye 'es' por defecto cuando no se indica idioma", () => {
      expect(buildSignUpMetadata(BASE).language).toBe('es')
    })
    it("respeta 'en' cuando se pasa explícitamente", () => {
      expect(buildSignUpMetadata({ ...BASE, language: 'en' }).language).toBe('en')
    })
    it("un valor no soportado ('fr') cae al idioma actual de la interfaz", () => {
      expect(buildSignUpMetadata({ ...BASE, language: 'fr' }).language).toBe('es')
      expect(signUpLanguage('fr')).toBe('es')
    })
    it('sin idioma explícito usa el idioma actual de la interfaz (inglés si la persona lo cambió)', () => {
      setUserLanguage('en')
      expect(buildSignUpMetadata(BASE).language).toBe('en')
      expect(buildSignUpMetadata({ ...BASE, language: 'fr' }).language).toBe('en')
    })
  })
})
