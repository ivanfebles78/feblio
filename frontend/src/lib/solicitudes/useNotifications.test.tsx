import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { Notificacion } from './types'

const api = vi.hoisted(() => ({
  listNotificaciones: vi.fn(),
  marcarNotificacion: vi.fn(),
  marcarTodasNotificaciones: vi.fn(),
  subscribeNotificaciones: vi.fn(),
}))
vi.mock('./api', () => api)

import { useNotifications } from './useNotifications'

const n = (id: string, read = false): Notificacion => ({ id, empresa_id: 'e1', recipient_kind: 'empresa', solicitud_id: 's1', type: 't', title: id, body: null, link_path: null, read_at: read ? '2026-01-01T00:00:00Z' : null, created_at: '2026-01-01T00:00:00Z' })

describe('useNotifications', () => {
  let trigger: () => void = () => {}
  const unsubscribe = vi.fn()
  beforeEach(() => {
    vi.clearAllMocks()
    api.subscribeNotificaciones.mockImplementation((_e: string, cb: () => void) => {
      trigger = cb
      return unsubscribe
    })
  })

  it('carga, cuenta no leídas, se suscribe por empresa y recarga al recibir un cambio', async () => {
    api.listNotificaciones.mockResolvedValueOnce([n('a'), n('b', true)]).mockResolvedValueOnce([n('c'), n('a'), n('b', true)])
    const { result, unmount } = renderHook(() => useNotifications('e1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.unread).toBe(1)
    expect(api.subscribeNotificaciones).toHaveBeenCalledWith('e1', expect.any(Function))
    act(() => trigger())
    await waitFor(() => expect(result.current.unread).toBe(2))
    unmount()
    expect(unsubscribe).toHaveBeenCalled()
  })

  it('sin empresa no consulta nada', () => {
    const { result } = renderHook(() => useNotifications(null))
    expect(result.current.loading).toBe(false)
    expect(api.listNotificaciones).not.toHaveBeenCalled()
  })

  it('marca una de forma optimista y revierte si el servidor falla', async () => {
    api.listNotificaciones.mockResolvedValue([n('a')])
    api.marcarNotificacion.mockRejectedValue(new Error('sin permiso'))
    const { result } = renderHook(() => useNotifications('e1'))
    await waitFor(() => expect(result.current.unread).toBe(1))
    await act(() => result.current.markOne('a'))
    expect(result.current.unread).toBe(1)
    expect(result.current.error).toBe('sin permiso')
  })

  it('marca todas y deja el contador a cero', async () => {
    api.listNotificaciones.mockResolvedValue([n('a'), n('b')])
    api.marcarTodasNotificaciones.mockResolvedValue(2)
    const { result } = renderHook(() => useNotifications('e1'))
    await waitFor(() => expect(result.current.unread).toBe(2))
    await act(() => result.current.markAll())
    expect(result.current.unread).toBe(0)
    expect(api.marcarTodasNotificaciones).toHaveBeenCalledTimes(1)
  })
})
