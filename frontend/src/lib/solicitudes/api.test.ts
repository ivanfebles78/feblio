import { beforeEach, describe, expect, it, vi } from 'vitest'

const sb = vi.hoisted(() => ({ functions: { invoke: vi.fn() } }))
vi.mock('../supabase', () => ({ supabase: sb }))

import { clienteDescargarDocumento, DOWNLOAD_FUNCTION } from './api'

describe('clienteDescargarDocumento (Edge Function solicitud-descarga)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('envía token y documento a la Edge Function y devuelve la URL firmada', async () => {
    sb.functions.invoke.mockResolvedValue({ data: { url: 'https://x/sign?token=1', name: 'a.pdf', expires_in: 300 }, error: null })
    const r = await clienteDescargarDocumento('t'.repeat(43), 'doc-1')
    expect(sb.functions.invoke).toHaveBeenCalledWith(DOWNLOAD_FUNCTION, { body: { token: 't'.repeat(43), document_id: 'doc-1' } })
    expect(r).toEqual({ url: 'https://x/sign?token=1', name: 'a.pdf' })
  })

  it('cualquier error (404 neutro) se traduce a un mensaje sin detalles técnicos', async () => {
    sb.functions.invoke.mockResolvedValue({ data: null, error: Object.assign(new Error('Edge Function returned a non-2xx status code'), { context: { status: 404 } }) })
    await expect(clienteDescargarDocumento('t'.repeat(43), 'doc-1')).rejects.toThrow(/no está disponible/i)
  })

  it('límite de frecuencia (429): mensaje específico', async () => {
    sb.functions.invoke.mockResolvedValue({ data: null, error: Object.assign(new Error('x'), { context: { status: 429 } }) })
    await expect(clienteDescargarDocumento('t'.repeat(43), 'doc-1')).rejects.toThrow(/demasiadas descargas/i)
  })

  it('respuesta sin URL también falla de forma neutra', async () => {
    sb.functions.invoke.mockResolvedValue({ data: { error: 'Enlace no válido' }, error: null })
    await expect(clienteDescargarDocumento('t'.repeat(43), 'doc-1')).rejects.toThrow(/no está disponible/i)
  })
})
