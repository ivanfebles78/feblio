import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { setUserLanguage } from '../i18n'
import type { Project, Task } from '../lib/types'

/**
 * Inicio de empresa en inglés y español: métricas, estados vacíos, pendientes, proyectos y formulario
 * de proyecto. Supabase se simula con un encadenado mínimo (select/order/eq → { data }).
 */
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'u1', email: 'ana@example.com', full_name: 'Ana García', role: 'empresa', empresa_id: 'e1', cliente_id: null } }),
}))
vi.mock('../components/onboarding/SetupProgressCard', () => ({
  SetupProgressCard: () => <div>SETUP_CARD</div>,
  useSetupProgress: () => ({ progress: null, error: null }),
}))
vi.mock('../lib/onboarding/api', () => ({ cleanupTestData: vi.fn() }))
vi.mock('../lib/solicitudes/status', () => ({ PENDING_FOR_EMPRESA: ['submitted'] }))

const db = vi.hoisted(() => ({
  tables: {} as Record<string, unknown[]>,
}))
vi.mock('../lib/supabase', () => {
  function chain(table: string) {
    const c = {
      select: () => c,
      order: () => c,
      eq: () => c,
      update: () => c,
      delete: () => c,
      insert: () => c,
      single: () => Promise.resolve({ data: null, error: null }),
      then: (res: (v: { data: unknown[]; error: null }) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve({ data: db.tables[table] ?? [], error: null }).then(res, rej),
    }
    return c
  }
  return { supabase: { from: (table: string) => chain(table) } }
})

import { EmpresaHome } from './EmpresaHome'

const project = (p: Partial<Project>): Project => ({
  id: 'p1',
  empresa_id: 'e1',
  cliente_id: null,
  name: 'Reforma cocina',
  status: 'en_progreso',
  budget_total: 1000,
  invoiced: 250,
  provision_funds: 0,
  pending_payments: 750,
  progress: 40,
  created_at: new Date().toISOString(),
  ...p,
})
const task = (t: Partial<Task>): Task => ({
  id: 't1',
  empresa_id: 'e1',
  type: 'manual',
  title: 'Llamar al cliente',
  detail: null,
  priority: 1,
  status: 'pendiente',
  related_id: null,
  created_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
  resolved_at: null,
  ...t,
})

function setup(status: 'completed' | 'in_progress' = 'completed') {
  return render(
    <MemoryRouter>
      <EmpresaHome empresaId="e1" empresa={{ name: 'Reformas del Sur SL', trade_name: null, onboarding_status: status, subscription_status: 'trial', trial_ends_at: null }} />
    </MemoryRouter>,
  )
}

describe('<EmpresaHome /> · idioma de la interfaz', () => {
  beforeEach(() => {
    db.tables = {}
  })

  it('en inglés, sin datos: saludo, métricas y estados vacíos traducidos; sin textos españoles', async () => {
    setUserLanguage('en')
    setup('in_progress')
    expect(await screen.findByRole('heading', { name: 'Hello, Ana' })).toBeInTheDocument()
    expect(screen.getByText('Your company is ready. Start by creating your first project or complete the setup.')).toBeInTheDocument()
    expect(screen.getByText('Setup pending')).toBeInTheDocument()
    expect(screen.getByText('Trial period')).toBeInTheDocument()

    for (const label of ['Requests', 'Projects', 'Clients', 'Invoiced', 'Pending']) expect(screen.getByText(label)).toBeInTheDocument()
    expect(screen.getByText('None open')).toBeInTheDocument()
    expect(screen.getAllByText('None yet')).toHaveLength(2)
    expect(screen.getByText('Nothing invoiced yet')).toBeInTheDocument()
    expect(screen.getAllByText('All caught up').length).toBeGreaterThanOrEqual(1)

    expect(screen.getByText('Things to do')).toBeInTheDocument()
    expect(screen.getByText('0 to resolve')).toBeInTheDocument()
    expect(screen.getByText('Your projects')).toBeInTheDocument()
    expect(screen.getByText("You don't have any projects yet")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create project' })).toBeInTheDocument()

    expect(screen.queryByText(/Hola/)).not.toBeInTheDocument()
    expect(screen.queryByText('Proyectos')).not.toBeInTheDocument()
    expect(screen.queryByText('Cosas pendientes')).not.toBeInTheDocument()
    expect(screen.queryByText(/Todo al día/)).not.toBeInTheDocument()
  })

  it('en inglés, con datos: estado del proyecto, resumen, prioridad y fecha relativa traducidos; importe en EUR', async () => {
    setUserLanguage('en')
    db.tables = { projects: [project({})], tasks: [task({})], documents: [] }
    setup()
    expect(await screen.findByText('Reforma cocina')).toBeInTheDocument()
    expect(screen.getByText('In progress')).toBeInTheDocument()
    expect(screen.getByText('0 documents · 40% complete')).toBeInTheDocument()
    expect(screen.getByText('1 in progress')).toBeInTheDocument()
    expect(screen.getByText('Llamar al cliente')).toBeInTheDocument() // texto del usuario/servidor: sin traducir
    expect(screen.getByText('High priority')).toBeInTheDocument()
    expect(screen.getByText('3 days ago')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Resolve' })).toBeInTheDocument()
    expect(screen.getByText('Setup complete')).toBeInTheDocument()
    // Facturado: 250 € con formato en-GB (la moneda no cambia con el idioma)
    expect(screen.getByText('€250.00')).toBeInTheDocument()
  })

  it('en inglés: el formulario de nuevo proyecto está traducido y ofrece los estados en inglés', async () => {
    setUserLanguage('en')
    setup()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'New project' }))
    expect(screen.getByText('Project name')).toBeInTheDocument()
    expect(screen.getByLabelText('Status')).toBeInTheDocument()
    const options = within(screen.getByLabelText('Status')).getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['Draft', 'In progress', 'Completed', 'Cancelled'])
    expect(screen.getByLabelText('Total budget (€)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Save project/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('en español (por defecto): saludo, métricas y estados vacíos en español', async () => {
    setup('in_progress')
    expect(await screen.findByRole('heading', { name: 'Hola, Ana' })).toBeInTheDocument()
    expect(screen.getByText('Configuración pendiente')).toBeInTheDocument()
    for (const label of ['Solicitudes', 'Proyectos', 'Clientes', 'Facturado', 'Pendientes']) expect(screen.getByText(label)).toBeInTheDocument()
    expect(screen.getByText('Cosas pendientes')).toBeInTheDocument()
    expect(screen.getByText('Aún no tienes proyectos')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Crear proyecto' })).toBeInTheDocument()
  })
})
