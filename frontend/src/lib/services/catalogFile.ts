// Feblio · Importación y exportación del catálogo (CSV y XLSX). Todo ocurre en el navegador: el archivo
// nunca se sube a Storage. ExcelJS se carga dinámicamente solo al usarlo; no se evalúan fórmulas ni macros.
//
// Seguridad al exportar: cualquier celda que empiece por = + - @ (o tabulador/retorno) se prefija con una
// comilla simple para que Excel/Sheets no la interprete como fórmula (CSV formula injection).
import type { ActionItem, ExternalCost, LabelItem, PricingMode, QuestionItem, TaxType } from './types'
import { PRICING_MODES, TAX_TYPES } from './types'

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024
export const MAX_IMPORT_ROWS = 500

export const CATALOG_COLUMNS = [
  'code', 'category', 'name_es', 'name_en', 'description_es', 'description_en', 'active',
  'pricing_mode', 'base_price', 'currency', 'tax_type', 'tax_rate', 'unit', 'min_price', 'max_price',
  'urgency_surcharge_type', 'urgency_surcharge_value', 'external_costs', 'estimated_duration_minutes',
  'prerequisites', 'requires_human_review', 'min_info', 'required_documents', 'client_questions',
  'included_actions', 'excluded_actions', 'valid_from', 'valid_to',
] as const
export type CatalogColumn = (typeof CATALOG_COLUMNS)[number]

const FORMULA_START = /^[=+\-@\t\r]/

/** Evita que una celda se interprete como fórmula al abrir el archivo exportado. */
export function sanitizeCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  return FORMULA_START.test(s) ? `'${s}` : s
}

/** Quita el prefijo defensivo al importar (para que un round-trip no acumule comillas). */
export function unsanitizeCell(value: string): string {
  return value.startsWith("'") && FORMULA_START.test(value.slice(1)) ? value.slice(1) : value
}

export function csvEscape(value: unknown, separator = ';'): string {
  const s = sanitizeCell(value)
  return /["\n\r]/.test(s) || s.includes(separator) ? `"${s.replace(/"/g, '""')}"` : s
}

export function detectSeparator(header: string): ';' | ',' {
  const line = header.split(/\r?\n/)[0] ?? ''
  return (line.match(/;/g)?.length ?? 0) >= (line.match(/,/g)?.length ?? 0) ? ';' : ','
}

/** Divide un CSV respetando comillas dobles y saltos de línea dentro de campos. */
export function parseCsv(text: string, separator?: ';' | ','): string[][] {
  const sep = separator ?? detectSeparator(text)
  const clean = text.replace(/^\ufeff/, '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]
    if (quoted) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += ch
      continue
    }
    if (ch === '"') quoted = true
    else if (ch === sep) {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (ch !== '\r') field += ch
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

/* ------------------------------------------------------------------ */
/* Conversión de celdas ↔ payload de la RPC                            */
/* ------------------------------------------------------------------ */

export function parseBool(v: string | undefined, fallback = false): boolean {
  const s = (v ?? '').trim().toLowerCase()
  if (!s) return fallback
  return ['1', 'true', 'sí', 'si', 'yes', 'y', 'x'].includes(s)
}

/** Acepta 1.234,56 y 1,234.56 y devuelve el texto normalizado con punto decimal (o '' si no hay valor). */
export function parseAmount(v: string | undefined): string {
  const s = (v ?? '').trim().replace(/\s|€|\u00a0/g, '')
  if (!s) return ''
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  let normalized = s
  if (lastComma > -1 && lastDot > -1) {
    normalized = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (lastComma > -1) {
    normalized = s.replace(',', '.')
  }
  return /^-?\d+(\.\d+)?$/.test(normalized) ? normalized : s
}

const splitList = (v: string | undefined): string[] =>
  (v ?? '')
    .split('|')
    .map((x) => unsanitizeCell(x.trim()))
    .filter(Boolean)

/** "Etiqueta ES=Label EN" → [es, en]. */
export function splitBilingual(raw: string): [string, string | null] {
  const idx = raw.indexOf('=')
  if (idx < 0) return [raw.trim(), null]
  return [raw.slice(0, idx).trim(), raw.slice(idx + 1).trim() || null]
}

const joinBilingual = (es: string, en: string | null | undefined) => (en ? `${es}=${en}` : es)

export function itemsToCell(items: LabelItem[] | undefined): string {
  return (items ?? []).map((i) => joinBilingual(i.label_es, i.label_en) + (i.required === false ? ':opcional' : '')).join('|')
}
export function cellToItems(cell: string | undefined, prefix: string): LabelItem[] {
  return splitList(cell).map((raw, n) => {
    const optional = /:opcional$|:optional$/i.test(raw)
    const [es, en] = splitBilingual(raw.replace(/:(opcional|optional)$/i, ''))
    return { key: `${prefix}${n + 1}`, label_es: es, label_en: en, required: !optional }
  })
}

export function questionsToCell(items: QuestionItem[] | undefined): string {
  return (items ?? []).map((q) => `${joinBilingual(q.text_es, q.text_en)}:${q.answer_type}`).join('|')
}
export function cellToQuestions(cell: string | undefined): QuestionItem[] {
  return splitList(cell).map((raw, n) => {
    const m = /^(.*):(text|yes_no|number|date|choice)$/i.exec(raw)
    const body = m ? m[1] : raw
    const [es, en] = splitBilingual(body)
    return { key: `q${n + 1}`, text_es: es, text_en: en, answer_type: (m ? m[2].toLowerCase() : 'text') as QuestionItem['answer_type'], required: true }
  })
}

export function actionsToCell(items: ActionItem[] | undefined): string {
  return (items ?? []).map((a) => joinBilingual(a.es, a.en)).join('|')
}
export function cellToActions(cell: string | undefined): ActionItem[] {
  return splitList(cell).map((raw) => {
    const [es, en] = splitBilingual(raw)
    return { es, en }
  })
}

export function costsToCell(items: ExternalCost[] | undefined): string {
  return (items ?? [])
    .map((c) => `${joinBilingual(c.label_es, c.label_en)}:${c.amount ?? ''}${c.estimated === false ? ':fijo' : ''}`)
    .join('|')
}
export function cellToCosts(cell: string | undefined): ExternalCost[] {
  return splitList(cell).map((raw) => {
    const parts = raw.split(':')
    const [es, en] = splitBilingual(parts[0] ?? '')
    const amount = parseAmount(parts[1])
    return { label_es: es, label_en: en, amount: amount === '' ? null : Number(amount), estimated: !/^fijo$|^fixed$/i.test(parts[2] ?? ''), included: false }
  })
}

export interface ParsedRow {
  index: number
  payload: Record<string, unknown>
  /** Errores detectados en el navegador antes de llamar al servidor. */
  errors: string[]
}

/** Convierte la matriz de celdas (con cabecera) en payloads para `services_import`. */
export function rowsToPayload(matrix: string[][]): { rows: ParsedRow[]; missingColumns: string[] } {
  const header = (matrix[0] ?? []).map((h) => unsanitizeCell(h).trim().toLowerCase().replace(/\s+/g, '_'))
  const missingColumns = ['code', 'name_es'].filter((c) => !header.includes(c))
  const idx = (c: CatalogColumn) => header.indexOf(c)
  const rows: ParsedRow[] = []
  for (let r = 1; r < matrix.length; r++) {
    const cells = matrix[r]
    const get = (c: CatalogColumn) => {
      const i = idx(c)
      return i < 0 ? '' : unsanitizeCell((cells[i] ?? '').trim())
    }
    const errors: string[] = []
    const code = get('code').toUpperCase()
    if (!/^[A-Z0-9][A-Z0-9_-]{1,29}$/.test(code)) errors.push('invalid_code')
    if (!get('name_es')) errors.push('invalid_name')
    const mode = (get('pricing_mode') || 'fixed').toLowerCase()
    if (!PRICING_MODES.includes(mode as PricingMode)) errors.push('invalid_mode')
    const tax = get('tax_type').toUpperCase()
    if (tax && !TAX_TYPES.includes(tax as TaxType)) errors.push('invalid_tax')
    const currency = get('currency').toUpperCase()
    if (currency && !/^[A-Z]{3}$/.test(currency)) errors.push('invalid_currency')

    const price: Record<string, unknown> = {
      pricing_mode: mode,
      base_price: parseAmount(get('base_price')),
      currency,
      tax_type: tax,
      tax_rate: parseAmount(get('tax_rate')),
      unit: get('unit'),
      min_price: parseAmount(get('min_price')),
      max_price: parseAmount(get('max_price')),
      urgency_surcharge_type: (get('urgency_surcharge_type') || 'none').toLowerCase(),
      urgency_surcharge_value: parseAmount(get('urgency_surcharge_value')),
      external_costs: cellToCosts(get('external_costs')),
      valid_from: get('valid_from'),
    }
    rows.push({
      index: r,
      errors,
      payload: {
        code,
        category_code: get('category').toUpperCase(),
        name_es: get('name_es'),
        name_en: get('name_en'),
        description_es: get('description_es'),
        description_en: get('description_en'),
        estimated_duration_minutes: get('estimated_duration_minutes'),
        prerequisites: splitList(get('prerequisites')).map((p) => p.toLowerCase()),
        requires_human_review: parseBool(get('requires_human_review'), true),
        min_info: cellToItems(get('min_info'), 'i'),
        required_documents: cellToItems(get('required_documents'), 'd'),
        client_questions: cellToQuestions(get('client_questions')),
        included_actions: cellToActions(get('included_actions')),
        excluded_actions: cellToActions(get('excluded_actions')),
        price,
      },
    })
  }
  return { rows, missingColumns }
}

/* ------------------------------------------------------------------ */
/* Exportación                                                         */
/* ------------------------------------------------------------------ */

export interface ExportRow {
  code: string
  category_code: string | null
  name_es: string
  name_en: string | null
  description_es: string | null
  description_en: string | null
  is_active: boolean
  pricing_mode: string | null
  base_price: number | null
  currency: string | null
  tax_type: string | null
  tax_rate: number | null
  unit: string | null
  min_price: number | null
  max_price: number | null
  urgency_surcharge_type: string | null
  urgency_surcharge_value: number | null
  external_costs: ExternalCost[] | null
  estimated_duration_minutes: number | null
  prerequisites: string[]
  requires_human_review: boolean
  min_info: LabelItem[]
  required_documents: LabelItem[]
  client_questions: QuestionItem[]
  included_actions: ActionItem[]
  excluded_actions: ActionItem[]
  valid_from: string | null
  valid_to: string | null
}

export function toExportMatrix(rows: ExportRow[]): string[][] {
  const body = rows.map((r) => [
    r.code, r.category_code ?? '', r.name_es, r.name_en ?? '', r.description_es ?? '', r.description_en ?? '',
    r.is_active ? 'true' : 'false', r.pricing_mode ?? '', r.base_price ?? '', r.currency ?? '', r.tax_type ?? '',
    r.tax_rate ?? '', r.unit ?? '', r.min_price ?? '', r.max_price ?? '', r.urgency_surcharge_type ?? '',
    r.urgency_surcharge_value ?? '', costsToCell(r.external_costs ?? []), r.estimated_duration_minutes ?? '',
    (r.prerequisites ?? []).join('|'), r.requires_human_review ? 'true' : 'false',
    itemsToCell(r.min_info), itemsToCell(r.required_documents), questionsToCell(r.client_questions),
    actionsToCell(r.included_actions), actionsToCell(r.excluded_actions), r.valid_from ?? '', r.valid_to ?? '',
  ].map((v) => (v === null || v === undefined ? '' : String(v))))
  return [[...CATALOG_COLUMNS], ...body]
}

export function toCsv(rows: ExportRow[], separator: ';' | ',' = ';'): string {
  return toExportMatrix(rows)
    .map((r) => r.map((c) => csvEscape(c, separator)).join(separator))
    .join('\r\n')
}

/** Plantilla vacía con una fila de ejemplo (sin categorías predefinidas por Feblio). */
export function templateMatrix(): string[][] {
  return [
    [...CATALOG_COLUMNS],
    [
      'SRV-01', 'GENERAL', 'Servicio de ejemplo', 'Sample service', 'Descripción breve', 'Short description', 'true',
      'fixed', '150', 'EUR', 'IVA', '21', '', '', '', 'percent', '20',
      'Tasas administrativas=Administrative fees:35', '90', 'visit|meeting', 'true',
      'Fecha del encargo=Assignment date', 'DNI=ID document|Escritura=Deed:opcional',
      '¿Hay plazo legal?=Is there a legal deadline?:yes_no', 'Redacción del escrito=Drafting',
      'Recursos posteriores=Later appeals', '', '',
    ],
  ]
}

/* ------------------------------------------------------------------ */
/* XLSX (ExcelJS bajo demanda: no entra en el bundle inicial)          */
/* ------------------------------------------------------------------ */

async function exceljs() {
  const mod = await import('exceljs')
  return (mod as unknown as { default?: typeof import('exceljs') }).default ?? mod
}

/** Lee la primera hoja de un XLSX como matriz de texto. No evalúa fórmulas: usa el resultado almacenado. */
export async function readXlsx(buffer: ArrayBuffer): Promise<string[][]> {
  const ExcelJS = await exceljs()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  const ws = wb.worksheets[0]
  const out: string[][] = []
  ws?.eachRow((row) => {
    const cells: string[] = []
    row.eachCell({ includeEmpty: true }, (cell) => {
      const v = cell.value as unknown
      let text = ''
      if (v === null || v === undefined) text = ''
      else if (typeof v === 'object' && v !== null && 'result' in (v as Record<string, unknown>)) {
        // Celda con fórmula: se toma el último resultado guardado, nunca se evalúa la fórmula
        const res = (v as { result?: unknown }).result
        text = res === null || res === undefined ? '' : String(res)
      } else if (typeof v === 'object' && v !== null && 'text' in (v as Record<string, unknown>)) {
        text = String((v as { text: unknown }).text ?? '')
      } else if (v instanceof Date) text = v.toISOString().slice(0, 10)
      else text = String(v)
      cells.push(unsanitizeCell(text.trim()))
    })
    out.push(cells)
  })
  return out.filter((r) => r.some((c) => c.trim() !== ''))
}

export async function toXlsxBlob(matrix: string[][], sheetName = 'Feblio'): Promise<Blob> {
  const ExcelJS = await exceljs()
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(sheetName)
  matrix.forEach((row, i) => {
    const added = ws.addRow(row.map((c) => sanitizeCell(c)))
    if (i === 0) added.font = { bold: true }
  })
  ws.columns.forEach((c) => {
    c.width = 22
  })
  const buffer = await wb.xlsx.writeBuffer()
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

/** Descarga un contenido generado en el navegador (no se sube nada al servidor). */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
