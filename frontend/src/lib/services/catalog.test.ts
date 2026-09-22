// Feblio · Catálogo de servicios: validación, formato de precios, CSV/XLSX (round-trip y protección
// frente a formula injection) y capa de datos. Ninguna prueba toca la red ni escribe archivos reales.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sb = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
}))
vi.mock('../supabase', () => ({ supabase: sb }))

import { resetLanguageForTests, setUserLanguage } from '../../i18n'
import {
  CATALOG_COLUMNS,
  cellToActions,
  cellToCosts,
  cellToItems,
  cellToQuestions,
  csvEscape,
  detectSeparator,
  itemsToCell,
  parseAmount,
  parseBool,
  parseCsv,
  questionsToCell,
  rowsToPayload,
  sanitizeCell,
  templateMatrix,
  toCsv,
  toExportMatrix,
  unsanitizeCell,
  type ExportRow,
} from './catalogFile'
import { normalizeCode, toServicePayload, validatePrice, validateService } from './validation'
import { priceLabel, taxLabel } from './format'
import { canManageCatalog, catalogErrorCode, importServices, listCatalog, upsertService } from './api'
import type { PriceInput, ServiceInput } from './types'

const basePrice: PriceInput = {
  pricing_mode: 'fixed',
  base_price: '120',
  currency: 'EUR',
  tax_type: 'IGIC',
  tax_rate: '7',
  urgency_surcharge_type: 'none',
}

const baseService = (over: Partial<ServiceInput> = {}): ServiceInput => ({
  code: 'DESP-01',
  name_es: 'Despido improcedente',
  prerequisites: [],
  requires_human_review: true,
  min_info: [],
  required_documents: [],
  client_questions: [],
  included_actions: [],
  excluded_actions: [],
  price: basePrice,
  ...over,
})

describe('validación del servicio y del precio', () => {
  beforeEach(() => {
    localStorage.clear()
    resetLanguageForTests()
  })

  it('exige código válido, nombre y precio al crear', () => {
    expect(validateService(baseService(), { requirePrice: true })).toEqual({})
    expect(validateService(baseService({ code: 'mal codigo' }), { requirePrice: true }).code).toBe('services.errors.invalid_code')
    expect(validateService(baseService({ name_es: '' }), { requirePrice: true }).name_es).toBe('services.errors.invalid_name')
    expect(validateService(baseService({ price: undefined }), { requirePrice: true })['price.base_price']).toBe('services.errors.invalid_price')
  })

  it('normaliza el código como lo hace el servidor', () => {
    expect(normalizeCode('desp 01')).toBe('DESP-01')
    expect(normalizeCode('a/b//c')).toBe('A-B-C')
    expect(normalizeCode('x'.repeat(40))).toHaveLength(30)
  })

  it('valida moneda, impuesto, unidad, rango y suplemento', () => {
    expect(validatePrice({ ...basePrice, currency: 'euros' })['price.currency']).toBe('services.errors.invalid_currency')
    expect(validatePrice({ ...basePrice, tax_type: 'EXENTO', tax_rate: '7' })['price.tax_rate']).toBe('services.errors.invalid_tax')
    expect(validatePrice({ ...basePrice, tax_type: 'EXENTO', tax_rate: '0' })).toEqual({})
    expect(validatePrice({ ...basePrice, pricing_mode: 'hourly', unit: '' })['price.unit']).toBe('services.errors.invalid_unit')
    expect(validatePrice({ ...basePrice, min_price: '200', max_price: '100' })['price.max_price']).toBe('services.errors.invalid_range')
    expect(validatePrice({ ...basePrice, base_price: '50', min_price: '80' })['price.base_price']).toBe('services.errors.invalid_range')
    expect(validatePrice({ ...basePrice, urgency_surcharge_type: 'percent', urgency_surcharge_value: '150' })['price.urgency_surcharge_value'])
      .toBe('services.errors.invalid_price')
    expect(validatePrice({ ...basePrice, pricing_mode: 'on_assessment', base_price: '' })).toEqual({})
  })

  it('no permite fechar la vigencia en el pasado', () => {
    const today = new Date('2026-05-10T12:00:00Z')
    expect(validatePrice({ ...basePrice, valid_from: '2026-05-09' }, today)['price.valid_from']).toBe('services.errors.price_past_date')
    expect(validatePrice({ ...basePrice, valid_from: '2026-05-10' }, today)['price.valid_from']).toBeUndefined()
    expect(validatePrice({ ...basePrice, valid_from: '2026-06-01' }, today)['price.valid_from']).toBeUndefined()
  })

  it('el payload solo incluye el precio cuando hay que versionarlo', () => {
    const withPrice = toServicePayload(baseService(), { withPrice: true })
    expect(withPrice.price).toBeTruthy()
    expect(toServicePayload(baseService(), { withPrice: false }).price).toBeUndefined()
    expect((withPrice as { empresa_id?: unknown }).empresa_id).toBeUndefined()
  })
})

describe('formato de precios en el idioma de la interfaz', () => {
  beforeEach(() => {
    localStorage.clear()
    resetLanguageForTests()
  })

  it('muestra fijo, desde, por unidad y bajo valoración', () => {
    expect(priceLabel({ pricing_mode: 'fixed', base_price: 120, currency: 'EUR' })).toMatch(/120/)
    expect(priceLabel({ pricing_mode: 'from', base_price: 120, currency: 'EUR' })).toMatch(/^Desde/)
    expect(priceLabel({ pricing_mode: 'hourly', base_price: 90, currency: 'EUR', unit: 'hora' })).toMatch(/\/ hora$/)
    expect(priceLabel({ pricing_mode: 'on_assessment' })).toBe('Bajo valoración')
    expect(priceLabel({})).toBe('Sin precio vigente')
    expect(taxLabel({ tax_type: 'IGIC', tax_rate: 7 })).toBe('IGIC 7%')
    expect(taxLabel({ tax_type: 'EXENTO' })).toBe('Exento')
  })

  it('cambia con el idioma sin tocar la moneda del servicio', () => {
    setUserLanguage('en')
    expect(priceLabel({ pricing_mode: 'on_assessment' })).toBe('On assessment')
    expect(priceLabel({ pricing_mode: 'from', base_price: 120, currency: 'USD' })).toMatch(/^From .*\$?/)
    expect(taxLabel({ tax_type: 'EXENTO' })).toBe('Exempt')
  })
})

describe('CSV: análisis, números y listas bilingües', () => {
  it('detecta el separador y respeta comillas y saltos de línea', () => {
    expect(detectSeparator('a;b;c')).toBe(';')
    expect(detectSeparator('a,b,c')).toBe(',')
    const rows = parseCsv('code;name_es\r\nA-1;"Servicio ""premium"";con punto y coma"\r\n')
    expect(rows[1]).toEqual(['A-1', 'Servicio "premium";con punto y coma'])
  })

  it('acepta decimales con coma y con punto', () => {
    expect(parseAmount('1.234,56')).toBe('1234.56')
    expect(parseAmount('1,234.56')).toBe('1234.56')
    expect(parseAmount('120')).toBe('120')
    expect(parseAmount('120,5 €')).toBe('120.5')
    expect(parseAmount('')).toBe('')
    expect(parseBool('sí')).toBe(true)
    expect(parseBool('no')).toBe(false)
    expect(parseBool('', true)).toBe(true)
  })

  it('convierte listas bilingües en ambos sentidos', () => {
    const items = cellToItems('DNI=ID document|Escritura:opcional', 'd')
    expect(items).toEqual([
      { key: 'd1', label_es: 'DNI', label_en: 'ID document', required: true },
      { key: 'd2', label_es: 'Escritura', label_en: null, required: false },
    ])
    expect(itemsToCell(items)).toBe('DNI=ID document|Escritura:opcional')
    expect(cellToQuestions('¿Plazo?=Deadline?:yes_no')[0]).toMatchObject({ text_es: '¿Plazo?', text_en: 'Deadline?', answer_type: 'yes_no' })
    expect(questionsToCell(cellToQuestions('¿Plazo?:text'))).toBe('¿Plazo?:text')
    expect(cellToActions('Redacción=Drafting')).toEqual([{ es: 'Redacción', en: 'Drafting' }])
    expect(cellToCosts('Tasas=Fees:35')[0]).toMatchObject({ label_es: 'Tasas', label_en: 'Fees', amount: 35, estimated: true })
  })
})

describe('protección frente a CSV formula injection', () => {
  it('prefija las celdas peligrosas al exportar y las limpia al importar', () => {
    for (const evil of ['=1+1', '+1', '-1', '@SUM(A1)', '\tcmd', '\r=HYPERLINK("http://x")']) {
      const safe = sanitizeCell(evil)
      expect(safe.startsWith("'")).toBe(true)
      expect(unsanitizeCell(safe)).toBe(evil)
    }
    expect(sanitizeCell('Servicio normal')).toBe('Servicio normal')
    expect(csvEscape('=cmd|"/c calc"!A1')).toBe(`"'=cmd|""/c calc""!A1"`)
  })

  it('el CSV exportado nunca empieza una celda por = + - @', () => {
    const row: ExportRow = {
      code: '=DANGER', category_code: '@cat', name_es: '-nombre', name_en: '+en', description_es: '=1+1', description_en: null,
      is_active: true, pricing_mode: 'fixed', base_price: 10, currency: 'EUR', tax_type: 'IVA', tax_rate: 21, unit: null,
      min_price: null, max_price: null, urgency_surcharge_type: 'none', urgency_surcharge_value: 0, external_costs: [],
      estimated_duration_minutes: null, prerequisites: [], requires_human_review: true, min_info: [], required_documents: [],
      client_questions: [], included_actions: [], excluded_actions: [], valid_from: '2026-01-01', valid_to: null,
    }
    const csv = toCsv([row])
    for (const cell of csv.split('\r\n')[1].split(';')) {
      expect(/^"?[=+\-@]/.test(cell)).toBe(false)
    }
  })

  it('un round-trip exportar → importar conserva los valores', () => {
    const row: ExportRow = {
      code: 'SRV-1', category_code: 'LABORAL', name_es: 'Servicio', name_en: 'Service', description_es: 'Desc', description_en: null,
      is_active: true, pricing_mode: 'per_unit', base_price: 35.5, currency: 'EUR', tax_type: 'IGIC', tax_rate: 7, unit: 'm²',
      min_price: null, max_price: null, urgency_surcharge_type: 'percent', urgency_surcharge_value: 20,
      external_costs: [{ label_es: 'Tasas', label_en: 'Fees', amount: 35, estimated: true, included: false }],
      estimated_duration_minutes: 90, prerequisites: ['visit'], requires_human_review: true,
      min_info: [{ key: 'i1', label_es: 'Fecha', label_en: 'Date', required: true }],
      required_documents: [], client_questions: [], included_actions: [{ es: 'Redacción', en: null }], excluded_actions: [],
      valid_from: '2026-01-01', valid_to: null,
    }
    const { rows, missingColumns } = rowsToPayload(parseCsv(toCsv([row])))
    expect(missingColumns).toEqual([])
    expect(rows).toHaveLength(1)
    const p = rows[0].payload as Record<string, unknown>
    expect(p.code).toBe('SRV-1')
    expect(p.category_code).toBe('LABORAL')
    expect((p.price as Record<string, unknown>).base_price).toBe('35.5')
    expect((p.price as Record<string, unknown>).unit).toBe('m²')
    expect((p.price as Record<string, unknown>).urgency_surcharge_value).toBe('20')
    expect(p.prerequisites).toEqual(['visit'])
    expect(p.min_info).toEqual([{ key: 'i1', label_es: 'Fecha', label_en: 'Date', required: true }])
  })

  it('la plantilla tiene todas las columnas y no inventa categorías de Feblio', () => {
    const [header, sample] = templateMatrix()
    expect(header).toEqual([...CATALOG_COLUMNS])
    expect(sample[1]).toBe('GENERAL')
    const joined = templateMatrix().flat().join(' ').toLowerCase()
    for (const forbidden of ['requerimiento', 'presupuestos de obra', 'consultas', 'seguimiento', 'urgencias']) {
      expect(joined).not.toContain(forbidden)
    }
  })

  it('detecta filas inválidas en el navegador antes de llamar al servidor', () => {
    const matrix = [
      ['code', 'name_es', 'pricing_mode', 'base_price', 'currency', 'tax_type'],
      ['OK-1', 'Bien', 'fixed', '10', 'EUR', 'IVA'],
      ['mal codigo', 'Mal', 'fixed', '10', 'EUR', 'IVA'],
      ['OK-2', '', 'fixed', '10', 'EUR', 'IVA'],
      ['OK-3', 'Modo', 'raro', '10', 'EUR', 'IVA'],
      ['OK-4', 'Moneda', 'fixed', '10', 'euros', 'IVA'],
      ['OK-5', 'Impuesto', 'fixed', '10', 'EUR', 'VAT'],
    ]
    const { rows } = rowsToPayload(matrix)
    expect(rows.map((r) => r.errors[0] ?? null)).toEqual([null, 'invalid_code', 'invalid_name', 'invalid_mode', 'invalid_currency', 'invalid_tax'])
  })

  it('avisa de columnas obligatorias que faltan', () => {
    expect(rowsToPayload([['name_es'], ['Solo nombre']]).missingColumns).toEqual(['code'])
  })

  it('la matriz de exportación conserva el orden de columnas del importador', () => {
    expect(toExportMatrix([])[0]).toEqual([...CATALOG_COLUMNS])
  })
})

describe('capa de datos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    resetLanguageForTests()
  })

  it('solo owner y manager pueden gestionar', () => {
    expect(canManageCatalog('owner')).toBe(true)
    expect(canManageCatalog('manager')).toBe(true)
    expect(canManageCatalog('member')).toBe(false)
    expect(canManageCatalog(null)).toBe(false)
  })

  it('traduce los códigos estables del servidor y nunca muestra la clave técnica', async () => {
    sb.rpc.mockResolvedValue({ data: null, error: { message: 'Tu cuenta no puede modificar el catálogo', details: 'catalog_forbidden', code: '42501' } })
    await expect(upsertService(baseService())).rejects.toMatchObject({ code: 'catalog_forbidden', message: 'Tu cuenta no puede modificar el catálogo.' })
    setUserLanguage('en')
    sb.rpc.mockResolvedValue({ data: null, error: { message: 'x', details: 'service_in_use', code: '22023' } })
    await expect(upsertService(baseService())).rejects.toThrow(/can only be deactivated/)
    expect(catalogErrorCode({ details: 'services.errors.x' })).toBeNull()
    expect(catalogErrorCode({ details: 'price_overlap' })).toBe('price_overlap')
  })

  it('la previsualización de importación no confirma nada', async () => {
    sb.rpc.mockResolvedValue({ data: { ok: true, committed: false, total: 1, errors: 0, rows: [] }, error: null })
    const res = await importServices([{ code: 'A-1' }], false)
    expect(sb.rpc).toHaveBeenCalledWith('services_import', { p_rows: [{ code: 'A-1' }], p_commit: false })
    expect(res.committed).toBe(false)
  })

  it('el listado usa la vista con la versión vigente y no envía empresa_id', async () => {
    const order2 = vi.fn().mockResolvedValue({ data: [{ id: 's1' }], error: null })
    const order1 = vi.fn().mockReturnValue({ order: order2 })
    const select = vi.fn().mockReturnValue({ order: order1 })
    sb.from.mockReturnValue({ select })
    const rows = await listCatalog()
    expect(sb.from).toHaveBeenCalledWith('services_catalog_v')
    expect(select).toHaveBeenCalledWith('*')
    expect(rows).toHaveLength(1)
  })
})
