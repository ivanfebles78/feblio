/**
 * Estado del onboarding compartido entre el wizard y las pantallas de
 * Configuración. Carga el snapshot del servidor, mantiene borradores locales
 * por paso y persiste con autoguardado (debounce) y reintentos.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { t } from '../../i18n'
import * as api from './api'
import type { OnboardingSnapshot, OnboardingStepKey, OnboardingStepRow, SaveState, StepStatus } from './types'

const AUTOSAVE_DELAY_MS = 900
const MAX_RETRIES = 2

type Persister = () => Promise<void>

export interface OnboardingContextValue {
  snapshot: OnboardingSnapshot | null
  loading: boolean
  error: string | null
  reload: () => Promise<void>

  saveState: SaveState
  saveError: string | null
  lastSavedAt: Date | null
  /** Hay cambios locales sin persistir */
  dirty: boolean
  /** Persiste inmediatamente todo lo pendiente */
  flush: () => Promise<boolean>
  retry: () => Promise<boolean>

  /** Datos de un paso: servidor + borrador local */
  getStepData: <T extends Record<string, unknown>>(key: OnboardingStepKey, defaults: () => T) => T
  /** Actualiza el borrador local y programa el guardado */
  updateStepData: <T extends Record<string, unknown>>(key: OnboardingStepKey, patch: Partial<T>, defaults: () => T) => void
  /** Registra una persistencia personalizada (p. ej. tablas empresas/profiles) con debounce por clave */
  scheduleSave: (key: string, persister: Persister) => void

  stepRow: (key: OnboardingStepKey) => OnboardingStepRow | undefined
  stepStatus: (key: OnboardingStepKey) => StepStatus
  completeStep: (key: OnboardingStepKey, data?: Record<string, unknown>) => Promise<boolean>
  skipStep: (key: OnboardingStepKey, reason?: string) => Promise<boolean>
  reopenStep: (key: OnboardingStepKey) => Promise<boolean>

  /** Ejecuta una acción que modifica el servidor y recarga el snapshot */
  runAction: (fn: () => Promise<unknown>, opts?: { reload?: boolean }) => Promise<boolean>
  /** Actualiza el snapshot local sin red (respuesta optimista) */
  patchSnapshot: (updater: (s: OnboardingSnapshot) => OnboardingSnapshot) => void
}

const OnboardingContext = createContext<OnboardingContextValue | undefined>(undefined)

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : t('onboarding.context.unknownError')
}

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<OnboardingSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [drafts, setDrafts] = useState<Partial<Record<OnboardingStepKey, Record<string, unknown>>>>({})
  const [dirty, setDirty] = useState(false)

  const pending = useRef<Map<string, Persister>>(new Map())
  const timer = useRef<number | null>(null)
  const draftsRef = useRef(drafts)
  draftsRef.current = drafts

  const reload = useCallback(async () => {
    try {
      const snap = await api.getOnboarding()
      setSnapshot(snap)
      setError(null)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  /* ---------------- Persistencia con debounce y reintentos ---------------- */

  const runPending = useCallback(async (): Promise<boolean> => {
    if (timer.current) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
    if (pending.current.size === 0) return true
    setSaveState('saving')
    setSaveError(null)
    const entries = Array.from(pending.current.entries())
    let allOk = true
    for (const [key, persister] of entries) {
      let attempt = 0
      let ok = false
      while (attempt <= MAX_RETRIES && !ok) {
        try {
          await persister()
          ok = true
          pending.current.delete(key)
        } catch (e) {
          attempt += 1
          if (attempt > MAX_RETRIES) {
            allOk = false
            setSaveError(errorMessage(e))
          } else {
            await new Promise((r) => setTimeout(r, 400 * attempt))
          }
        }
      }
    }
    if (allOk) {
      setSaveState('saved')
      setLastSavedAt(new Date())
      setDirty(false)
    } else {
      setSaveState('error')
    }
    return allOk
  }, [])

  const scheduleSave = useCallback(
    (key: string, persister: Persister) => {
      pending.current.set(key, persister)
      setDirty(true)
      setSaveState('idle')
      if (timer.current) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => {
        runPending()
      }, AUTOSAVE_DELAY_MS)
    },
    [runPending],
  )

  const flush = useCallback(() => runPending(), [runPending])
  const retry = useCallback(() => runPending(), [runPending])

  // Aviso antes de abandonar con cambios sin guardar
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (pending.current.size > 0) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  /* ---------------- Datos por paso ---------------- */

  const stepRow = useCallback(
    (key: OnboardingStepKey) => snapshot?.steps.find((s) => s.step_key === key),
    [snapshot],
  )

  const stepStatus = useCallback((key: OnboardingStepKey): StepStatus => stepRow(key)?.status ?? 'pending', [stepRow])

  const getStepData = useCallback(
    <T extends Record<string, unknown>>(key: OnboardingStepKey, defaults: () => T): T => {
      const server = (stepRow(key)?.data ?? {}) as Partial<T>
      const draft = (drafts[key] ?? {}) as Partial<T>
      return { ...defaults(), ...server, ...draft }
    },
    [drafts, stepRow],
  )

  const updateStepData = useCallback(
    <T extends Record<string, unknown>>(key: OnboardingStepKey, patch: Partial<T>, defaults: () => T) => {
      setDrafts((prev) => ({ ...prev, [key]: { ...(prev[key] ?? {}), ...patch } }))
      scheduleSave(`step:${key}`, async () => {
        const server = (stepRow(key)?.data ?? {}) as Partial<T>
        const draft = (draftsRef.current[key] ?? {}) as Partial<T>
        const full = { ...defaults(), ...server, ...draft }
        const row = await api.saveStep(key, full)
        setSnapshot((s) => (s ? { ...s, steps: s.steps.map((st) => (st.step_key === key ? row : st)) } : s))
      })
    },
    [scheduleSave, stepRow],
  )

  /* ---------------- Acciones ---------------- */

  const runAction = useCallback(
    async (fn: () => Promise<unknown>, opts: { reload?: boolean } = { reload: true }) => {
      setSaveState('saving')
      setSaveError(null)
      try {
        await runPending()
        await fn()
        if (opts.reload !== false) {
          const snap = await api.getOnboarding()
          setSnapshot(snap)
        }
        setSaveState('saved')
        setLastSavedAt(new Date())
        return true
      } catch (e) {
        setSaveState('error')
        setSaveError(errorMessage(e))
        return false
      }
    },
    [runPending],
  )

  const completeStep = useCallback(
    (key: OnboardingStepKey, data?: Record<string, unknown>) =>
      runAction(async () => {
        const merged = data ?? { ...(stepRow(key)?.data ?? {}), ...(draftsRef.current[key] ?? {}) }
        const row = await api.completeStep(key, merged)
        setDrafts((prev) => {
          const next = { ...prev }
          delete next[key]
          return next
        })
        setSnapshot((s) => (s ? { ...s, steps: s.steps.map((st) => (st.step_key === key ? row : st)) } : s))
      }),
    [runAction, stepRow],
  )

  const skipStep = useCallback(
    (key: OnboardingStepKey, reason?: string) =>
      runAction(async () => {
        const row = await api.skipStep(key, reason)
        setSnapshot((s) => (s ? { ...s, steps: s.steps.map((st) => (st.step_key === key ? row : st)) } : s))
      }),
    [runAction],
  )

  const reopenStep = useCallback(
    (key: OnboardingStepKey) =>
      runAction(async () => {
        const row = await api.reopenStep(key)
        setSnapshot((s) => (s ? { ...s, steps: s.steps.map((st) => (st.step_key === key ? row : st)) } : s))
      }),
    [runAction],
  )

  const patchSnapshot = useCallback((updater: (s: OnboardingSnapshot) => OnboardingSnapshot) => {
    setSnapshot((s) => (s ? updater(s) : s))
  }, [])

  const value = useMemo<OnboardingContextValue>(
    () => ({
      snapshot, loading, error, reload,
      saveState, saveError, lastSavedAt, dirty, flush, retry,
      getStepData, updateStepData, scheduleSave,
      stepRow, stepStatus, completeStep, skipStep, reopenStep,
      runAction, patchSnapshot,
    }),
    [snapshot, loading, error, reload, saveState, saveError, lastSavedAt, dirty, flush, retry, getStepData, updateStepData, scheduleSave, stepRow, stepStatus, completeStep, skipStep, reopenStep, runAction, patchSnapshot],
  )

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext)
  if (!ctx) throw new Error('useOnboarding debe usarse dentro de <OnboardingProvider>')
  return ctx
}
