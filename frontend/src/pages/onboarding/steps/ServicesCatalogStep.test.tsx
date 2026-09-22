// Feblio · Paso/pestaña del catálogo: permisos por rol, filtros, acciones y paridad es/en.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const api = vi.hoisted(() => ({
  listCatalog: vi.fn(),
  listCategories: vi.fn(),
  listPriceHistory: vi.fn(),
  currentCompanyRole: vi.fn(),
  upsertService: vi.fn(),
  setServiceActive: vi.fn(),
  deleteService: vi.fn(),
  importServices: vi.fn(),
  upsertCategory: vi.fn(),
  deleteCategory: vi.fn(),
}))
vi.mock('../../../lib/services/api', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/services/api')>('../../../lib/services/api')
  return { ...actual, ...api }
})
vi.mock('../../../lib/onboarding/OnboardingContext', () => ({
  useOnboarding: () => ({
    snapshot: {
      empresa: { id: 'e1', currency: 'EUR', language: 'es' },
      billing: { currency: 'EUR', tax_type: 'IGIC', tax_rate: 7 },
    },
  }),
}))

import { resetLanguageForTests, setUserLanguage } from '../../../i18n'
import { ServicesCatalogStep } from './ServicesCatalogStep'
import type { CatalogRow, ServiceCategory } from '../../../lib/services/types'

const category: ServiceCategory = { id: 'c1', empresa_id: 'e1', code: 'LABORAL', name_es: 'Derecho laboral', name_en: 'Labour law', sort_order: 0, is_active: true }

const row = (over: Partial<CatalogRow> = {}): CatalogRow =>
  ({
    id: 's1', empresa_id: 'e1', code: 'DESP-01', category_id: 'c1', category_code: 'LABORAL',
    category_name_es: 'Derecho laboral', category_name_en: 'Labour law',
    name_es: 'Despido improcedente', name_en: 'Unfair dismissal', description_es: null, description_en: null,
    is_active: true, effective_from: null, effective_to: null, estimated_duration_minutes: 90,
    prerequisites: [], requires_human_review: true, min_info: [], required_documents: [], client_questions: [],
    included_actions: [], excluded_actions: [], usage_count: 0, sort_order: 0,
    created_at: '2026-01-01', updated_at: '2026-01-01',
    price_version_id: 'v2', version_no: 2, pricing_mode: 'fixed', base_price: 450, currency: 'EUR',
    tax_type: 'IGIC', tax_rate: 7, tax_note: null, unit: null, min_price: null, max_price: null,
    urgency_surcharge_type: 'none', urgency_surcharge_value: 0, external_costs: [],
    valid_from: '2026-01-01', valid_to: null, next_price_version_id: null, next_valid_from: null,
    next_pricing_mode: null, next_base_price: null,
    ...over,
  }) as CatalogRow

const renderStep = () => render(<ServicesCatalogStep mode="settings" errors={{}} showErrors={false} />)

describe('catálogo de servicios (paso y pestaña)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    resetLanguageForTests()
    api.listCatalog.mockResolvedValue([row()])
    api.listCategories.mockResolvedValue([category])
    api.currentCompanyRole.mockResolvedValue('manager')
    api.listPriceHistory.mockResolvedValue([])
  })

  it('un manager ve las acciones de escritura y el precio vigente', async () => {
    renderStep()
    expect(await screen.findByText('Despido improcedente')).toBeInTheDocument()
    expect(screen.getByText(/450/)).toBeInTheDocument()
    expect(screen.getByText('IGIC 7%')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nuevo servicio' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Importar' })).toBeInTheDocument()
    expect(screen.queryByText(/solo consultar|no modificarlo/i)).not.toBeInTheDocument()
  })

  it('un member solo consulta y exporta', async () => {
    api.currentCompanyRole.mockResolvedValue('member')
    renderStep()
    expect(await screen.findByText(/no modificarlo/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Nuevo servicio' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Importar' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Exportar CSV' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Historial de precios' })).toBeInTheDocument()
  })

  it('filtra por texto, estado y categoría', async () => {
    const user = userEvent.setup()
    api.listCatalog.mockResolvedValue([row(), row({ id: 's2', code: 'REF-01', name_es: 'Reforma', category_id: null, category_code: null, category_name_es: null, is_active: false })])
    renderStep()
    await screen.findByText('Despido improcedente')
    await user.type(screen.getByLabelText(/Buscar por código/), 'REF')
    await waitFor(() => expect(screen.queryByText('Despido improcedente')).not.toBeInTheDocument())
    expect(screen.getByText('Reforma')).toBeInTheDocument()
    await user.clear(screen.getByLabelText(/Buscar por código/))
    await user.selectOptions(screen.getByLabelText('Estado'), 'inactive')
    await waitFor(() => expect(screen.queryByText('Despido improcedente')).not.toBeInTheDocument())
    await user.selectOptions(screen.getByLabelText('Estado'), 'active')
    expect(await screen.findByText('Despido improcedente')).toBeInTheDocument()
  })

  it('avisa del cambio de precio programado', async () => {
    api.listCatalog.mockResolvedValue([row({ next_price_version_id: 'v3', next_valid_from: '2026-12-01', next_base_price: 500 })])
    renderStep()
    expect(await screen.findByText(/Cambio programado/)).toBeInTheDocument()
  })

  it('al editar el precio el editor avisa de que se creará una versión', async () => {
    const user = userEvent.setup()
    renderStep()
    await screen.findByText('Despido improcedente')
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    const dialog = await screen.findByRole('dialog')
    const price = within(dialog).getByLabelText('Precio base')
    await user.clear(price)
    await user.type(price, '500')
    expect(await within(dialog).findByText(/se creará una versión nueva/i)).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/Código interno/)).toBeDisabled()
  })

  it('pide confirmación antes de desactivar y llama a la RPC', async () => {
    const user = userEvent.setup()
    api.setServiceActive.mockResolvedValue({ ok: true, is_active: false })
    renderStep()
    await screen.findByText('Despido improcedente')
    await user.click(screen.getByRole('button', { name: 'Desactivar' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Desactivar' }))
    await waitFor(() => expect(api.setServiceActive).toHaveBeenCalledWith('s1', false))
  })

  it('un servicio ya utilizado avisa de que solo puede desactivarse', async () => {
    const user = userEvent.setup()
    api.listCatalog.mockResolvedValue([row({ usage_count: 3 })])
    renderStep()
    await screen.findByText('Despido improcedente')
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    expect(await screen.findByText(/solo puede desactivarse/)).toBeInTheDocument()
  })

  it('la importación previsualiza antes de confirmar', async () => {
    const user = userEvent.setup({ applyAccept: false })
    api.importServices.mockResolvedValue({ ok: true, committed: false, total: 1, errors: 0, rows: [{ index: 1, code: 'IMP-01', action: 'create', error: null }] })
    renderStep()
    await screen.findByText('Despido improcedente')
    await user.click(screen.getByRole('button', { name: 'Importar' }))
    const dialog = await screen.findByRole('dialog')
    const csv = 'code;name_es;pricing_mode;base_price;currency;tax_type\r\nIMP-01;Importado;fixed;35;EUR;IGIC\r\n'
    await user.upload(within(dialog).getByLabelText('Elegir archivo'), new File([csv], 'catalogo.csv', { type: 'text/csv' }))
    expect(await within(dialog).findByText('Se creará')).toBeInTheDocument()
    expect(api.importServices).toHaveBeenCalledWith(expect.any(Array), false)
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar importación' }))
    await waitFor(() => expect(api.importServices).toHaveBeenLastCalledWith(expect.any(Array), true))
  })

  it('con errores en el archivo no se puede confirmar', async () => {
    const user = userEvent.setup({ applyAccept: false })
    renderStep()
    await screen.findByText('Despido improcedente')
    await user.click(screen.getByRole('button', { name: 'Importar' }))
    const dialog = await screen.findByRole('dialog')
    const csv = 'code;name_es\r\nmal codigo;Servicio\r\n'
    await user.upload(within(dialog).getByLabelText('Elegir archivo'), new File([csv], 'catalogo.csv', { type: 'text/csv' }))
    expect(await within(dialog).findByText(/ninguna fila se ha guardado/)).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Confirmar importación' })).not.toBeInTheDocument()
    expect(api.importServices).not.toHaveBeenCalled()
  })

  it('se muestra íntegramente en inglés al cambiar de idioma', async () => {
    setUserLanguage('en')
    renderStep()
    expect(await screen.findByText('Services and prices')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New service' })).toBeInTheDocument()
    expect(screen.getByText('Unfair dismissal')).toBeInTheDocument()
    expect(screen.getAllByText('Labour law').length).toBeGreaterThan(0)
    expect(document.body.textContent).not.toMatch(/services\.[a-z]+\./)
  })

  it('la tabla es accesible: cabeceras y acciones con nombre', async () => {
    renderStep()
    await screen.findByText('Despido improcedente')
    expect(screen.getByRole('columnheader', { name: 'Código' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Precio vigente' })).toBeInTheDocument()
    for (const name of ['Historial de precios', 'Editar', 'Desactivar', 'Eliminar']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
  })
})
