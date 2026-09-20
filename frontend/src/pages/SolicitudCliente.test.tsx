import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { ClienteVista } from '../lib/solicitudes/types'

const api = vi.hoisted(() => ({
  clienteObtener: vi.fn(),
  clienteGuardar: vi.fn(),
  clienteEnviar: vi.fn(),
  clienteMensaje: vi.fn(),
  clienteRegistrarDocumento: vi.fn(),
  clienteMarcarLeido: vi.fn(),
  clienteDescargarDocumento: vi.fn(),
}))
vi.mock('../lib/solicitudes/api', () => api)
const files = vi.hoisted(() => ({ uploadSolicitudFile: vi.fn() }))
vi.mock('../lib/solicitudes/files', async (orig) => ({ ...(await orig<typeof import('../lib/solicitudes/files')>()), ...files }))

import SolicitudCliente from './SolicitudCliente'

const TOKEN = 'a'.repeat(43)

function vista(p: Partial<ClienteVista['solicitud']> = {}, extra: Partial<ClienteVista> = {}): ClienteVista {
  return {
    access_id: 'acc-1',
    expires_at: '2026-10-19T00:00:00Z',
    empresa: { name: 'Reformas Norte', logo_url: null },
    solicitud: {
      title: 'Reforma de cocina',
      service_type: null,
      description: null,
      status: 'awaiting_client',
      contact_name: 'Ana López',
      contact_email: null,
      contact_phone: null,
      form_data: {},
      form_submitted_at: null,
      completeness: 0,
      ...p,
    },
    template: { fields: [{ key: 'superficie', label: 'Superficie (m²)', type: 'number', required: true }], required_documents: [], consents: [] },
    requisitos: [],
    documentos: [],
    mensajes: [],
    ...extra,
  }
}

function setup(token = TOKEN) {
  render(
    <MemoryRouter initialEntries={[`/s/${token}`]}>
      <Routes>
        <Route path="/s/:token" element={<SolicitudCliente />} />
      </Routes>
    </MemoryRouter>,
  )
  return userEvent.setup({ applyAccept: false })
}

describe('<SolicitudCliente />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.clienteMarcarLeido.mockResolvedValue(undefined)
  })

  it('un enlace inválido, caducado o revocado muestra un mensaje neutro sin detalles técnicos', async () => {
    api.clienteObtener.mockRejectedValue(new Error('Enlace no válido'))
    setup()
    expect(await screen.findByRole('heading', { name: /este enlace no está disponible/i })).toBeInTheDocument()
    expect(screen.queryByText(/42501|token|hash/i)).not.toBeInTheDocument()
  })

  it('un token demasiado corto ni siquiera consulta el servidor', async () => {
    setup('corto')
    expect(await screen.findByRole('heading', { name: /este enlace no está disponible/i })).toBeInTheDocument()
    expect(api.clienteObtener).not.toHaveBeenCalled()
  })

  it('muestra el formulario sin identificadores internos y con el nombre de la empresa', async () => {
    api.clienteObtener.mockResolvedValue(vista())
    setup()
    expect(await screen.findByRole('heading', { name: 'Reforma de cocina' })).toBeInTheDocument()
    expect(screen.getByText('Reformas Norte')).toBeInTheDocument()
    expect(screen.getByLabelText(/nombre y apellidos/i)).toHaveValue('Ana López')
    expect(screen.getByLabelText(/superficie/i)).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: /información aportada/i })).toHaveAttribute('aria-valuenow', '14')
    expect(document.body.textContent).not.toMatch(/acc-1/)
  })

  it('guarda el borrador con los campos rellenos', async () => {
    api.clienteObtener.mockResolvedValue(vista())
    api.clienteGuardar.mockImplementation(async (_t: string, data: Record<string, string>) => vista({ form_data: data }))
    const user = setup()
    await screen.findByRole('heading', { name: 'Reforma de cocina' })
    await user.type(screen.getByLabelText(/^qué necesitas/i), 'Cambiar muebles y suelo')
    await user.click(screen.getByRole('button', { name: /guardar borrador/i }))
    await waitFor(() => expect(api.clienteGuardar).toHaveBeenCalledWith(TOKEN, expect.objectContaining({ needs: 'Cambiar muebles y suelo', contact_name: 'Ana López' })))
    expect(await screen.findByRole('status')).toHaveTextContent(/borrador guardado/i)
    expect(api.clienteEnviar).not.toHaveBeenCalled()
  })

  it('no envía si faltan obligatorios: marca los campos y enfoca el primero', async () => {
    api.clienteObtener.mockResolvedValue(vista())
    const user = setup()
    await screen.findByRole('heading', { name: 'Reforma de cocina' })
    await user.click(screen.getByRole('button', { name: /enviar solicitud/i }))
    expect(api.clienteEnviar).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/correo electrónico/i)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText(/^qué necesitas/i)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText(/superficie/i)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText(/correo electrónico/i)).toHaveFocus()
  })

  it('envía el formulario y pasa a solo lectura con el estado "Recibida"', async () => {
    api.clienteObtener.mockResolvedValue(vista())
    api.clienteEnviar.mockImplementation(async (_t: string, data: Record<string, string>) => vista({ status: 'submitted', form_data: data, form_submitted_at: '2026-09-19T10:00:00Z', completeness: 100 }))
    const user = setup()
    await screen.findByRole('heading', { name: 'Reforma de cocina' })
    await user.type(screen.getByLabelText(/correo electrónico/i), 'ana@norte.es')
    await user.type(screen.getByLabelText(/^qué necesitas/i), 'Reforma completa')
    await user.type(screen.getByLabelText(/superficie/i), '12')
    await user.click(screen.getByRole('button', { name: /enviar solicitud/i }))
    await waitFor(() => expect(api.clienteEnviar).toHaveBeenCalledWith(TOKEN, expect.objectContaining({ contact_email: 'ana@norte.es', needs: 'Reforma completa', superficie: '12' })))
    expect(await screen.findByRole('status')).toHaveTextContent(/formulario enviado/i)
    expect(screen.getByText('Recibida')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /enviar solicitud/i })).not.toBeInTheDocument()
    expect(screen.getByLabelText(/^qué necesitas/i)).toBeDisabled()
  })

  it('muestra la información pendiente pedida por la empresa y permite responder en la conversación', async () => {
    api.clienteObtener.mockResolvedValue(
      vista(
        { status: 'missing_information' },
        {
          requisitos: [{ id: 'r1', kind: 'document', key: 'planos', label: 'Planos actuales', status: 'pending', requested_at: '2026-09-19T09:00:00Z' }],
          mensajes: [{ id: 'm1', author_kind: 'empresa', author_name: 'Luis (Reformas Norte)', kind: 'info_request', body: 'Necesitamos los planos.', created_at: '2026-09-19T09:00:00Z', read: false }],
        },
      ),
    )
    api.clienteMensaje.mockImplementation(async () => vista({ status: 'under_review' }, { mensajes: [{ id: 'm2', author_kind: 'cliente', author_name: 'Ana López', kind: 'message', body: 'Los adjunto mañana', created_at: '2026-09-19T10:00:00Z', read: true }] }))
    const user = setup()
    expect(await screen.findByRole('heading', { name: /necesita lo siguiente/i })).toBeInTheDocument()
    expect(screen.getByText(/planos actuales/i, { selector: 'li' })).toBeInTheDocument()
    expect(screen.getByText('Necesitamos los planos.')).toBeInTheDocument()
    expect(api.clienteMarcarLeido).toHaveBeenCalledWith(TOKEN)
    await user.type(screen.getByLabelText(/nuevo mensaje/i), 'Los adjunto mañana')
    await user.click(screen.getByRole('button', { name: /^enviar$/i }))
    await waitFor(() => expect(api.clienteMensaje).toHaveBeenCalledWith(TOKEN, 'Los adjunto mañana'))
    expect(await screen.findByText('Los adjunto mañana', { selector: 'p' })).toBeInTheDocument()
  })

  it('valida el archivo antes de subir y registra el documento con el requisito', async () => {
    api.clienteObtener.mockResolvedValue(vista({}, { requisitos: [{ id: 'r1', kind: 'document', key: 'planos', label: 'Planos actuales', status: 'pending', requested_at: '2026-09-19T09:00:00Z' }] }))
    files.uploadSolicitudFile.mockResolvedValue('sol/acc-1/x.pdf')
    api.clienteRegistrarDocumento.mockImplementation(async () => vista({}, { requisitos: [{ id: 'r1', kind: 'document', key: 'planos', label: 'Planos actuales', status: 'received', requested_at: '2026-09-19T09:00:00Z' }], documentos: [{ id: 'd1', name: 'plano.pdf', size_bytes: 3, by: 'cliente', created_at: '2026-09-19T10:00:00Z', requisito_id: 'r1' }] }))
    const user = setup()
    await screen.findByRole('heading', { name: 'Reforma de cocina' })
    const input = screen.getAllByLabelText(/adjuntar archivo/i)[0] as HTMLInputElement
    await user.upload(input, new File(['x'], 'virus.exe', { type: 'application/octet-stream' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/no permitido/i)
    expect(files.uploadSolicitudFile).not.toHaveBeenCalled()
    await user.upload(input, new File(['abc'], 'plano.pdf', { type: 'application/pdf' }))
    await waitFor(() => expect(files.uploadSolicitudFile).toHaveBeenCalledWith(expect.stringMatching(/^sol\/acc-1\/[0-9a-f-]+\.pdf$/), expect.any(File), 'application/pdf'))
    expect(api.clienteRegistrarDocumento).toHaveBeenCalledWith(TOKEN, expect.stringMatching(/^sol\/acc-1\//), 'plano.pdf', 'application/pdf', 3, 'r1')
    expect(await screen.findByRole('button', { name: /descargar plano\.pdf/i })).toBeInTheDocument()
  })

  it('descarga: pide la URL firmada al servidor con el token y la abre; nunca expone rutas internas', async () => {
    api.clienteObtener.mockResolvedValue(vista({}, { documentos: [{ id: 'd1', name: 'plano.pdf', size_bytes: 3, by: 'cliente', created_at: '2026-09-19T10:00:00Z', requisito_id: null }, { id: 'd2', name: 'presupuesto-previo.pdf', size_bytes: 5, by: 'empresa', created_at: '2026-09-19T10:01:00Z', requisito_id: null }] }))
    api.clienteDescargarDocumento.mockResolvedValue({ url: 'https://storage.example/sign/abc?token=xyz', name: 'presupuesto-previo.pdf' })
    const fakeWin = { location: { href: '' }, close: vi.fn() }
    const open = vi.spyOn(window, 'open').mockReturnValue(fakeWin as unknown as Window)
    const user = setup()
    await screen.findByRole('heading', { name: 'Reforma de cocina' })
    expect(screen.getByText(/compartido por Reformas Norte/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /descargar presupuesto-previo\.pdf/i }))
    await waitFor(() => expect(api.clienteDescargarDocumento).toHaveBeenCalledWith(TOKEN, 'd2'))
    await waitFor(() => expect(fakeWin.location.href).toBe('https://storage.example/sign/abc?token=xyz'))
    expect(document.body.textContent).not.toMatch(/sol\/|storage_path/)
    open.mockRestore()
  })

  it('descarga rechazada (token caducado/revocado o documento no disponible): mensaje neutro y sin pestaña abierta', async () => {
    api.clienteObtener.mockResolvedValue(vista({}, { documentos: [{ id: 'd1', name: 'plano.pdf', size_bytes: 3, by: 'cliente', created_at: '2026-09-19T10:00:00Z', requisito_id: null }] }))
    api.clienteDescargarDocumento.mockRejectedValue(new Error('El archivo no está disponible. Si el enlace ha caducado, pide uno nuevo a la empresa.'))
    const fakeWin = { location: { href: '' }, close: vi.fn() }
    const open = vi.spyOn(window, 'open').mockReturnValue(fakeWin as unknown as Window)
    const user = setup()
    await screen.findByRole('heading', { name: 'Reforma de cocina' })
    await user.click(screen.getByRole('button', { name: /descargar plano\.pdf/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/no está disponible/i)
    expect(fakeWin.close).toHaveBeenCalled()
    expect(fakeWin.location.href).toBe('')
    open.mockRestore()
  })
})
