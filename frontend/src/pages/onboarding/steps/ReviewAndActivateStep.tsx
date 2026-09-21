import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CheckCircle2, FlaskConical, Rocket, Trash2, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatDateTime } from '../../../lib/intl'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { StepStatusBadge } from '../../../components/onboarding/StepStatusBadge'
import { ConnectionStatus } from '../../../components/onboarding/ConnectionStatus'
import { useOnboarding } from '../../../lib/onboarding/OnboardingContext'
import { activateOnboarding, cleanupTestData, createInternalProjectFolders, getBlockers, runOnboardingTest } from '../../../lib/onboarding/api'
import { adapterById, kindLabel } from '../../../lib/integrations/adapters'
import { STEPS } from '../../../lib/onboarding/steps'
import { onboardingStepPath } from '../../../lib/routing'
import type { Blocker, TestRunStep } from '../../../lib/onboarding/types'
import type { StepProps } from './types'

const AUTOMATION_FLAGS = ['auto_create_request', 'auto_create_project', 'auto_send_form', 'auto_request_missing_docs', 'auto_schedule_call', 'auto_draft_quote', 'auto_send_quote', 'auto_reminders'] as const

export function ReviewAndActivateStep({ mode }: StepProps) {
  const { t } = useTranslation()
  const ctx = useOnboarding()
  const navigate = useNavigate()
  const snap = ctx.snapshot
  const [blockers, setBlockers] = useState<Blocker[] | null>(null)
  const [testing, setTesting] = useState(false)
  const [testSteps, setTestSteps] = useState<TestRunStep[] | null>(snap?.last_test_run?.status === 'completed' ? snap.last_test_run.steps : null)
  const [testError, setTestError] = useState<string | null>(null)
  const [confirmActivate, setConfirmActivate] = useState(false)
  const [confirmCleanup, setConfirmCleanup] = useState(false)
  const [activating, setActivating] = useState(false)
  const [activationError, setActivationError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    getBlockers()
      .then((b) => active && setBlockers(b))
      .catch(() => active && setBlockers([]))
    return () => {
      active = false
    }
  }, [snap])

  if (!snap) return null
  const steps = STEPS.filter((s) => s.key !== 'review')
  const skipped = steps.filter((s) => ctx.stepStatus(s.key) === 'skipped')
  const errored = steps.filter((s) => ['error', 'requires_attention'].includes(ctx.stepStatus(s.key)))
  const pendingIntegrations = snap.integrations.filter((i) => i.status === 'pending_credentials')
  const canActivate = blockers !== null && blockers.length === 0
  const hasTestData = snap.last_test_run && snap.last_test_run.status !== 'cleaned'
  const a = snap.automation

  async function runTest() {
    setTesting(true)
    setTestError(null)
    setTestSteps(null)
    try {
      await ctx.flush()
      const res = await runOnboardingTest()
      let stepsOut = res.steps as TestRunStep[]
      // Paso 4: crear la carpeta en el repositorio elegido (interno: Storage; externos: Edge Function)
      const repo = snap!.integrations.find((i) => i.kind === 'document_repository')
      if (repo?.provider === 'feblio_storage' && repo.status === 'connected') {
        const folders = snap!.folder_templates.find((f) => f.is_default)?.folders ?? []
        try {
          const path = await createInternalProjectFolders(snap!.empresa.id, `TEST_${res.project_id.slice(0, 8)}_Cliente_de_ejemplo`, folders)
          stepsOut = stepsOut.map((s) => (s.key === 'create_folder' ? { ...s, ok: true, path } : s))
        } catch (e) {
          stepsOut = stepsOut.map((s) => (s.key === 'create_folder' ? { ...s, ok: false, error: e instanceof Error ? e.message : 'Error' } : s))
        }
      } else if (repo?.status !== 'connected') {
        stepsOut = stepsOut.map((s) => (s.key === 'create_folder' ? { ...s, ok: false, error: t('onboarding.review.repoNotConnected') } : s))
      }
      setTestSteps(stepsOut)
      await ctx.reload()
    } catch (e) {
      setTestError(e instanceof Error ? e.message : t('onboarding.review.testFailed'))
    } finally {
      setTesting(false)
    }
  }

  async function cleanup() {
    setConfirmCleanup(false)
    const ok = await ctx.runAction(() => cleanupTestData())
    if (ok) setTestSteps(null)
  }

  async function activate() {
    setConfirmActivate(false)
    setActivating(true)
    setActivationError(null)
    try {
      await ctx.flush()
      const res = await activateOnboarding()
      if (!res.ok) {
        setBlockers(res.blockers ?? [])
        setActivationError(t('onboarding.review.cannotActivate'))
        return
      }
      navigate('/empresa?welcome=1', { replace: true })
    } catch (e) {
      setActivationError(e instanceof Error ? e.message : t('onboarding.review.activateFailed'))
    } finally {
      setActivating(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Resumen de pasos */}
      <section aria-labelledby="sec-review-steps">
        <h2 id="sec-review-steps" className="mb-3 text-sm font-semibold text-slate-800">
          {t('onboarding.review.statusTitle')}
        </h2>
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">{t('onboarding.review.colStep')}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t('onboarding.review.colStatus')}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t('onboarding.review.colType')}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t('onboarding.review.colLastTest')}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t('onboarding.review.colErrors')}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t('onboarding.review.colAction')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {steps.map((s) => {
                const row = ctx.stepRow(s.key)
                const st = ctx.stepStatus(s.key)
                const kindMap: Record<string, string> = { repository: 'document_repository', email: 'email', whatsapp: 'whatsapp', sms: 'sms', voice: 'voice' }
                const conn = snap.integrations.find((i) => i.kind === kindMap[s.key])
                return (
                  <tr key={s.key}>
                    <th scope="row" className="px-3 py-2 text-left font-medium text-slate-800">
                      <Link to={onboardingStepPath(s.key)} className="hover:underline">
                        {s.order}. {s.title}
                      </Link>
                    </th>
                    <td className="px-3 py-2"><StepStatusBadge status={st} /></td>
                    <td className="px-3 py-2 text-xs text-slate-500">{s.required ? t('onboarding.review.required') : t('onboarding.review.optional')}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      {conn?.last_test_at ? `${formatDateTime(conn.last_test_at)} · ${conn.last_test_ok ? t('onboarding.review.testOk') : t('onboarding.review.testFailedShort')}` : '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-red-700">{row?.errors?.length ? row.errors.map((e) => e.message).join('; ') : conn?.last_error ?? '—'}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{t(`onboarding.review.recommended.${st}`)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Integraciones y automatización */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 p-4">
          <h2 className="text-sm font-semibold text-slate-800">{t('onboarding.review.integrationsTitle')}</h2>
          <ul className="mt-2 space-y-1.5 text-xs">
            {snap.integrations.map((i) => (
              <li key={i.kind} className="flex items-center justify-between gap-2">
                <span className="text-slate-700">
                  {kindLabel(i.kind)}
                  {i.provider && <span className="text-slate-400"> · {adapterById(i.provider)?.label ?? i.provider}</span>}
                </span>
                <ConnectionStatus status={i.status} />
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-slate-200 p-4">
          <h2 className="text-sm font-semibold text-slate-800">{t('onboarding.review.automationTitle')}</h2>
          <p className="mt-1 text-xs text-slate-600">
            {a.require_human_approval ? t('onboarding.review.levelWith', { level: a.level }) : t('onboarding.review.levelWithout', { level: a.level })}
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
            {AUTOMATION_FLAGS.filter((k) => a[k]).map((k) => (
              <li key={k} className="rounded-full bg-brand-50 px-2 py-0.5 text-brand-700 ring-1 ring-brand-100">
                {t(`onboarding.review.flags.${k}`)}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Prueba guiada */}
      <section aria-labelledby="sec-test" className="rounded-2xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="sec-test" className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <FlaskConical className="h-4 w-4 text-brand-600" aria-hidden="true" /> {t('onboarding.review.testTitle')}
          </h2>
          <div className="flex gap-2">
            {hasTestData && (
              <button type="button" onClick={() => setConfirmCleanup(true)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50">
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> {t('onboarding.review.deleteTestData')}
              </button>
            )}
            <button type="button" onClick={runTest} disabled={testing} className="btn-primary !px-3 !py-2 text-xs">
              {testing ? t('onboarding.review.running') : hasTestData ? t('onboarding.review.repeatTest') : t('onboarding.review.runTest')}
            </button>
          </div>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {t('onboarding.review.testDescriptionBefore')} <strong>{t('onboarding.review.testDescriptionStrong')}</strong>
          {t('onboarding.review.testDescriptionAfter')}
        </p>
        {testError && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
            {testError}
          </p>
        )}
        {testSteps && (
          <ol className="mt-3 grid gap-1.5 sm:grid-cols-2" aria-label={t('onboarding.review.testResult')}>
            {testSteps.map((s, i) => (
              <li key={s.key} className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${s.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
                {s.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                <span>
                  <span className="font-medium">
                    {i + 1}. {s.label}
                  </span>
                  {s.key === 'open_form' && s.token ? (
                    <>
                      {' '}
                      · <a href={`/form/${String(s.token)}`} target="_blank" rel="noreferrer" className="underline">{t('onboarding.review.viewForm')}</a>
                    </>
                  ) : null}
                  {s.key === 'draft_quote' && `: ${s.amount} + ${s.tax_type} ${s.tax_rate}% = ${Number(s.amount) + Number(s.tax)}`}
                  {s.key === 'simulate_advance' && `: ${s.advance} (${s.advance_percentage}%) · ${s.note}`}
                  {!s.ok && s.error ? ` · ${String(s.error)}` : ''}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Activación */}
      <section aria-labelledby="sec-activate" className="rounded-2xl border-2 border-brand-200 bg-brand-50/40 p-5">
        <h2 id="sec-activate" className="flex items-center gap-2 text-base font-bold text-slate-900">
          <Rocket className="h-5 w-5 text-brand-600" aria-hidden="true" /> {t('onboarding.review.activateTitle')}
        </h2>
        <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
          <div>
            <dt className="font-semibold text-slate-600">{t('onboarding.review.stepsCompleted')}</dt>
            <dd className="text-slate-800">{t('onboarding.review.ofTotal', { done: steps.filter((s) => ctx.stepStatus(s.key) === 'completed').length, total: steps.length })}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-600">{t('onboarding.review.stepsSkipped')}</dt>
            <dd className="text-slate-800">{skipped.length ? skipped.map((s) => s.title).join(', ') : t('onboarding.review.none')}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-600">{t('onboarding.review.errors')}</dt>
            <dd className="text-slate-800">{errored.length ? errored.map((s) => s.title).join(', ') : t('onboarding.review.none')}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-600">{t('onboarding.review.pendingIntegrations')}</dt>
            <dd className="text-slate-800">{pendingIntegrations.length ? pendingIntegrations.map((i) => kindLabel(i.kind)).join(', ') : t('onboarding.review.noneF')}</dd>
          </div>
        </dl>

        {blockers === null ? (
          <p className="mt-4 text-xs text-slate-500" aria-live="polite">{t('onboarding.review.checking')}</p>
        ) : blockers.length > 0 ? (
          <div className="mt-4 rounded-xl bg-white p-3 ring-1 ring-red-200" role="alert">
            <p className="text-xs font-semibold text-red-700">{t('onboarding.review.blockersTitle')}</p>
            <ul className="mt-1 space-y-1 text-xs text-red-700">
              {blockers.map((b) => (
                <li key={b.code} className="flex items-start gap-1.5">
                  <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    {t(`onboarding.review.blockerCodes.${b.code}`, { defaultValue: b.message })}{' '}
                    <Link to={onboardingStepPath(b.step)} className="font-semibold underline">
                      {t('onboarding.review.goToStep')}
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-4 flex items-center gap-1.5 text-xs font-medium text-emerald-700" aria-live="polite">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> {t('onboarding.review.allReady')}
          </p>
        )}
        {activationError && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
            {activationError}
          </p>
        )}
        <div className="mt-5">
          <button type="button" onClick={() => setConfirmActivate(true)} disabled={!canActivate || activating} className="btn-primary">
            <Rocket className="h-4 w-4" aria-hidden="true" /> {activating ? t('onboarding.review.activating') : mode === 'settings' ? t('onboarding.review.saveAndClose') : t('onboarding.review.activate')}
          </button>
        </div>
      </section>

      <ConfirmDialog open={confirmActivate} title={t('onboarding.review.confirmTitle')} confirmLabel={t('onboarding.review.confirmLabel')} busy={activating} onConfirm={activate} onCancel={() => setConfirmActivate(false)}>
        <ul className="list-disc space-y-1 pl-5">
          <li>{t('onboarding.review.confirmSkipped', { list: skipped.length ? skipped.map((s) => s.title).join(', ') : t('onboarding.review.confirmSkippedNone') })}</li>
          <li>{t('onboarding.review.confirmIntegrations', { list: pendingIntegrations.length ? pendingIntegrations.map((i) => kindLabel(i.kind)).join(', ') : t('onboarding.review.confirmIntegrationsNone') })}</li>
          <li>{a.level === 3 ? t('onboarding.review.confirmLevel3', { level: a.level }) : t('onboarding.review.confirmLevelApproval', { level: a.level })}</li>
        </ul>
        <p className="mt-2">{t('onboarding.review.confirmFooter')}</p>
      </ConfirmDialog>

      <ConfirmDialog open={confirmCleanup} title={t('onboarding.review.cleanupTitle')} tone="danger" confirmLabel={t('onboarding.review.cleanupConfirm')} onConfirm={cleanup} onCancel={() => setConfirmCleanup(false)}>
        {t('onboarding.review.cleanupBody')}
      </ConfirmDialog>
    </div>
  )
}
