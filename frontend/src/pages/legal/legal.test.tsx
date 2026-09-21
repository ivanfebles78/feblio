import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { setUserLanguage } from '../../i18n'
import { LEGAL_VERSIONS } from '../../lib/legal'
import Terminos from './Terminos'
import Privacidad from './Privacidad'

const PREVALENCE_NOTE = /this english translation is provided for convenience\. in the event of any discrepancy, the spanish version prevails\./i

function renderPage(page: 'terms' | 'privacy') {
  return render(<MemoryRouter>{page === 'terms' ? <Terminos /> : <Privacidad />}</MemoryRouter>)
}

describe('páginas legales en español (versión jurídica principal)', () => {
  it('Términos: título, 11 secciones, versión y sin nota de prevalencia', () => {
    renderPage('terms')
    expect(screen.getByRole('heading', { level: 1, name: 'Términos del servicio' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(11)
    expect(screen.getByRole('heading', { level: 2, name: '1. Objeto' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: '11. Legislación y jurisdicción' })).toBeInTheDocument()
    expect(screen.getByText(`Versión ${LEGAL_VERSIONS.terms}`)).toBeInTheDocument()
    expect(screen.getByText(/documento en revisión/i)).toBeInTheDocument()
    expect(screen.queryByText(PREVALENCE_NOTE)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/')
    expect(document.documentElement.lang).toBe('es')
  })

  it('Privacidad: título, 9 secciones con la lista de finalidades y sin nota de prevalencia', () => {
    renderPage('privacy')
    expect(screen.getByRole('heading', { level: 1, name: 'Política de privacidad' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(9)
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    expect(screen.getByText(/agencia española de protección de datos/i)).toBeInTheDocument()
    expect(screen.getByText(`Versión ${LEGAL_VERSIONS.privacy}`)).toBeInTheDocument()
    expect(screen.queryByText(PREVALENCE_NOTE)).not.toBeInTheDocument()
  })
})

describe('legal pages in English (convenience translation)', () => {
  it('Terms: English title, same 11 sections and the prevalence note at the end', () => {
    setUserLanguage('en')
    renderPage('terms')
    expect(screen.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(11)
    expect(screen.getByRole('heading', { level: 2, name: '1. Purpose' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: '11. Governing law and jurisdiction' })).toBeInTheDocument()
    expect(screen.getByText(`Version ${LEGAL_VERSIONS.terms}`)).toBeInTheDocument()
    expect(screen.getByText(/document under review/i)).toBeInTheDocument()
    const note = screen.getByText(PREVALENCE_NOTE)
    expect(note).toBeInTheDocument()
    expect(note).toHaveAttribute('lang', 'en')
    expect(screen.queryByText(/términos del servicio/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/documento en revisión/i)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/')
    expect(document.documentElement.lang).toBe('en')
  })

  it('Privacy: English title, list of purposes and the prevalence note', () => {
    setUserLanguage('en')
    renderPage('privacy')
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(9)
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    expect(screen.getByRole('heading', { level: 2, name: '4. Feblio as data processor' })).toBeInTheDocument()
    expect(screen.getByText(PREVALENCE_NOTE)).toBeInTheDocument()
    expect(screen.queryByText(/política de privacidad/i)).not.toBeInTheDocument()
  })

  it('the language switcher toggles the page without reloading and removes the note in Spanish', async () => {
    setUserLanguage('en')
    const user = userEvent.setup()
    renderPage('terms')
    expect(screen.getByText(PREVALENCE_NOTE)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Español' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Términos del servicio' })).toBeInTheDocument()
    expect(screen.queryByText(PREVALENCE_NOTE)).not.toBeInTheDocument()
  })
})
