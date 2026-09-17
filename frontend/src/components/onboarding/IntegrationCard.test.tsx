import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { IntegrationCard } from './IntegrationCard'
import { ConnectionStatus } from './ConnectionStatus'
import { adapterById } from '../../lib/integrations/adapters'
import type { IntegrationActions } from '../../lib/integrations/useIntegration'
import type { IntegrationConnection } from '../../lib/onboarding/types'

function conn(over: Partial<IntegrationConnection>): IntegrationConnection {
  return { id: 'c1', empresa_id: 'e1', kind: 'email', provider: 'gmail', status: 'not_configured', display_name: null, account_identifier: null, settings: {}, last_activity_at: null, last_test_at: null, last_test_ok: null, last_error: null, last_sync_at: null, token_expires_at: null, connected_at: null, disconnected_at: null, created_at: '', updated_at: '', ...over }
}

function actions(c: IntegrationConnection | null): IntegrationActions {
  return { connection: c, adapter: adapterById(c?.provider), busy: null, result: null, setResult: vi.fn(), configure: vi.fn(), connectOAuth: vi.fn(), storeCredentials: vi.fn(), test: vi.fn(), disconnect: vi.fn(), sendTest: vi.fn() }
}

describe('estados de integración', () => {
  it('todos los estados se comunican con texto, no solo con color', () => {
    const { container } = render(
      <>
        {(['not_configured', 'pending_credentials', 'connecting', 'connected', 'degraded', 'expired', 'error', 'disconnected'] as const).map((s) => (
          <ConnectionStatus key={s} status={s} />
        ))}
      </>,
    )
    expect(container.textContent).toMatch(/Sin configurar/)
    expect(container.textContent).toMatch(/Requiere configuración del administrador de Feblio/)
    expect(container.textContent).toMatch(/Conectado/)
    expect(container.textContent).toMatch(/Caducado/)
    expect(container.textContent).toMatch(/Desconectado/)
  })

  it('una integración elegida pero sin prueba real nunca aparece como "Conectado"', () => {
    render(<IntegrationCard adapter={adapterById('gmail')!} actions={actions(conn({ status: 'not_configured' }))} settings={{}} returnTo="/onboarding/email" />)
    expect(screen.getByText('Sin configurar')).toBeInTheDocument()
    expect(screen.queryByText(/^Conectado$/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /conectar/i })).toBeInTheDocument()
  })

  it('pending_credentials muestra las variables que faltan y no ofrece "Probar"', () => {
    render(<IntegrationCard adapter={adapterById('gmail')!} actions={actions(conn({ status: 'pending_credentials' }))} settings={{}} returnTo="/onboarding/email" />)
    expect(screen.getAllByText(/Requiere configuración del administrador de Feblio/).length).toBeGreaterThan(0)
    expect(screen.getByText(/GOOGLE_CLIENT_ID/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /probar conexión/i })).not.toBeInTheDocument()
  })

  it('conectado con prueba registrada muestra Probar y Desconectar', () => {
    render(<IntegrationCard adapter={adapterById('gmail')!} actions={actions(conn({ status: 'connected', last_test_at: '2026-09-17T10:00:00Z', last_test_ok: true, account_identifier: 'ralm@gmail.com' }))} settings={{}} returnTo="/onboarding/email" />)
    expect(screen.getByText('Conectado')).toBeInTheDocument()
    expect(screen.getByText('ralm@gmail.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /probar conexión/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /desconectar/i })).toBeInTheDocument()
  })
})
