import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { snapshotFixture } from '../../test/fixtures'
import { setUserLanguage } from '../../i18n'

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ signOut: vi.fn(), profile: { id: 'u1', role: 'empresa', empresa_id: 'e1', email: 'ralm@example.com' } }),
}))
const api = vi.hoisted(() => ({
  getOnboarding: vi.fn(),
  saveStep: vi.fn(),
  completeStep: vi.fn(),
  skipStep: vi.fn(),
  reopenStep: vi.fn(),
  getBlockers: vi.fn().mockResolvedValue([]),
  updateIntegrationSettings: vi.fn(),
}))
vi.mock('../../lib/onboarding/api', () => api)

import OnboardingPage from './OnboardingPage'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/onboarding/:step?" element={<OnboardingPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('asistente de configuración en inglés', () => {
  beforeEach(() => {
    api.getOnboarding.mockResolvedValue(snapshotFixture())
  })

  it('cabecera, stepper y paso de correo en inglés con setUserLanguage("en")', async () => {
    setUserLanguage('en')
    renderAt('/onboarding/email')
    expect(await screen.findByRole('heading', { level: 1, name: 'Email' })).toBeInTheDocument()
    expect(screen.getByText('Initial setup · RALM, S.L.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Save and return to dashboard/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Setup steps' })).toBeInTheDocument()
    expect(screen.getAllByText('Step 3 of 10').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Completed').length).toBeGreaterThan(0)
    expect(screen.getByText('How do you want Feblio to receive and send email?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /skip for now/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save and continue/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /previous/i })).toBeInTheDocument()
    // Sin restos en español
    expect(screen.queryByText(/Configuración inicial/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Guardar y continuar/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Pasos de la configuración/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Correo electrónico/)).not.toBeInTheDocument()
  })

  it('el selector ES | EN de la cabecera cambia la interfaz sin recargar y hay uno visible por tamaño de pantalla', async () => {
    const user = userEvent.setup()
    renderAt('/onboarding/email')
    expect(await screen.findByRole('heading', { level: 1, name: /correo electrónico/i })).toBeInTheDocument()
    // Cabecera (escritorio) + fila móvil: dos grupos, cada uno con botones Español / English
    expect(screen.getAllByRole('group', { name: 'Idioma de la interfaz' })).toHaveLength(2)
    await user.click(screen.getAllByRole('button', { name: 'English' })[0])
    expect(await screen.findByRole('heading', { level: 1, name: 'Email' })).toBeInTheDocument()
    expect(screen.getAllByRole('group', { name: 'Interface language' })).toHaveLength(2)
    // El selector rápido nunca escribe en la empresa
    expect(api.saveStep).not.toHaveBeenCalled()
  })

  it('la pantalla de carga se traduce', async () => {
    setUserLanguage('en')
    api.getOnboarding.mockReturnValue(new Promise(() => undefined))
    renderAt('/onboarding/email')
    expect(await screen.findByText('Loading your configuration…')).toBeInTheDocument()
  })
})
