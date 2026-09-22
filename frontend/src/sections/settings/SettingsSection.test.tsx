import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { setUserLanguage } from '../../i18n'

/**
 * Configuración de empresa en inglés y español: nombres de pestañas (códigos estables),
 * panel de reapertura del asistente y diálogo de confirmación. Los pasos del wizard se simulan.
 */
const ctx = vi.hoisted(() => ({
  loading: false,
  error: null as string | null,
  snapshot: { integrations: [] } as unknown,
  saveState: 'idle',
  saveError: null,
  lastSavedAt: null,
  dirty: false,
  retry: vi.fn(),
  flush: vi.fn().mockResolvedValue(undefined),
  reload: vi.fn(),
}))
vi.mock('../../lib/onboarding/OnboardingContext', () => ({
  OnboardingProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useOnboarding: () => ctx,
}))
vi.mock('../../components/onboarding/AutoSaveStatus', () => ({ AutoSaveStatus: () => <span>AUTOSAVE</span> }))
vi.mock('./IntegrationsSettings', () => ({ IntegrationsSettings: () => <div>INTEGRATIONS_PANEL</div> }))
vi.mock('../../lib/onboarding/api', () => ({ reopenOnboarding: vi.fn().mockResolvedValue({ ok: true }) }))
vi.mock('../../pages/onboarding/registry', () => {
  const entry = (name: string) => ({ Component: () => <div>STEP_{name}</div>, validate: () => ({}) })
  return { STEP_REGISTRY: { company: entry('company'), billing: entry('billing'), automation: entry('automation'), forms: entry('forms') } }
})

import SettingsSection from './SettingsSection'

function setup(initialTab?: 'empresa' | 'integrations' | 'billing' | 'automation' | 'forms' | 'reopen') {
  return render(
    <MemoryRouter>
      <SettingsSection initialTab={initialTab} />
    </MemoryRouter>,
  )
}

describe('<SettingsSection /> · idioma de la interfaz', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ctx.loading = false
    ctx.error = null
  })

  it('en inglés: las pestañas se muestran traducidas y los códigos de pestaña no cambian', () => {
    setUserLanguage('en')
    setup()
    const tablist = screen.getByRole('tablist', { name: 'Settings sections' })
    const tabs = within(tablist).getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Company details', 'Channels and integrations', 'Billing and payments', 'Automations', 'Forms', 'Services', 'Reopen initial setup'])
    expect(tabs.map((tab) => tab.id)).toEqual(['settings-tab-empresa', 'settings-tab-integrations', 'settings-tab-billing', 'settings-tab-automation', 'settings-tab-forms', 'settings-tab-services', 'settings-tab-reopen'])
    expect(screen.getByRole('tab', { name: 'Company details' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { name: 'Company details' })).toBeInTheDocument()
    expect(screen.getByText('STEP_company')).toBeInTheDocument()
    expect(screen.queryByText('Datos de empresa')).not.toBeInTheDocument()
    expect(screen.queryByText('Configuración')).not.toBeInTheDocument()
  })

  it('en inglés: reabrir el asistente muestra texto y confirmación traducidos', async () => {
    setUserLanguage('en')
    setup('reopen')
    const user = userEvent.setup()
    expect(screen.getByRole('heading', { name: 'Reopen initial setup' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reopen assistant' }))
    const dialog = screen.getByRole('dialog', { name: 'Reopen the initial setup?' })
    expect(within(dialog).getByRole('button', { name: 'Reopen' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('en inglés: la pantalla de carga de configuración está traducida', () => {
    setUserLanguage('en')
    ctx.loading = true
    setup()
    expect(screen.getByText('Loading settings…')).toBeInTheDocument()
  })

  it('en español (por defecto): pestañas en español y cambio de pestaña a Canales e integraciones', async () => {
    setup()
    const user = userEvent.setup()
    const tablist = screen.getByRole('tablist', { name: 'Secciones de configuración' })
    expect(within(tablist).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Datos de empresa', 'Canales e integraciones', 'Facturación y pagos', 'Automatizaciones', 'Formularios', 'Servicios', 'Reabrir configuración inicial'])
    await user.click(screen.getByRole('tab', { name: 'Canales e integraciones' }))
    expect(screen.getByRole('heading', { name: 'Canales e integraciones' })).toBeInTheDocument()
    expect(screen.getByText('INTEGRATIONS_PANEL')).toBeInTheDocument()
  })
})
