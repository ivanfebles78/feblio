import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import type { OnboardingStepRow } from './types'

const api = vi.hoisted(() => ({
  getOnboarding: vi.fn(),
  saveStep: vi.fn(),
  completeStep: vi.fn(),
  skipStep: vi.fn(),
  reopenStep: vi.fn(),
}))
vi.mock('./api', () => api)

import { OnboardingProvider, useOnboarding, type OnboardingContextValue } from './OnboardingContext'
import { snapshotFixture, stepRow } from '../../test/fixtures'

let captured: OnboardingContextValue | null = null
function Probe() {
  captured = useOnboarding()
  const data = captured.getStepData<{ provider: string; sender_name: string }>('email', () => ({ provider: 'later', sender_name: 'def' }))
  return (
    <div>
      <span data-testid="state">{captured.loading ? 'loading' : captured.saveState}</span>
      <span data-testid="provider">{data.provider}</span>
      <span data-testid="sender">{data.sender_name}</span>
      <span data-testid="dirty">{String(captured.dirty)}</span>
    </div>
  )
}

describe('OnboardingProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    api.getOnboarding.mockResolvedValue(snapshotFixture())
    api.saveStep.mockImplementation(async (key: string, data: Record<string, unknown>) => stepRow(key as OnboardingStepRow['step_key'], data, 'in_progress'))
  })

  it('combina valores por defecto, datos del servidor y borrador local (persistencia y reanudación)', async () => {
    render(
      <OnboardingProvider>
        <Probe />
      </OnboardingProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('state')).not.toHaveTextContent('loading'))
    // servidor: provider=feblio_inbox · defaults: sender_name=def
    expect(screen.getByTestId('provider')).toHaveTextContent('feblio_inbox')
    expect(screen.getByTestId('sender')).toHaveTextContent('def')
    expect(captured!.stepStatus('company')).toBe('completed')
    expect(captured!.stepStatus('email')).toBe('in_progress')
  })

  it('guarda automáticamente con debounce y marca Guardado', async () => {
    render(
      <OnboardingProvider>
        <Probe />
      </OnboardingProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('state')).not.toHaveTextContent('loading'))
    act(() => {
      captured!.updateStepData('email', { sender_name: 'RALM' }, () => ({ provider: 'later', sender_name: 'def' }))
    })
    expect(screen.getByTestId('dirty')).toHaveTextContent('true')
    expect(api.saveStep).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    await waitFor(() => expect(api.saveStep).toHaveBeenCalledTimes(1))
    expect(api.saveStep.mock.calls[0][0]).toBe('email')
    expect(api.saveStep.mock.calls[0][1]).toMatchObject({ provider: 'feblio_inbox', sender_name: 'RALM' })
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('saved'))
    expect(screen.getByTestId('dirty')).toHaveTextContent('false')
  })

  it('reintenta y, si sigue fallando, expone el error sin perder el borrador', async () => {
    api.saveStep.mockRejectedValue(new Error('Sin conexión'))
    render(
      <OnboardingProvider>
        <Probe />
      </OnboardingProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('state')).not.toHaveTextContent('loading'))
    act(() => {
      captured!.updateStepData('email', { sender_name: 'X' }, () => ({ provider: 'later', sender_name: 'def' }))
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('error'))
    expect(api.saveStep.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(captured!.saveError).toBe('Sin conexión')
    expect(screen.getByTestId('sender')).toHaveTextContent('X')
    expect(captured!.dirty).toBe(true)
  })
})
