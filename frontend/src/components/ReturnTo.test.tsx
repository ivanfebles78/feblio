import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'

/**
 * Conservación de la ruta pedida sin sesión (p. ej. enlace profundo abierto desde un magic link):
 * ProtectedRoute → "/" (Landing) → al establecerse la sesión vuelve a la ruta si el rol puede abrirla.
 */
const auth = vi.hoisted(() => ({
  state: { session: null as null | { user: { id: string } }, profile: null as null | { role: string }, loading: false, profileLoading: false },
  signIn: vi.fn(),
  resendConfirmation: vi.fn(),
  refreshProfile: vi.fn(),
  signOut: vi.fn(),
}))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ ...auth.state, signIn: auth.signIn, resendConfirmation: auth.resendConfirmation, refreshProfile: auth.refreshProfile, signOut: auth.signOut }) }))
vi.mock('./HeroScene', () => ({ HeroScene: () => <div /> }))
vi.mock('./auth/DemoAccess', () => ({ DemoAccess: () => null }))

import Landing from '../pages/Landing'
import { ProtectedRoute } from './ProtectedRoute'

function Where({ label }: { label: string }) {
  const loc = useLocation()
  return (
    <p>
      {label} @ {loc.pathname}
      {loc.search}
    </p>
  )
}

function App({ initial }: { initial: string }) {
  const guard = (allow: ('empresa' | 'cliente' | 'admin')[], el: ReactNode) => <ProtectedRoute allow={allow}>{el}</ProtectedRoute>
  return (
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/empresa/*" element={guard(['empresa'], <Where label="EMPRESA" />)} />
        <Route path="/cliente" element={guard(['cliente'], <Where label="CLIENTE" />)} />
        <Route path="/admin" element={guard(['admin'], <Where label="ADMIN" />)} />
        <Route path="/restablecer-contrasena" element={<p>RESET</p>} />
      </Routes>
    </MemoryRouter>
  )
}

async function signInAs(role: 'empresa' | 'cliente' | 'admin', rerender: (ui: ReactNode) => void, initial: string) {
  await act(async () => {
    auth.state = { ...auth.state, session: { user: { id: 'u1' } }, profile: { role } }
    rerender(<App initial={initial} />)
  })
}

describe('conservación de la ruta tras autenticar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    auth.state = { session: null, profile: null, loading: false, profileLoading: false }
  })

  it('empresa: un enlace profundo al detalle de una solicitud se conserva y se recupera tras la sesión', async () => {
    const target = '/empresa/solicitudes/250b08b9-5f4f-4928-b62a-65f1f17312bb?tab=docs'
    const { rerender } = render(<App initial={target} />)
    // Sin sesión: Landing (formulario de acceso), sin salir del sitio
    expect(await screen.findByRole('heading', { name: /bienvenido de nuevo/i })).toBeInTheDocument()
    await signInAs('empresa', rerender, target)
    expect(await screen.findByText(`EMPRESA @ ${target}`)).toBeInTheDocument()
  })

  it('cliente: vuelve a su solicitud vinculada', async () => {
    const target = '/cliente?solicitud=s1'
    const { rerender } = render(<App initial={target} />)
    await screen.findByRole('heading', { name: /bienvenido de nuevo/i })
    await signInAs('cliente', rerender, target)
    expect(await screen.findByText('CLIENTE @ /cliente?solicitud=s1')).toBeInTheDocument()
  })

  it('ruta no autorizada para el rol: destino normal del rol', async () => {
    const target = '/empresa/solicitudes/abc'
    const { rerender } = render(<App initial={target} />)
    await screen.findByRole('heading', { name: /bienvenido de nuevo/i })
    await signInAs('cliente', rerender, target)
    expect(await screen.findByText('CLIENTE @ /cliente')).toBeInTheDocument()
    expect(screen.queryByText(/EMPRESA @/)).not.toBeInTheDocument()
  })

  it('URL externa manipulada en el estado o en el almacenamiento: nunca redirige fuera', async () => {
    localStorage.setItem('feblio:return_to', JSON.stringify({ path: 'https://evil.example/phish', at: Date.now() }))
    const { rerender } = render(
      <MemoryRouter initialEntries={[{ pathname: '/', state: { from: '//evil.example' } }]}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/empresa/*" element={<Where label="EMPRESA" />} />
        </Routes>
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { name: /bienvenido de nuevo/i })
    await act(async () => {
      auth.state = { ...auth.state, session: { user: { id: 'u1' } }, profile: { role: 'empresa' } }
      rerender(
        <MemoryRouter initialEntries={[{ pathname: '/', state: { from: '//evil.example' } }]}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/empresa/*" element={<Where label="EMPRESA" />} />
          </Routes>
        </MemoryRouter>,
      )
    })
    expect(await screen.findByText('EMPRESA @ /empresa')).toBeInTheDocument()
    expect(localStorage.getItem('feblio:return_to')).toBeNull()
  })

  it('login normal sin ruta guardada: home del rol', async () => {
    const { rerender } = render(<App initial="/" />)
    await screen.findByRole('heading', { name: /bienvenido de nuevo/i })
    await signInAs('empresa', rerender, '/')
    expect(await screen.findByText('EMPRESA @ /empresa')).toBeInTheDocument()
  })

  it('recuperación de contraseña: la página pública no guarda ni consume rutas', async () => {
    render(<App initial="/restablecer-contrasena" />)
    expect(await screen.findByText('RESET')).toBeInTheDocument()
    expect(localStorage.getItem('feblio:return_to')).toBeNull()
  })
})
