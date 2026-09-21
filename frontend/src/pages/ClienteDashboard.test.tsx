import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setUserLanguage } from '../i18n'
import type { DocumentRow, Project } from '../lib/types'

const auth = vi.hoisted(() => ({
  profile: { id: 'u3', email: 'cliente@example.com', full_name: 'Carlos Cliente', role: 'cliente', empresa_id: 'e1', cliente_id: 'c1' },
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

import ClienteDashboard from './ClienteDashboard'

const project: Project = {
  id: 'p1', empresa_id: 'e1', cliente_id: 'c1', name: 'Reforma cocina', status: 'en_progreso', budget_total: 12000, invoiced: 4000, provision_funds: 0, pending_payments: 8000, progress: 40, created_at: '',
}
const documents: DocumentRow[] = [
  { id: 'd1', empresa_id: 'e1', project_id: 'p1', type: 'presupuesto', name: 'Presupuesto P-001.pdf', amount: 12000, status: null, storage_path: null, created_at: '' },
  { id: 'd2', empresa_id: 'e1', project_id: 'p1', type: 'factura', name: 'Factura F-001.pdf', amount: 4000, status: 'pagada', storage_path: null, created_at: '' },
]

describe('<ClienteDashboard />', () => {
  beforeEach(() => {
    db.tables = { projects: [project], documents }
  })

  it('en español: cabecera del proyecto, métricas, documentos y facturas', async () => {
    render(<ClienteDashboard />)
    expect(await screen.findByText('Tu proyecto')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Mi proyecto' })).toBeInTheDocument()
    expect(screen.getByText('Progreso del proyecto')).toBeInTheDocument()
    expect(screen.getByText('Presupuesto total')).toBeInTheDocument()
    expect(screen.getByText('Pagos pendientes')).toBeInTheDocument()
    expect(screen.getByText('Documentos del proyecto')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Facturas' })).toBeInTheDocument()
    expect(screen.getByText('En progreso')).toBeInTheDocument()
    expect(screen.getByText('Presupuesto')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Ver' })).toHaveLength(2)
    expect(screen.getByText('pagada')).toBeInTheDocument()
  })

  it('in English: labels are translated; project, document names and statuses from data are not', async () => {
    setUserLanguage('en')
    render(<ClienteDashboard />)
    expect(await screen.findByText('Your project')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'My project' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^documents$/i })).toBeInTheDocument()
    expect(screen.getByText('Project progress')).toBeInTheDocument()
    expect(screen.getByText('Total budget')).toBeInTheDocument()
    expect(screen.getByText('Invoiced')).toBeInTheDocument()
    expect(screen.getByText('Pending payments')).toBeInTheDocument()
    expect(screen.getByText('Project documents')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Invoices' })).toBeInTheDocument()
    expect(screen.getByText('In progress')).toBeInTheDocument()
    expect(screen.getByText('Quote')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'View' })).toHaveLength(2)
    expect(screen.getByText('Reforma cocina')).toBeInTheDocument()
    expect(screen.getAllByText('Factura F-001.pdf')).toHaveLength(2)
    expect(screen.getByText('pagada')).toBeInTheDocument()
    expect(screen.queryByText('Tu proyecto')).not.toBeInTheDocument()
    expect(screen.queryByText('Progreso del proyecto')).not.toBeInTheDocument()
    expect(screen.queryByText('Pagos pendientes')).not.toBeInTheDocument()
    expect(document.documentElement.lang).toBe('en')
  })

  it('shows the English empty state when no project is assigned', async () => {
    setUserLanguage('en')
    db.tables = { projects: [], documents: [] }
    render(<ClienteDashboard />)
    expect(await screen.findByText('There is no project assigned to your account yet.')).toBeInTheDocument()
  })

  it('the language switcher changes the dashboard language without reloading', async () => {
    const user = userEvent.setup()
    render(<ClienteDashboard />)
    await screen.findByText('Tu proyecto')
    await user.click(screen.getByRole('button', { name: 'English' }))
    expect(await screen.findByText('Your project')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'My project' })).toBeInTheDocument()
  })
})
