import { describe, expect, it, vi } from 'vitest'

const storage = vi.hoisted(() => ({ createSignedUrl: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: { storage: { from: () => storage } } }))

import { createIntakeSignedUrl, intakeFilePath, legacyPublicUrlToPath, SIGNED_URL_TTL_SECONDS } from './intakeFiles'

describe('adjuntos del formulario (bucket privado)', () => {
  it('extrae la ruta de una URL pública heredada', () => {
    expect(legacyPublicUrlToPath('https://x.supabase.co/storage/v1/object/public/intake-files/abc/1-plano.pdf')).toBe('abc/1-plano.pdf')
    expect(legacyPublicUrlToPath('https://evil.example/otro')).toBeNull()
  })
  it('prefiere la ruta y cae a la URL heredada', () => {
    expect(intakeFilePath({ name: 'a', path: 'tok/a.pdf' })).toBe('tok/a.pdf')
    expect(intakeFilePath({ name: 'a', url: 'https://x.supabase.co/storage/v1/object/public/intake-files/tok/a.pdf' })).toBe('tok/a.pdf')
    expect(intakeFilePath({ name: 'a' })).toBeNull()
  })
  it('genera URLs firmadas con caducidad corta y no expone errores de proveedor como URL', async () => {
    storage.createSignedUrl.mockResolvedValueOnce({ data: { signedUrl: 'https://signed?token=abc' }, error: null })
    expect(await createIntakeSignedUrl('tok/a.pdf')).toEqual({ url: 'https://signed?token=abc', error: null })
    expect(storage.createSignedUrl).toHaveBeenCalledWith('tok/a.pdf', SIGNED_URL_TTL_SECONDS)
    expect(SIGNED_URL_TTL_SECONDS).toBeLessThanOrEqual(900)
    storage.createSignedUrl.mockResolvedValueOnce({ data: null, error: { message: 'denied' } })
    expect(await createIntakeSignedUrl('otra/x.pdf')).toEqual({ url: null, error: 'denied' })
  })
})
