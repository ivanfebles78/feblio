import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { setUserLanguage } from '../../i18n'
import { computeSetupProgress } from '../../lib/onboarding/areas'

vi.mock('../../lib/onboarding/api', () => ({ getStepStatuses: vi.fn() }))

import { SetupProgressCard } from './SetupProgressCard'

const progress = computeSetupProgress({ company: 'completed', repository: 'completed', forms: 'skipped', email: 'in_progress' })

function renderCard() {
  return render(
    <MemoryRouter>
      <SetupProgressCard empresaId="e1" progress={progress} />
    </MemoryRouter>,
  )
}

describe('SetupProgressCard', () => {
  it('en español por defecto', () => {
    renderCard()
    expect(screen.getByRole('heading', { name: 'Configura Feblio a tu ritmo' })).toBeInTheDocument()
    expect(screen.getByText('2 de 6 áreas completadas · unos 19 min restantes.')).toBeInTheDocument()
    expect(screen.getByText('Canales de comunicación', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continuar con canales de comunicación' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continuar después' })).toBeInTheDocument()
  })

  it('en inglés con setUserLanguage("en"), incluidas las áreas y sin textos españoles', () => {
    setUserLanguage('en')
    renderCard()
    expect(screen.getByRole('heading', { name: 'Set up Feblio at your own pace' })).toBeInTheDocument()
    expect(screen.getByText('2 of 6 areas completed · about 19 min remaining.')).toBeInTheDocument()
    expect(screen.getByText('Next recommended action:')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue with communication channels' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue later' })).toBeInTheDocument()
    expect(screen.getByText('Company profile')).toBeInTheDocument()
    expect(screen.getByText('Billing and activation')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Setup completed: 33%' })).toBeInTheDocument()
    expect(screen.queryByText(/Configura Feblio/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Perfil de empresa/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Continuar después/)).not.toBeInTheDocument()
  })
})
