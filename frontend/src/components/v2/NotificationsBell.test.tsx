import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NotificationsBell } from './NotificationsBell'
import type { Notificacion } from '../../lib/solicitudes/types'

const n = (p: Partial<Notificacion>): Notificacion => ({
  id: 'n1',
  empresa_id: 'e1',
  recipient_kind: 'empresa',
  solicitud_id: 's1',
  type: 'solicitud.submitted',
  title: 'Formulario recibido: Reforma',
  body: 'Ana ha enviado el formulario',
  link_path: '/empresa/solicitudes/s1',
  read_at: null,
  created_at: new Date().toISOString(),
  ...p,
})

describe('<NotificationsBell />', () => {
  it('anuncia el número de no leídas y abre el panel accesible', async () => {
    const user = userEvent.setup()
    render(<NotificationsBell items={[n({}), n({ id: 'n2', read_at: '2026-09-19T00:00:00Z', title: 'Leída' })]} unread={1} onMarkOne={vi.fn()} onMarkAll={vi.fn()} onOpen={vi.fn()} />)
    const btn = screen.getByRole('button', { name: /notificaciones: 1 sin leer/i })
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    await user.click(btn)
    expect(screen.getByRole('dialog', { name: /notificaciones/i })).toBeInTheDocument()
    expect(screen.getByText('Formulario recibido: Reforma')).toBeInTheDocument()
    expect(screen.getByText('Leída')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('marca una notificación al activarla y navega a su recurso', async () => {
    const user = userEvent.setup()
    const onMarkOne = vi.fn()
    const onOpen = vi.fn()
    render(<NotificationsBell items={[n({})]} unread={1} onMarkOne={onMarkOne} onMarkAll={vi.fn()} onOpen={onOpen} />)
    await user.click(screen.getByRole('button', { name: /notificaciones/i }))
    await user.click(screen.getByRole('button', { name: /formulario recibido/i }))
    expect(onMarkOne).toHaveBeenCalledWith('n1')
    expect(onOpen).toHaveBeenCalledWith('/empresa/solicitudes/s1')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('"marcar todas" solo está disponible con pendientes; el vacío es explícito', async () => {
    const user = userEvent.setup()
    const onMarkAll = vi.fn()
    const { rerender } = render(<NotificationsBell items={[n({})]} unread={1} onMarkOne={vi.fn()} onMarkAll={onMarkAll} onOpen={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /notificaciones/i }))
    await user.click(screen.getByRole('button', { name: /marcar todas/i }))
    expect(onMarkAll).toHaveBeenCalledTimes(1)
    rerender(<NotificationsBell items={[]} unread={0} onMarkOne={vi.fn()} onMarkAll={onMarkAll} onOpen={vi.fn()} />)
    expect(screen.getByRole('button', { name: /marcar todas/i })).toBeDisabled()
    expect(screen.getByText(/no tienes notificaciones/i)).toBeInTheDocument()
  })
})
