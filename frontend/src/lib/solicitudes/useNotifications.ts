import { useCallback, useEffect, useRef, useState } from 'react'
import { t } from '../../i18n'
import { listNotificaciones, marcarNotificacion, marcarTodasNotificaciones, subscribeNotificaciones } from './api'
import type { Notificacion } from './types'

/** Intervalo de recarga cuando Realtime no está disponible (o como red de seguridad). */
export const NOTIFICATIONS_POLL_MS = 60_000

export interface NotificationsState {
  items: Notificacion[]
  unread: number
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  markOne: (id: string) => Promise<void>
  markAll: () => Promise<void>
}

/**
 * Notificaciones internas de la empresa: carga por RLS, suscripción Realtime a la tabla
 * `notificaciones` (filtrada por empresa) y recarga de respaldo por intervalo y al volver
 * el foco a la pestaña. Las marcas de lectura son optimistas y se revierten si fallan.
 */
export function useNotifications(empresaId: string | null): NotificationsState {
  const [items, setItems] = useState<Notificacion[]>([])
  const [loading, setLoading] = useState(!!empresaId)
  const [error, setError] = useState<string | null>(null)
  const alive = useRef(true)

  const reload = useCallback(async () => {
    if (!empresaId) return
    try {
      const rows = await listNotificaciones()
      if (!alive.current) return
      setItems(rows)
      setError(null)
    } catch (e) {
      if (!alive.current) return
      setError(e instanceof Error ? e.message : t('requests.api.loadNotifications'))
    } finally {
      if (alive.current) setLoading(false)
    }
  }, [empresaId])

  useEffect(() => {
    alive.current = true
    if (!empresaId) return
    void reload()
    const unsubscribe = subscribeNotificaciones(empresaId, () => void reload())
    const timer = window.setInterval(() => void reload(), NOTIFICATIONS_POLL_MS)
    const onFocus = () => void reload()
    window.addEventListener('focus', onFocus)
    return () => {
      alive.current = false
      unsubscribe()
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [empresaId, reload])

  const markOne = useCallback(async (id: string) => {
    const now = new Date().toISOString()
    setItems((prev) => prev.map((n) => (n.id === id && !n.read_at ? { ...n, read_at: now } : n)))
    try {
      await marcarNotificacion(id)
    } catch (e) {
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: null } : n)))
      setError(e instanceof Error ? e.message : t('requests.notifications.markOneFailed'))
    }
  }, [])

  const markAll = useCallback(async () => {
    const now = new Date().toISOString()
    const snapshot = items
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })))
    try {
      await marcarTodasNotificaciones()
    } catch (e) {
      setItems(snapshot)
      setError(e instanceof Error ? e.message : t('requests.notifications.markAllFailed'))
    }
  }, [items])

  return { items, unread: items.filter((n) => !n.read_at).length, loading, error, reload, markOne, markAll }
}
