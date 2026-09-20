import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { SolicitudResumen } from '../../lib/solicitudes/types'

const api = vi.hoisted(() => ({ listSolicitudes: vi.fn() }))
vi.mock('../../lib/solicitudes/api', () => api)

import SolicitudesInbox, { filterInbox } from './SolicitudesInbox'

function row(p: Partial<SolicitudResumen>): SolicitudResumen {
  return {
    id: 'id',
    empresa_id: 'e1',
    cliente_id: null,
    contact_name: 'Contacto',
    contact_email: null,
    contact_phone: null,
    source_channel: 'llamada',
    title: 'Asunto',
    service_type: null,
    description: null,
    deadline: null,
    status: 'submitted',
    closed_reason: null,
    form_template_id: null,
    form_data: {},
    form_submitted_at: null,
    completeness: 50,
    last_activity_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_test: false,
    unread_count: 0,
    cliente_name: null,
    ...p,
  }
}

const ROWS = [
  row({ id: 'a', title: 'Reforma cocina', contact_name: 'Ana López', status: 'submitted', unread_count: 2, completeness: 88 }),
  row({ id: 'b', title: 'Asesoría fiscal', cliente_name: 'Norte SL', contact_name: 'Luis', status: 'awaiting_client', source_channel: 'email', completeness: 0 }),
  row({ id: 'c', title: 'Cerrada antigua', contact_name: 'Marta', status: 'closed', source_channel: 'whatsapp' }),
]

function setup(initial = '/empresa/solicitudes') {
  render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/empresa/solicitudes" element={<SolicitudesInbox />} />
        <Route path="/empresa/solicitudes/:id" element={<p>detalle</p>} />
      </Routes>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

describe('filterInbox', () => {
  it('filtra por texto (cliente, contacto, asunto), estado, canal y pendientes', () => {
    expect(filterInbox(ROWS, { q: 'norte', status: '', channel: '', pending: false }).map((r) => r.id)).toEqual(['b'])
    expect(filterInbox(ROWS, { q: 'ANA', status: '', channel: '', pending: false }).map((r) => r.id)).toEqual(['a'])
    expect(filterInbox(ROWS, { q: '', status: 'closed', channel: '', pending: false }).map((r) => r.id)).toEqual(['c'])
    expect(filterInbox(ROWS, { q: '', status: '', channel: 'email', pending: false }).map((r) => r.id)).toEqual(['b'])
    expect(filterInbox(ROWS, { q: '', status: '', channel: '', pending: true }).map((r) => r.id)).toEqual(['a'])
  })
})

describe('<SolicitudesInbox />', () => {
  beforeEach(() => vi.clearAllMocks())

  it('muestra un estado vacío real cuando no hay solicitudes', async () => {
    api.listSolicitudes.mockResolvedValue([])
    setup()
    expect(await screen.findByText(/todavía no hay solicitudes/i)).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /nueva solicitud/i }).length).toBeGreaterThan(0)
  })

  it('lista las solicitudes con cliente, completitud, estado y no leídos', async () => {
    api.listSolicitudes.mockResolvedValue(ROWS)
    setup()
    const table = await screen.findByRole('table')
    expect(within(table).getByText('Reforma cocina')).toBeInTheDocument()
    expect(within(table).getByText('Norte SL')).toBeInTheDocument()
    expect(within(table).getByRole('img', { name: /completitud 88%/i })).toBeInTheDocument()
    expect(within(table).getByLabelText(/2 mensajes sin leer/i)).toBeInTheDocument()
    expect(within(table).getByText('Cerrada')).toBeInTheDocument()
    expect(screen.getByText(/3 de 3 solicitudes/i)).toBeInTheDocument()
  })

  it('los filtros viven en la URL y muestran un vacío con "quitar filtros"', async () => {
    api.listSolicitudes.mockResolvedValue(ROWS)
    const user = setup('/empresa/solicitudes?estado=closed')
    const table = await screen.findByRole('table')
    expect(within(table).queryByText('Reforma cocina')).not.toBeInTheDocument()
    expect(within(table).getByText('Cerrada antigua')).toBeInTheDocument()
    await user.type(screen.getByRole('searchbox', { name: /buscar/i }), 'zzz')
    expect(await screen.findByText(/ninguna solicitud coincide/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /quitar filtros/i }))
    expect(await screen.findByText(/3 de 3 solicitudes/i)).toBeInTheDocument()
  })

  it('"Solo pendientes" deja únicamente las que requieren acción', async () => {
    api.listSolicitudes.mockResolvedValue(ROWS)
    const user = setup()
    await screen.findByRole('table')
    await user.click(screen.getByRole('button', { name: /solo pendientes/i }))
    expect(screen.getByRole('button', { name: /solo pendientes/i })).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByText(/1 de 3 solicitudes/i)).toBeInTheDocument()
  })

  it('muestra el error de carga de forma accesible', async () => {
    api.listSolicitudes.mockRejectedValue(new Error('No se pudieron cargar las solicitudes.'))
    setup()
    expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudieron cargar/i)
  })
})
