import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Button } from '../v2/Button'
import { Card } from '../v2/Card'
import { Checklist, ProgressRing, type ChecklistItemData } from '../v2/Progress'
import { getStepStatuses } from '../../lib/onboarding/api'
import { computeSetupProgress, type SetupProgress } from '../../lib/onboarding/areas'
import { onboardingStepPath, type OnboardingStatus } from '../../lib/routing'

const dismissKey = (empresaId: string) => `feblio:setup-card-dismissed:${empresaId}`

function readDismissed(empresaId: string): boolean {
  try {
    return sessionStorage.getItem(dismissKey(empresaId)) === '1'
  } catch {
    return false
  }
}
function writeDismissed(empresaId: string, v: boolean) {
  try {
    if (v) sessionStorage.setItem(dismissKey(empresaId), '1')
    else sessionStorage.removeItem(dismissKey(empresaId))
  } catch {
    /* almacenamiento no disponible: la tarjeta simplemente vuelve a mostrarse */
  }
}

/** Progreso real de la configuración progresiva (5 áreas sobre los 10 pasos del wizard). */
export function useSetupProgress(empresaId: string | null, onboardingStatus: OnboardingStatus | null | undefined) {
  const [progress, setProgress] = useState<SetupProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    if (!empresaId) return
    try {
      const statuses = onboardingStatus === 'completed' ? {} : await getStepStatuses(empresaId)
      setProgress(computeSetupProgress(statuses, onboardingStatus))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el progreso.')
    }
  }, [empresaId, onboardingStatus])
  useEffect(() => {
    load()
  }, [load])
  return { progress, error, reload: load }
}

interface SetupProgressCardProps {
  empresaId: string
  progress: SetupProgress
  /** Resalta la tarjeta (llegada desde «Configurar Feblio»). */
  highlight?: boolean
}

/**
 * Tarjeta principal del dashboard mientras la configuración esté incompleta.
 * «Configurar» abre el paso real del wizard; «Continuar después» la pliega
 * (por sesión y empresa) sin bloquear ninguna función. Completa → no se muestra.
 */
export function SetupProgressCard({ empresaId, progress, highlight = false }: SetupProgressCardProps) {
  const navigate = useNavigate()
  const [dismissed, setDismissed] = useState(() => readDismissed(empresaId))

  if (progress.complete) return null

  const items: ChecklistItemData[] = progress.areas.map((a) => ({
    key: a.key,
    title: a.title,
    description: a.description,
    status: a.status,
    minutes: a.minutes,
  }))

  function openArea(key: string) {
    const area = progress.areas.find((a) => a.key === key)
    const step = area?.nextStep ?? area?.steps[0] ?? 'company'
    navigate(onboardingStepPath(step))
  }

  if (dismissed) {
    return (
      <p className="flex flex-wrap items-center gap-x-2 text-sm text-slate-600" role="status">
        <span>
          Configuración pendiente: {progress.completedAreas} de {progress.totalAreas} áreas ({progress.percent}%).
        </span>
        <button
          type="button"
          onClick={() => {
            writeDismissed(empresaId, false)
            setDismissed(false)
          }}
          className="font-medium text-brand-700 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          Retomar ahora
        </button>
      </p>
    )
  }

  const next = progress.nextArea
  return (
    <Card className={`p-5 sm:p-6 ${highlight ? 'ring-2 ring-brand-500 ring-offset-2' : ''}`} aria-labelledby="setup-title">
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex items-start gap-4 lg:w-72 lg:shrink-0">
          <ProgressRing value={progress.percent} label="Configuración completada" />
          <div>
            <h2 id="setup-title" className="text-base font-semibold text-slate-900">
              Configura Feblio a tu ritmo
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {progress.completedAreas} de {progress.totalAreas} áreas completadas · unos {progress.minutesRemaining} min restantes.
            </p>
            {next && (
              <p className="mt-3 text-sm">
                <span className="font-medium text-slate-900">Siguiente acción recomendada:</span> <span className="text-slate-700">{next.title}</span>
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {next && (
                <Button size="sm" onClick={() => openArea(next.key)} trailing={<ArrowRight className="h-4 w-4" aria-hidden="true" />} aria-label={`Continuar con ${next.title.toLowerCase()}`}>
                  Continuar
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  writeDismissed(empresaId, true)
                  setDismissed(true)
                }}
              >
                Continuar después
              </Button>
            </div>
          </div>
        </div>
        <div className="min-w-0 flex-1 lg:border-l lg:border-slate-200 lg:pl-6">
          <Checklist items={items} onAction={openArea} />
        </div>
      </div>
    </Card>
  )
}
