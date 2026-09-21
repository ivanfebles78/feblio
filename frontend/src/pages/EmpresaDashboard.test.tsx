import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { setUserLanguage } from '../i18n'

/**
 * Shell del dashboard de empresa (AppShell + NotificationsBell) en inglés y en español:
 * navegación, migas, campana y selector de idioma. El contenido de las secciones se simula.
 */
const auth = vi.hoisted(() => ({
  profile: { id: 'u1', email: 'ana@example.com', full_name: 'Ana García', role: 'empresa', empresa_id: 'e1', cliente_id: null },
  signOut: vi.fn(),
}))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ profile: auth.profile, signOut: auth.signOut, session: { user: { id: 'u1' } }, loading: false, profileLoading: false }) }))

const db = vi.hoisted(() => ({
  empresa: { name: 'Reformas del Sur SL', trade_name: null, onboarding_status: 'completed', subscription_status: 'trial', trial_ends_at: new Date(Date.now() + 5 * 86_400_000).toISOString() },
}))
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ single: () => Promise.resolve({ data: db.empresa, error: null }) }),
      }),
    }),
  },
}))

const notifications = vi.hoisted(() => ({ items: [] as unknown[], unread: 2, loading: false, error: null, reload: vi.fn(), markOne: vi.fn(), markAll: vi.fn() }))
vi.mock('../lib/solicitudes/useNotifications', () => ({ useNotifications: () => notifications }))
vi.mock('../sections/EmpresaHome', () => ({ EmpresaHome: () => <div>HOME_SECTION</div> }))
vi.mock('../sections/PlantillasSection', () => ({ PlantillasSection: () => <div>TEMPLATES_SECTION</div> }))
vi.mock('../sections/settings/SettingsSection', () => ({ default: () => <div>SETTINGS_SECTION</div> }))
vi.mock('./solicitudes/SolicitudesInbox', () => ({ default: () => <div>INBOX_SECTION</div> }))
vi.mock('./solicitudes/NuevaSolicitud', () => ({ default: () => <div>NEW_SECTION</div> }))
vi.mock('./solicitudes/SolicitudDetalle', () => ({ default: () => <div>DETAIL_SECTION</div> }))

import EmpresaDashboard from './EmpresaDashboard'

function setup(initial = '/empresa') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/empresa/*" element={<EmpresaDashboard />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('<EmpresaDashboard /> · idioma de la interfaz', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('en inglés: navegación Home / Requests / Templates / Settings, migas, campana y selector de idioma', async () => {
    setUserLanguage('en')
    setup()
    expect(await screen.findByText('HOME_SECTION')).toBeInTheDocument()

    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(within(nav).getByRole('button', { name: /^Home$/ })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('button', { name: /Requests/ })).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: /^Templates$/ })).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: /^Settings$/ })).toBeInTheDocument()
    // Contador de pendientes en el elemento «Requests»
    expect(within(nav).getByLabelText('2 pending')).toHaveTextContent('2')

    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(crumbs).getByText('Reformas del Sur SL')).toBeInTheDocument()
    expect(within(crumbs).getByText('Home')).toHaveAttribute('aria-current', 'page')

    expect(screen.getByRole('button', { name: 'Notifications: 2 unread' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Interface language' })).toBeInTheDocument()
    expect(screen.getByText('Trial · 5 days left')).toBeInTheDocument()

    expect(screen.queryByText('Inicio')).not.toBeInTheDocument()
    expect(screen.queryByText('Solicitudes')).not.toBeInTheDocument()
    expect(screen.queryByText('Configuración')).not.toBeInTheDocument()
  })

  it('en inglés: el menú de usuario ofrece Settings y Sign out', async () => {
    setUserLanguage('en')
    setup()
    await screen.findByText('HOME_SECTION')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Ana García/ }))
    const menu = screen.getByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: 'Settings' })).toBeInTheDocument()
    await user.click(within(menu).getByRole('menuitem', { name: 'Sign out' }))
    expect(auth.signOut).toHaveBeenCalledTimes(1)
  })

  it('en inglés: el aviso de bienvenida (?welcome=1) se muestra traducido y se puede cerrar', async () => {
    setUserLanguage('en')
    setup('/empresa?welcome=1')
    await screen.findByText('HOME_SECTION')
    expect(screen.getByRole('status')).toHaveTextContent('Feblio is live! Your setup is complete.')
    expect(screen.getByRole('button', { name: 'Dismiss notice' })).toBeInTheDocument()
  })

  it('en español (por defecto): Inicio / Solicitudes / Plantillas / Configuración y campana en español', async () => {
    setup()
    expect(await screen.findByText('HOME_SECTION')).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Navegación principal' })
    expect(within(nav).getByRole('button', { name: /^Inicio$/ })).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: /Solicitudes/ })).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: /^Plantillas$/ })).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: /^Configuración$/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Notificaciones: 2 sin leer' })).toBeInTheDocument()
    expect(screen.getByText('Prueba · 5 días restantes')).toBeInTheDocument()
  })

  it('cambiar de idioma desde el selector traduce la navegación sin recargar', async () => {
    setup()
    await screen.findByText('HOME_SECTION')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'English' }))
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Templates$/ })).toBeInTheDocument()
    expect(screen.queryByText('Plantillas')).not.toBeInTheDocument()
  })
})
