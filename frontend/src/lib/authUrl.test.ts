import { describe, expect, it } from 'vitest'
import { describeAuthLinkError, parseAuthParams } from './authUrl'

describe('parseAuthParams', () => {
  it('lee el tipo del enlace desde el hash (flujo implícito)', () => {
    expect(parseAuthParams({ hash: '#access_token=abc&refresh_token=def&type=recovery', search: '' }).type).toBe('recovery')
  })
  it('lee errores del hash y de la query', () => {
    const p = parseAuthParams({ hash: '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired', search: '' })
    expect(p.errorCode).toBe('otp_expired')
    expect(p.errorDescription).toMatch(/expired/)
    expect(parseAuthParams({ hash: '', search: '?error=access_denied&error_code=otp_expired' }).errorCode).toBe('otp_expired')
  })
  it('sin parámetros devuelve nulos', () => {
    expect(parseAuthParams({ hash: '', search: '' })).toEqual({ type: null, error: null, errorCode: null, errorDescription: null })
  })
})

describe('describeAuthLinkError', () => {
  it('sin error → null', () => {
    expect(describeAuthLinkError({ error: null, errorCode: null, errorDescription: null })).toBeNull()
  })
  it('enlace caducado', () => {
    expect(describeAuthLinkError({ error: 'access_denied', errorCode: 'otp_expired', errorDescription: 'Email link is invalid or has expired' })).toMatch(/caducado/)
  })
  it('enlace inválido o ya usado', () => {
    expect(describeAuthLinkError({ error: 'access_denied', errorCode: null, errorDescription: null })).toMatch(/no es válido/)
  })
})
