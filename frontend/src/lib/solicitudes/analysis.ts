import type { FormDocDef, FormFieldDef } from '../onboarding/types'
import type { AnalysisItem, RequisitoKind, RequisitoStatus } from './types'

/**
 * Análisis de suficiencia desacoplado. El servidor (sol_analizar, provider 'rules') es la
 * fuente de verdad y guarda cada versión; este módulo replica las mismas reglas para
 * mostrar el progreso en el formulario del cliente sin llamadas adicionales, y define el
 * contrato que un futuro proveedor de IA deberá cumplir (sin afirmar que exista todavía).
 */
export interface AnalysisInput {
  formData: Record<string, unknown>
  contact: { name: string | null; email: string | null }
  templateFields: FormFieldDef[]
  requiredDocuments: FormDocDef[]
  requisitos: { key: string; label: string; kind: RequisitoKind; status: RequisitoStatus; required: boolean }[]
  /** requisito_id (o key) de los documentos ya aportados */
  documentsByRequisitoKey: string[]
}

export interface AnalysisResult {
  provider: string
  completeness: number
  received: AnalysisItem[]
  missing: AnalysisItem[]
  missingDocuments: AnalysisItem[]
  summary: string
}

export interface AnalysisProvider {
  readonly id: string
  analyze(input: AnalysisInput): Promise<AnalysisResult> | AnalysisResult
}

export const BASE_FIELDS: AnalysisItem[] = [
  { key: 'contact_name', label: 'Nombre de contacto' },
  { key: 'contact_email', label: 'Correo electrónico' },
  { key: 'needs', label: 'Qué necesita' },
  { key: 'objectives', label: 'Objetivos' },
  { key: 'scope', label: 'Alcance' },
  { key: 'timeline', label: 'Plazos' },
]

const filled = (v: unknown) => typeof v === 'string' ? v.trim().length > 0 : v !== null && v !== undefined && v !== ''
const DONE: RequisitoStatus[] = ['received', 'resolved', 'waived']

/** Reglas deterministas: campos base + campos/documentos obligatorios de la plantilla + requisitos pedidos. */
export class RulesAnalysisProvider implements AnalysisProvider {
  readonly id = 'rules'

  analyze(input: AnalysisInput): AnalysisResult {
    const received: AnalysisItem[] = []
    const missing: AnalysisItem[] = []
    const missingDocuments: AnalysisItem[] = []
    let total = 0
    let ok = 0
    const consider = (item: AnalysisItem, satisfied: boolean, doc = false) => {
      total += 1
      if (satisfied) {
        ok += 1
        received.push(item)
      } else if (doc) missingDocuments.push(item)
      else missing.push(item)
    }
    for (const f of BASE_FIELDS) {
      const value = input.formData[f.key] ?? (f.key === 'contact_name' ? input.contact.name : f.key === 'contact_email' ? input.contact.email : null)
      consider(f, filled(value))
    }
    const templateKeys = new Set<string>()
    for (const f of input.templateFields) {
      templateKeys.add(f.key)
      if (f.required) consider({ key: f.key, label: f.label }, filled(input.formData[f.key]))
    }
    for (const d of input.requiredDocuments) {
      templateKeys.add(d.key)
      if (d.required !== false) {
        const req = input.requisitos.find((r) => r.key === d.key)
        const has = input.documentsByRequisitoKey.includes(d.key) || (!!req && DONE.includes(req.status))
        consider({ key: d.key, label: d.label, kind: 'document' }, has, true)
      }
    }
    const baseKeys = new Set(BASE_FIELDS.map((b) => b.key))
    for (const r of input.requisitos) {
      if (!r.required || templateKeys.has(r.key) || baseKeys.has(r.key)) continue
      consider({ key: r.key, label: r.label, kind: r.kind }, DONE.includes(r.status), r.kind === 'document')
    }
    const completeness = total === 0 ? 100 : Math.round((100 * ok) / total)
    return { provider: this.id, completeness, received, missing, missingDocuments, summary: `${ok} de ${total} elementos recibidos` }
  }
}

export const defaultAnalysisProvider: AnalysisProvider = new RulesAnalysisProvider()
