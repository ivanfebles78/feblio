import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

const api = vi.hoisted(() => ({
  listClientes: vi.fn(),
  listFormTemplates: vi.fn(),
  crearSolicitud: vi.fn(),
  generarEnlace: vi.fn(),
}))
vi.mock('../../lib/solicitudes/api', () => api)

import NuevaSolicitud from './NuevaSolicitud'

function Detalle() {
  const loc = useLocation()
  const st = loc.state as { enlace?: { token: string } } | null
  return <p>detalle {loc.pathname} token={st?.enlace?.token ?? 'ninguno'}</p>
}

function setup() {
  render(
    <MemoryRouter initialEntries={['/empresa/solicitudes/nueva']}>
      <Routes>
        <Route path="/empresa/solicitudes/nueva" element={<NuevaSolicitud />} />
        <Route path="/empresa/solicitudes/:id" element={<Detalle />} />
      </Routes>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

describe('<NuevaSolicitud />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.listClientes.mockResolvedValue([{ id: 'c1', name: 'Norte SL', email: 'hola@norte.es' }])
    api.listFormTemplates.mockResolvedValue([{ id: 't1', name: 'Reformas', is_default: true }])
  })

  it('valida contacto y asunto antes de crear; enfoca el primer error', async () => {
    const user = setup()
    await screen.findByRole('heading', { name: /nueva solicitud/i })
    await user.click(screen.getByRole('button', { name: /crear solicitud/i }))
    expect(api.crearSolicitud).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/persona de contacto/i)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText(/persona de contacto/i)).toHaveFocus()
    expect(screen.getByLabelText(/asunto/i)).toHaveAttribute('aria-invalid', 'true')
  })

  it('crea la solicitud sin enviar empresa_id, genera el enlace y navega al detalle con el token en memoria', async () => {
    api.crearSolicitud.mockResolvedValue('sol-1')
    api.generarEnlace.mockResolvedValue({ token: 'tok', expires_at: '2026-10-19', access_id: 'acc' })
    const user = setup()
    await screen.findByRole('heading', { name: /nueva solicitud/i })
    await user.type(screen.getByLabelText(/persona de contacto/i), 'Ana López')
    await user.type(screen.getByLabelText(/correo electrónico/i), 'ana@norte.es')
    await user.type(screen.getByLabelText(/asunto/i), 'Reforma cocina')
    await user.selectOptions(screen.getByLabelText(/canal de entrada/i), 'whatsapp')
    await user.click(screen.getByRole('button', { name: /crear solicitud/i }))
    await waitFor(() => expect(api.crearSolicitud).toHaveBeenCalledTimes(1))
    const input = api.crearSolicitud.mock.calls[0][0]
    expect(input).toMatchObject({ contact_name: 'Ana López', contact_email: 'ana@norte.es', title: 'Reforma cocina', source_channel: 'whatsapp', cliente_id: null })
    expect(input).not.toHaveProperty('empresa_id')
    expect(api.generarEnlace).toHaveBeenCalledWith('sol-1')
    expect(await screen.findByText(/detalle \/empresa\/solicitudes\/sol-1 token=tok/)).toBeInTheDocument()
  })

  it('con cliente existente rellena el contacto y exige elegirlo', async () => {
    api.crearSolicitud.mockResolvedValue('sol-2')
    const user = setup()
    await screen.findByRole('heading', { name: /nueva solicitud/i })
    await user.click(screen.getByRole('radio', { name: /cliente existente/i }))
    await user.type(screen.getByLabelText(/asunto/i), 'Asesoría')
    await user.click(screen.getByRole('button', { name: /crear solicitud/i }))
    expect(screen.getByRole('combobox', { name: /^cliente/i })).toHaveAttribute('aria-invalid', 'true')
    await user.selectOptions(screen.getByRole('combobox', { name: /^cliente/i }), 'c1')
    expect(screen.getByLabelText(/persona de contacto/i)).toHaveValue('Norte SL')
    await user.click(screen.getByLabelText(/generar ahora el enlace/i))
    await user.click(screen.getByRole('button', { name: /crear solicitud/i }))
    await waitFor(() => expect(api.crearSolicitud).toHaveBeenCalledWith(expect.objectContaining({ cliente_id: 'c1', contact_email: 'hola@norte.es' })))
    expect(api.generarEnlace).not.toHaveBeenCalled()
    expect(await screen.findByText(/token=ninguno/)).toBeInTheDocument()
  })

  it('muestra el error del servidor y permite reintentar', async () => {
    api.crearSolicitud.mockRejectedValue(new Error('El cliente no pertenece a tu empresa'))
    const user = setup()
    await screen.findByRole('heading', { name: /nueva solicitud/i })
    await user.type(screen.getByLabelText(/persona de contacto/i), 'Ana')
    await user.type(screen.getByLabelText(/asunto/i), 'X')
    await user.click(screen.getByRole('button', { name: /crear solicitud/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/no pertenece a tu empresa/i)
    expect(screen.getByRole('button', { name: /crear solicitud/i })).toBeEnabled()
  })
})
