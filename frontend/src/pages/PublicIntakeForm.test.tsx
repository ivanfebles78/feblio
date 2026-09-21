import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { setUserLanguage } from '../i18n'

const sb = vi.hoisted(() => ({
  rpc: vi.fn(),
  storage: { upload: vi.fn(), getPublicUrl: vi.fn() },
}))
vi.mock('../lib/supabase', () => ({
  supabase: { rpc: sb.rpc, storage: { from: () => sb.storage } },
}))

import PublicIntakeForm from './PublicIntakeForm'

const BASIC_FORM = { status: 'pendiente', empresa: 'RALM', logo_url: null, project_types: [], form: null }

function renderForm(token = '11111111-1111-1111-1111-111111111111') {
  return render(
    <MemoryRouter initialEntries={[`/form/${token}`]}>
      <Routes>
        <Route path="/form/:token" element={<PublicIntakeForm />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('<PublicIntakeForm /> con bucket privado', () => {
  it('guarda la RUTA del adjunto (nunca una URL pública) y la envía bajo el prefijo del token', async () => {
    sb.rpc.mockImplementation(async (fn: string) => {
      if (fn === 'get_intake_form') return { data: { status: 'pendiente', empresa: 'RALM', logo_url: null, project_types: [], form: null }, error: null }
      if (fn === 'submit_intake_form') return { data: { ok: true }, error: null }
      return { data: null, error: null }
    })
    sb.storage.upload.mockResolvedValue({ data: {}, error: null })
    const user = userEvent.setup()
    renderForm()
    await screen.findByText(/completa tus datos/i)

    const file = new File(['hola'], 'plano.pdf', { type: 'application/pdf' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, file)
    await waitFor(() => expect(sb.storage.upload).toHaveBeenCalledTimes(1))
    const uploadedPath = sb.storage.upload.mock.calls[0][0] as string
    expect(uploadedPath).toMatch(/^11111111-1111-1111-1111-111111111111\/\d+-plano\.pdf$/)
    expect(sb.storage.getPublicUrl).not.toHaveBeenCalled()
    expect(document.body.innerHTML).not.toMatch(/object\/public/)

    await user.type(screen.getByLabelText(/nombre o razón social/i), 'Cliente X')
    await user.type(screen.getByLabelText(/^email/i), 'x@example.com')
    await user.click(screen.getByRole('button', { name: /enviar mis datos/i }))
    await waitFor(() => expect(sb.rpc).toHaveBeenCalledWith('submit_intake_form', expect.anything()))
    const args = sb.rpc.mock.calls.find((c) => c[0] === 'submit_intake_form')![1] as { p_data: { files: { name: string; path: string; url?: string }[] } }
    expect(args.p_data.files).toEqual([{ name: 'plano.pdf', path: uploadedPath }])
    expect(args.p_data.files[0]).not.toHaveProperty('url')
    expect(await screen.findByText(/datos enviados/i)).toBeInTheDocument()
  })

  it('un enlace caducado no muestra el formulario', async () => {
    sb.rpc.mockResolvedValue({ data: { status: 'caducado', empresa: 'RALM', logo_url: null, project_types: [], form: null }, error: null })
    renderForm()
    expect(await screen.findByText(/no es válido o ha caducado/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /enviar mis datos/i })).not.toBeInTheDocument()
  })
})

describe('<PublicIntakeForm /> idioma de la empresa (get_intake_form.language)', () => {
  it('con language "en" y sin preferencia guardada se muestra en inglés', async () => {
    sb.rpc.mockResolvedValue({ data: { ...BASIC_FORM, language: 'en' }, error: null })
    renderForm()
    expect(await screen.findByRole('button', { name: /send my details/i })).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('en')
    expect(screen.getByLabelText(/name or company name/i)).toBeInTheDocument()
    expect(screen.getByText(/secure form/i)).toBeInTheDocument()
    expect(screen.queryByText(/enviar mis datos/i)).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: /interface language/i })).toBeInTheDocument()
  })

  it('la elección manual del visitante (es) prevalece sobre language "en"', async () => {
    setUserLanguage('es')
    sb.rpc.mockResolvedValue({ data: { ...BASIC_FORM, language: 'en' }, error: null })
    renderForm()
    expect(await screen.findByRole('button', { name: /enviar mis datos/i })).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('es')
    expect(screen.queryByText(/send my details/i)).not.toBeInTheDocument()
  })

  it('un idioma no soportado ("xx") se muestra en español', async () => {
    sb.rpc.mockResolvedValue({ data: { ...BASIC_FORM, language: 'xx' }, error: null })
    renderForm()
    expect(await screen.findByRole('button', { name: /enviar mis datos/i })).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('es')
  })

  it('sin language en la respuesta se mantiene el español por defecto', async () => {
    sb.rpc.mockResolvedValue({ data: BASIC_FORM, error: null })
    renderForm()
    expect(await screen.findByRole('button', { name: /enviar mis datos/i })).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('es')
  })

  it('el selector permite cambiar a inglés sin recargar y el nombre de la empresa no se traduce', async () => {
    sb.rpc.mockResolvedValue({ data: { ...BASIC_FORM, empresa: 'Reformas Norte' }, error: null })
    const user = userEvent.setup()
    renderForm()
    await screen.findByRole('button', { name: /enviar mis datos/i })
    await user.click(screen.getByRole('button', { name: 'English' }))
    expect(await screen.findByRole('button', { name: /send my details/i })).toBeInTheDocument()
    expect(screen.getAllByText('Reformas Norte').length).toBeGreaterThan(0)
  })
})
