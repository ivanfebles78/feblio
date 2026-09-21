import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import i18n, { applyCompanyLanguage, currentLanguage, LANGUAGE_STORAGE_KEY, readStoredLanguage, resetLanguageForTests, resolveLanguage, setUserLanguage, toLanguage } from './index'
import { LanguageSwitcher } from '../components/LanguageSwitcher'

const sb = vi.hoisted(() => ({ calls: [] as string[] }))
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      sb.calls.push(table)
      return { update: () => ({ eq: async () => ({ error: null }) }) }
    },
    // Sin sesión: el selector no sincroniza metadatos (y nunca escribe en tablas)
    auth: {
      getSession: async () => ({ data: { session: null } }),
      updateUser: async () => {
        sb.calls.push('auth.updateUser')
        return { data: {}, error: null }
      },
    },
  },
}))

function Probe() {
  const { t } = useTranslation()
  const loc = useLocation()
  return (
    <p>
      {t('auth.login.title')} @ {loc.pathname}
      {loc.search}
    </p>
  )
}

describe('i18n: prioridad, persistencia y accesibilidad', () => {
  beforeEach(() => {
    localStorage.clear()
    resetLanguageForTests()
    sb.calls = []
  })

  it('1. primera visita sin sesión ni preferencia: español', () => {
    expect(currentLanguage()).toBe('es')
    expect(i18n.t('auth.login.title')).toBe('Bienvenido de nuevo')
    expect(document.documentElement.lang).toBe('es')
  })

  it('2. el selector cambia de español a inglés sin recargar y 5. actualiza <html lang>', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/registro?x=1']}>
        <LanguageSwitcher />
        <Routes>
          <Route path="*" element={<Probe />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('Bienvenido de nuevo @ /registro?x=1')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'English' }))
    expect(await screen.findByText('Welcome back @ /registro?x=1')).toBeInTheDocument() // 12. la ruta no cambia
    expect(document.documentElement.lang).toBe('en')
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Español' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('group', { name: 'Interface language' })).toBeInTheDocument()
  })

  it('3. la elección se guarda en localStorage (feblio.uiLanguage) y se conserva al recargar', () => {
    setUserLanguage('en')
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en')
    expect(readStoredLanguage()).toBe('en')
    // "Recarga": el idioma inicial se resuelve desde el almacenamiento
    expect(resolveLanguage(readStoredLanguage(), null)).toBe('en')
  })

  it('4. valores no válidos (guardados o corporativos) recuperan el español', () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'fr')
    expect(readStoredLanguage()).toBeNull()
    expect(resolveLanguage('fr', 'pt')).toBe('es')
    expect(resolveLanguage(42, { a: 1 })).toBe('es')
    expect(toLanguage('en-US')).toBe('en')
    expect(toLanguage(' ES ')).toBe('es')
    expect(applyCompanyLanguage('de')).toBe('es')
  })

  it('6. la elección del usuario prevalece sobre el idioma de la empresa', () => {
    setUserLanguage('es')
    expect(applyCompanyLanguage('en')).toBe('es')
    expect(currentLanguage()).toBe('es')
    expect(resolveLanguage('en', 'es')).toBe('en')
  })

  it('7. sin preferencia del usuario se usa el idioma de la empresa', () => {
    expect(applyCompanyLanguage('en')).toBe('en')
    expect(currentLanguage()).toBe('en')
    expect(document.documentElement.lang).toBe('en')
    // y nunca se guarda como preferencia del usuario
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBeNull()
  })

  it('9. el selector rápido nunca escribe en la empresa (sin llamadas a Supabase)', async () => {
    const user = userEvent.setup()
    render(<LanguageSwitcher />)
    await user.click(screen.getByRole('button', { name: 'English' }))
    await user.click(screen.getByRole('button', { name: 'Español' }))
    expect(sb.calls).toEqual([])
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('es')
  })

  it('el selector es navegable con teclado y cada botón tiene nombre completo, no solo la abreviatura', async () => {
    const user = userEvent.setup()
    render(<LanguageSwitcher />)
    await user.tab()
    expect(screen.getByRole('button', { name: 'Español' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'English' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(currentLanguage()).toBe('en')
    expect(screen.getByRole('button', { name: 'English' })).toHaveTextContent('en')
  })
})
