import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { snapshotFixture, stepRow } from '../../../test/fixtures'
import type { OnboardingStepRow } from '../../../lib/onboarding/types'
import { currentLanguage, setUserLanguage } from '../../../i18n'
import { clampCompanyLanguage, companyDraftFromSnapshot, draftToEmpresaPatch } from './companyDraft'

const api = vi.hoisted(() => ({
  getOnboarding: vi.fn(),
  saveStep: vi.fn(),
  completeStep: vi.fn(),
  skipStep: vi.fn(),
  reopenStep: vi.fn(),
  updateEmpresa: vi.fn().mockResolvedValue(undefined),
  updateProfile: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../../lib/onboarding/api', () => api)
vi.mock('../../../lib/supabase', () => ({ supabase: { auth: { updateUser: vi.fn() } } }))

import { OnboardingProvider } from '../../../lib/onboarding/OnboardingContext'
import { CompanyAndOwnerStep } from './CompanyAndOwnerStep'

function snapshotWithLanguage(language: string | null) {
  const base = snapshotFixture()
  return snapshotFixture({ empresa: { ...base.empresa, language: language as never, onboarding_current_step: 'company' }, steps: base.steps.map((s) => (s.step_key === 'company' ? { ...s, status: 'in_progress' as const } : s)) })
}

function renderStep() {
  return render(
    <OnboardingProvider>
      <CompanyAndOwnerStep mode="settings" errors={{}} showErrors={false} />
    </OnboardingProvider>,
  )
}

const LABEL_ES = 'Idioma predeterminado de la empresa'
const HINT_ES = 'Se utilizará como idioma inicial para los miembros de la empresa y para las comunicaciones dirigidas a clientes.'
const LABEL_EN = 'Default company language'
const HINT_EN = 'This will be used as the initial language for company members and client communications.'

describe('clampCompanyLanguage / companyDraft', () => {
  it('solo admite es/en: cualquier otro valor cae a es', () => {
    expect(clampCompanyLanguage('en')).toBe('en')
    expect(clampCompanyLanguage('en-US')).toBe('en')
    expect(clampCompanyLanguage('pt')).toBe('es')
    expect(clampCompanyLanguage(null)).toBe('es')
    expect(clampCompanyLanguage('')).toBe('es')
    const draft = companyDraftFromSnapshot(snapshotWithLanguage('ca'))
    expect(draft.language).toBe('es')
    expect(draftToEmpresaPatch({ ...draft, language: 'fr' }).language).toBe('es')
    expect(draftToEmpresaPatch({ ...draft, language: 'en' }).language).toBe('en')
  })
})

describe('campo «Idioma predeterminado de la empresa»', () => {
  beforeEach(() => {
    api.updateEmpresa.mockClear()
    api.getOnboarding.mockResolvedValue(snapshotWithLanguage('es'))
    api.saveStep.mockImplementation(async (key: string, data: Record<string, unknown>) => stepRow(key as OnboardingStepRow['step_key'], data, 'in_progress'))
  })

  it('muestra etiqueta y ayuda en español por defecto, con solo las opciones Español / English', async () => {
    renderStep()
    const select = (await screen.findByLabelText(LABEL_ES)) as HTMLSelectElement
    expect(screen.getByText(HINT_ES)).toBeInTheDocument()
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['es', 'en'])
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(['Español', 'English'])
    expect(screen.queryByLabelText(/^Idioma$/)).not.toBeInTheDocument()
  })

  it('muestra etiqueta y ayuda en inglés con setUserLanguage("en")', async () => {
    setUserLanguage('en')
    renderStep()
    expect(await screen.findByLabelText(LABEL_EN)).toBeInTheDocument()
    expect(screen.getByText(HINT_EN)).toBeInTheDocument()
    expect(screen.queryByText(LABEL_ES)).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /company details/i })).toBeInTheDocument()
  })

  it('al guardar envía language: "en" a empresas y la interfaz adopta el idioma corporativo', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    try {
      renderStep()
      const select = await screen.findByLabelText(LABEL_ES)
      await user.selectOptions(select, 'en')
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1200)
      })
      await waitFor(() => expect(api.updateEmpresa).toHaveBeenCalled())
      const patch = api.updateEmpresa.mock.calls[api.updateEmpresa.mock.calls.length - 1][1] as { language: string }
      expect(patch.language).toBe('en')
      for (const call of api.updateEmpresa.mock.calls) expect(['es', 'en']).toContain((call[1] as { language: string }).language)
      await waitFor(() => expect(currentLanguage()).toBe('en'))
      expect(await screen.findByLabelText(LABEL_EN)).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('un valor no válido guardado en la empresa se persiste como "es"', async () => {
    api.getOnboarding.mockResolvedValue(snapshotWithLanguage('pt'))
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    try {
      renderStep()
      const tradeName = await screen.findByLabelText('Nombre comercial')
      await user.type(tradeName, 'X')
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1200)
      })
      await waitFor(() => expect(api.updateEmpresa).toHaveBeenCalled())
      const patch = api.updateEmpresa.mock.calls[api.updateEmpresa.mock.calls.length - 1][1] as { language: string }
      expect(patch.language).toBe('es')
    } finally {
      vi.useRealTimers()
    }
  })
})
