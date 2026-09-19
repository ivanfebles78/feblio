import { describe, expect, it } from 'vitest'
import { RulesAnalysisProvider, defaultAnalysisProvider } from './analysis'
import { checkFile, clientObjectPath, empresaObjectPath, fileExtension, formatBytes, MAX_FILE_BYTES } from './files'
import { canTransition, empresaActions, PENDING_FOR_EMPRESA, STATUS_LABEL, STATUS_ORDER } from './status'
import { formatRelative } from './format'

describe('RulesAnalysisProvider (cálculo de completitud)', () => {
  const provider = new RulesAnalysisProvider()

  it('solicitud vacía: 0 % y los 6 campos base pendientes', () => {
    const r = provider.analyze({ formData: {}, contact: { name: null, email: null }, templateFields: [], requiredDocuments: [], requisitos: [], documentsByRequisitoKey: [] })
    expect(r.completeness).toBe(0)
    expect(r.missing.map((m) => m.key)).toEqual(['contact_name', 'contact_email', 'needs', 'objectives', 'scope', 'timeline'])
    expect(r.received).toHaveLength(0)
    expect(r.provider).toBe('rules')
  })

  it('cuenta datos de contacto aunque no vengan en form_data', () => {
    const r = provider.analyze({ formData: {}, contact: { name: 'Ana', email: 'ana@x.es' }, templateFields: [], requiredDocuments: [], requisitos: [], documentsByRequisitoKey: [] })
    expect(r.completeness).toBe(33)
    expect(r.received.map((m) => m.key)).toEqual(['contact_name', 'contact_email'])
  })

  it('campos obligatorios de plantilla y documentos requeridos entran en el total (7 de 8 = 88 %)', () => {
    const r = provider.analyze({
      formData: { contact_name: 'Ana', contact_email: 'a@b.es', needs: 'x', objectives: 'y', scope: 'z', timeline: 'ya', superficie: '80' },
      contact: { name: 'Ana', email: 'a@b.es' },
      templateFields: [
        { key: 'superficie', label: 'Superficie', type: 'number', required: true },
        { key: 'opcional', label: 'Opcional', type: 'text', required: false },
      ],
      requiredDocuments: [{ key: 'planos', label: 'Planos', required: true }],
      requisitos: [{ key: 'planos', label: 'Planos', kind: 'document', status: 'pending', required: true }],
      documentsByRequisitoKey: [],
    })
    expect(r.completeness).toBe(88)
    expect(r.missingDocuments).toEqual([{ key: 'planos', label: 'Planos', kind: 'document' }])
    expect(r.missing).toHaveLength(0)
    expect(r.summary).toBe('7 de 8 elementos recibidos')
  })

  it('un documento aportado o un requisito no necesario cuentan como recibidos', () => {
    const base = { formData: {}, contact: { name: null, email: null }, templateFields: [], requiredDocuments: [{ key: 'planos', label: 'Planos', required: true }] }
    const withDoc = provider.analyze({ ...base, requisitos: [], documentsByRequisitoKey: ['planos'] })
    expect(withDoc.received.map((m) => m.key)).toContain('planos')
    const waived = provider.analyze({ ...base, requisitos: [{ key: 'planos', label: 'Planos', kind: 'document', status: 'waived', required: true }], documentsByRequisitoKey: [] })
    expect(waived.received.map((m) => m.key)).toContain('planos')
  })

  it('los requisitos manuales pendientes se suman al total y no se duplican con los de plantilla', () => {
    const r = provider.analyze({
      formData: {},
      contact: { name: null, email: null },
      templateFields: [],
      requiredDocuments: [{ key: 'planos', label: 'Planos', required: true }],
      requisitos: [
        { key: 'planos', label: 'Planos', kind: 'document', status: 'pending', required: true },
        { key: 'licencia', label: 'Licencia', kind: 'document', status: 'pending', required: true },
        { key: 'presupuesto_previo', label: 'Presupuesto previo', kind: 'field', status: 'resolved', required: true },
      ],
      documentsByRequisitoKey: [],
    })
    // 6 base + planos + licencia + presupuesto_previo = 9; solo presupuesto_previo satisfecho
    expect(r.completeness).toBe(11)
    expect(r.missingDocuments.map((m) => m.key)).toEqual(['planos', 'licencia'])
  })

  it('el proveedor por defecto es el de reglas (sin IA simulada)', () => {
    expect(defaultAnalysisProvider.id).toBe('rules')
  })
})

describe('archivos de solicitud', () => {
  it('acepta los tipos permitidos y normaliza el MIME al de la extensión', () => {
    const r = checkFile({ name: 'Plano.PDF', size: 1024, type: 'application/pdf' })
    expect(r).toEqual({ ok: true, ext: 'pdf', mime: 'application/pdf' })
    expect(checkFile({ name: 'foto.jpg', size: 10, type: 'image/jpg' }).ok).toBe(true)
    expect(checkFile({ name: 'foto.jpeg', size: 10, type: '' }).ok).toBe(true)
  })

  it('rechaza extensión no permitida, MIME que no coincide, vacío y tamaño excesivo', () => {
    expect(checkFile({ name: 'script.exe', size: 10, type: 'application/octet-stream' }).message).toMatch(/no permitido/i)
    expect(checkFile({ name: 'doc.pdf', size: 10, type: 'image/png' }).message).toMatch(/no coincide/i)
    expect(checkFile({ name: 'doc.pdf', size: 0, type: 'application/pdf' }).message).toMatch(/vacío/i)
    expect(checkFile({ name: 'doc.pdf', size: MAX_FILE_BYTES + 1, type: 'application/pdf' }).message).toMatch(/10 MB/)
    expect(checkFile({ name: 'sin-extension', size: 10, type: 'application/pdf' }).ok).toBe(false)
  })

  it('genera rutas aisladas por acceso o por empresa/solicitud con nombre físico aleatorio', () => {
    expect(fileExtension('a.b.PNG')).toBe('png')
    expect(clientObjectPath('acc-1', 'pdf')).toMatch(/^sol\/acc-1\/[0-9a-f-]{36}\.pdf$/)
    expect(empresaObjectPath('emp-1', 'sol-1', 'docx')).toMatch(/^emp\/emp-1\/sol-1\/[0-9a-f-]{36}\.docx$/)
    expect(clientObjectPath('acc-1', 'pdf')).not.toBe(clientObjectPath('acc-1', 'pdf'))
  })

  it('formatea tamaños', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB')
  })
})

describe('estados y transiciones (espejo del servidor)', () => {
  it('cubre los 7 estados con etiqueta en español', () => {
    expect(STATUS_ORDER).toHaveLength(7)
    for (const s of STATUS_ORDER) expect(STATUS_LABEL[s]).toBeTruthy()
  })

  it('permite el flujo principal y bloquea saltos inválidos', () => {
    expect(canTransition('draft', 'awaiting_client')).toBe(true)
    expect(canTransition('awaiting_client', 'submitted')).toBe(true)
    expect(canTransition('submitted', 'missing_information')).toBe(true)
    expect(canTransition('missing_information', 'under_review')).toBe(true)
    expect(canTransition('under_review', 'ready_for_scope')).toBe(true)
    expect(canTransition('closed', 'under_review')).toBe(true) // reapertura
    expect(canTransition('draft', 'ready_for_scope')).toBe(false)
    expect(canTransition('closed', 'closed')).toBe(false)
    expect(canTransition('ready_for_scope', 'submitted')).toBe(false)
  })

  it('ofrece acciones coherentes con el estado', () => {
    const keys = (s: Parameters<typeof empresaActions>[0]) => empresaActions(s).map((a) => a.key)
    expect(keys('draft')).toEqual(['link', 'close'])
    expect(keys('submitted')).toEqual(['link', 'review', 'request_info', 'reanalyze', 'ready', 'close'])
    expect(keys('closed')).toEqual(['reopen'])
    expect(keys('ready_for_scope')).not.toContain('ready')
    expect(PENDING_FOR_EMPRESA).toEqual(['submitted', 'under_review', 'missing_information'])
  })
})

describe('formatRelative', () => {
  const now = Date.parse('2026-09-19T12:00:00Z')
  it('describe pasado y futuro en español', () => {
    expect(formatRelative('2026-09-19T11:59:40Z', now)).toBe('ahora mismo')
    expect(formatRelative('2026-09-19T11:30:00Z', now)).toBe('hace 30 min')
    expect(formatRelative('2026-09-19T09:00:00Z', now)).toBe('hace 3 h')
    expect(formatRelative('2026-09-18T11:00:00Z', now)).toBe('ayer')
    expect(formatRelative('2026-09-15T12:00:00Z', now)).toBe('hace 4 días')
    expect(formatRelative('2026-09-24T12:00:00Z', now)).toBe('en 5 días')
    expect(formatRelative(null, now)).toBe('—')
    expect(formatRelative('no-fecha', now)).toBe('—')
  })
})
