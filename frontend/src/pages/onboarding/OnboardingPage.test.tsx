import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { snapshotFixture } from '../../test/fixtures'

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

function Location() {
  const l = useLocation()
  return <div data-testid="path">{l.pathname}</div>
}

describe('reanudación del wizard', () => {
  beforeEach(() => {
    api.getOnboarding.mockResolvedValue(snapshotFixture())
  })

  it('/onboarding redirige al último paso guardado (onboarding_current_step) tras refrescar', async () => {
    render(
      <MemoryRouter initialEntries={['/onboarding']}>
        <Location />
        <Routes>
          <Route path="/onboarding/:step?" element={<OnboardingPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { level: 1, name: /correo electrónico/i })).toBeInTheDocument()
    expect(screen.getByTestId('path')).toHaveTextContent('/onboarding/email')
    // Stepper: pasos completados y actuales anunciados con texto
    expect(screen.getByRole('navigation', { name: /pasos de la configuración/i })).toBeInTheDocument()
    expect(screen.getAllByText(/Completado/).length).toBeGreaterThan(0)
  })

  it('un paso desconocido cae en el primer paso abierto', async () => {
    api.getOnboarding.mockResolvedValue(snapshotFixture({ empresa: { ...snapshotFixture().empresa, onboarding_current_step: null } }))
    render(
      <MemoryRouter initialEntries={['/onboarding/inexistente']}>
        <Location />
        <Routes>
          <Route path="/onboarding/:step?" element={<OnboardingPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { level: 1, name: /correo electrónico/i })).toBeInTheDocument()
    expect(screen.getByTestId('path')).toHaveTextContent('/onboarding/email')
  })
})
