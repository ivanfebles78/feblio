import { Link } from 'react-router-dom'
import { ArrowRight, ClipboardList } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { STEPS } from '../../lib/onboarding/steps'
import { onboardingStepPath } from '../../lib/routing'
import type { OnboardingStepKey } from '../../lib/onboarding/types'

interface OnboardingResumeBannerProps {
  currentStep: OnboardingStepKey | null
  completedCount: number
}

/** Banner de onboarding incompleto (se muestra en el wizard al reanudar y en el dashboard si procede). */
export function OnboardingResumeBanner({ currentStep, completedCount }: OnboardingResumeBannerProps) {
  const { t } = useTranslation()
  const def = STEPS.find((s) => s.key === currentStep)
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900 sm:flex-row sm:items-center sm:justify-between" role="status">
      <div className="flex items-start gap-2">
        <ClipboardList className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>
          {completedCount >= STEPS.length ? (
            <>
              {t('onboarding.resume.reopenedBefore')} <strong>{t('onboarding.resume.reopenedAction')}</strong> {t('onboarding.resume.reopenedAfter')}
            </>
          ) : (
            <>
              {t('onboarding.resume.incomplete', { completed: completedCount, total: STEPS.length })}
              {def && (
                <>
                  {' '}
                  {t('onboarding.resume.continueAt')} <strong>{def.title}</strong>.
                </>
              )}
            </>
          )}
        </p>
      </div>
      <Link to={onboardingStepPath(currentStep ?? 'company')} className="inline-flex items-center gap-1 self-start font-semibold text-brand-700 hover:underline sm:self-auto">
        {t('onboarding.resume.resume')} <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  )
}
