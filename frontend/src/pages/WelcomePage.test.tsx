// Feblio · Bienvenida: un icono por cada área de SETUP_AREAS y contadores derivados de su longitud.
// Regresión cubierta: 0018 añadió el área 'catalog' y el mapa de iconos, indexado por posición,
// devolvía undefined para la última área → React #130 y /bienvenida en blanco.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { resetLanguageForTests, setUserLanguage } from '../i18n'
import { SETUP_AREAS, SETUP_TOTAL_MINUTES } from '../lib/onboarding/areas'

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    profile: { id: 'u1', email: 'ana@example.com', full_name: 'Ana García', role: 'empresa', empresa_id: 'e1', cliente_id: null },
    signOut: vi.fn(),
    session: { user: { id: 'u1' } },
    loading: false,
    profileLoading: false,
  }),
}))
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ single: () => Promise.resolve({ data: { name: 'Reformas del Sur SL', trade_name: null }, error: null }) }),
      }),
    }),
  },
}))
vi.mock('../lib/onboarding/api', () => ({ markWelcomeSeen: vi.fn() }))

import WelcomePage from './WelcomePage'

/** Espera al nombre de empresa para que la carga asíncrona no deje estados fuera de act(). */
async function renderWelcome() {
  const view = render(
    <MemoryRouter>
      <WelcomePage />
    </MemoryRouter>,
  )
  await screen.findByText(/Reformas del Sur SL/)
  return view
}

describe('WelcomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    resetLanguageForTests()
  })

  it('renderiza una tarjeta con icono por cada área, sin componentes undefined', async () => {
    await renderWelcome()
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(SETUP_AREAS.length)
    expect(SETUP_AREAS.length).toBeGreaterThan(5)
    for (const [i, area] of SETUP_AREAS.entries()) {
      const card = items[i]
      // Si el icono fuese undefined, React lanzaría al renderizar; esto además fija que sea un SVG real.
      expect(card.querySelector('svg')).toBeInstanceOf(SVGElement)
      expect(within(card).getByText(area.title)).toBeInTheDocument()
      expect(within(card).getByText(`${i + 1}/${SETUP_AREAS.length}`)).toBeInTheDocument()
    }
  })

  it('incluye el área del catálogo de servicios con su propio icono', async () => {
    await renderWelcome()
    const catalog = SETUP_AREAS.find((a) => a.key === 'catalog')
    expect(catalog).toBeDefined()
    const card = screen.getByText(catalog!.title).closest('li')
    expect(card).not.toBeNull()
    expect(card!.querySelector('svg')).toBeInstanceOf(SVGElement)
    const icons = screen.getAllByRole('listitem').map((li) => li.querySelector('svg')?.getAttribute('class'))
    expect(new Set(icons).size).toBe(SETUP_AREAS.length)
  })

  it('el título y los minutos se derivan de SETUP_AREAS, sin números fijos', async () => {
    await renderWelcome()
    expect(screen.getByRole('heading', { name: `${SETUP_AREAS.length} áreas para dejar Feblio a tu medida` })).toBeInTheDocument()
    expect(screen.getByText(`Unos ${SETUP_TOTAL_MINUTES} minutos en total`)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/Cinco áreas/)
  })

  it('en inglés traduce el título con el mismo recuento', async () => {
    setUserLanguage('en')
    await renderWelcome()
    expect(screen.getByRole('heading', { name: `${SETUP_AREAS.length} areas to make Feblio your own` })).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/auth\.welcome\./)
  })
})
