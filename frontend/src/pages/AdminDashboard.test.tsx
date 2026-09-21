import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setUserLanguage } from '../i18n'
import type { Empresa, Profile, Project } from '../lib/types'

const auth = vi.hoisted(() => ({
  profile: { id: 'u1', email: 'admin@feblio.test', full_name: 'Ana Admin', role: 'admin', empresa_id: null, cliente_id: null },
  signOut: vi.fn(),
}))
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }))

const db = vi.hoisted(() => ({ tables: {} as Record<string, unknown[]> }))
vi.mock('../lib/supabase', () => {
  const result = (table: string) => {
    const payload = { data: db.tables[table] ?? [], error: null }
    const p = Promise.resolve(payload)
    return Object.assign(p, { order: () => Promise.resolve(payload) })
  }
  return { supabase: { from: (table: string) => ({ select: () => result(table) }) } }
})

import AdminDashboard from './AdminDashboard'

const empresa: Empresa = {
  id: 'e1', name: 'Reformas Norte', cif: null, tax_type: null, logo_url: null, address: null, phone: null, email: null, website: null, iban: null, disclosures: null, intake_config: null, created_at: '',
}
const profiles: Profile[] = [
  { id: 'u1', email: 'admin@feblio.test', full_name: 'Ana Admin', role: 'admin', empresa_id: null, cliente_id: null },
  { id: 'u2', email: 'laura@norte.es', full_name: 'Laura Norte', role: 'empresa', empresa_id: 'e1', cliente_id: null },
]
const project: Project = {
  id: 'p1', empresa_id: 'e1', cliente_id: null, name: 'Reforma cocina', status: 'en_progreso', budget_total: 12000, invoiced: 4000, provision_funds: 0, pending_payments: 0, progress: 40, created_at: '',
}

describe('<AdminDashboard />', () => {
  beforeEach(() => {
    db.tables = { empresas: [empresa], profiles, projects: [project] }
  })

  it('en español: títulos, columnas, estados y roles', async () => {
    render(<AdminDashboard />)
    expect(await screen.findByText('Empresas (tenants)')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByText('Usuarios de la plataforma')).toBeInTheDocument()
    expect(screen.getByText('Todos los proyectos')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Presupuesto' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Progreso' })).toBeInTheDocument()
    expect(screen.getByText('En progreso')).toBeInTheDocument()
    expect(screen.getAllByText('Administrador').length).toBeGreaterThan(0)
    expect(screen.getByText('Sin CIF')).toBeInTheDocument()
    expect(screen.getByText('1 proyecto')).toBeInTheDocument()
    expect(screen.getByText('Facturado (global)')).toBeInTheDocument()
    expect(screen.getByText('Reforma cocina')).toBeInTheDocument()
  })

  it('in English: titles, columns, statuses and roles are translated; data is not', async () => {
    setUserLanguage('en')
    render(<AdminDashboard />)
    expect(await screen.findByText('Companies (tenants)')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /companies/i })).toBeInTheDocument()
    expect(screen.getByText('Platform users')).toBeInTheDocument()
    expect(screen.getByText('All projects')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Project' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Status' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Budget' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Invoiced' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Progress' })).toBeInTheDocument()
    expect(screen.getByText('In progress')).toBeInTheDocument()
    expect(screen.getAllByText('Administrator').length).toBeGreaterThan(0)
    expect(screen.getByText('No tax ID')).toBeInTheDocument()
    expect(screen.getByText('1 project')).toBeInTheDocument()
    expect(screen.getByText('Invoiced (global)')).toBeInTheDocument()
    expect(screen.getByText('Reforma cocina')).toBeInTheDocument()
    expect(screen.getByText('Reformas Norte')).toBeInTheDocument()
    expect(screen.queryByText('Todos los proyectos')).not.toBeInTheDocument()
    expect(screen.queryByText('Usuarios de la plataforma')).not.toBeInTheDocument()
    expect(screen.queryByText('En progreso')).not.toBeInTheDocument()
    expect(document.documentElement.lang).toBe('en')
  })

  it('shows English loading state and empty states', async () => {
    setUserLanguage('en')
    db.tables = { empresas: [], profiles: [], projects: [] }
    render(<AdminDashboard />)
    expect(await screen.findByText('No companies registered.')).toBeInTheDocument()
    expect(screen.getByText('No projects.')).toBeInTheDocument()
  })

  it('the language switcher (in the shared layout header) changes the panel language and keeps the active section', async () => {
    const user = userEvent.setup()
    render(<AdminDashboard />)
    await screen.findByText('Empresas (tenants)')
    await user.click(screen.getByRole('button', { name: 'Proyectos' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Proyectos' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'English' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Projects' })).toBeInTheDocument()
    expect(screen.getByText('Companies (tenants)')).toBeInTheDocument()
  })
})
