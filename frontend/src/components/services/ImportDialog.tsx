// Feblio · Importación del catálogo desde CSV o XLSX. El archivo se procesa en el navegador (nunca se
// sube a Storage), se previsualiza siempre y la confirmación es atómica: si una fila falla, no se guarda
// ninguna. ExcelJS se carga dinámicamente solo si el archivo es XLSX.
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileSpreadsheet, Upload } from 'lucide-react'
import { Modal } from '../v2/Modal'
import { Button } from '../v2/Button'
import i18n from '../../i18n'
import {
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  parseCsv,
  rowsToPayload,
  templateMatrix,
  toCsv,
  downloadBlob,
} from '../../lib/services/catalogFile'
import type { ImportResult } from '../../lib/services/types'

export interface ImportDialogProps {
  open: boolean
  busy?: boolean
  onClose: () => void
  /** Llama a `services_import` (commit=false previsualiza; true confirma). */
  onImport: (rows: unknown[], commit: boolean) => Promise<ImportResult>
  onDone: () => void
}

type Stage = 'choose' | 'preview' | 'done'

/** Lee el archivo en el navegador (con respaldo en FileReader para navegadores y entornos antiguos). */
async function readFile(file: File, as: 'text' | 'buffer'): Promise<string | ArrayBuffer> {
  if (as === 'text' && typeof file.text === 'function') return file.text()
  if (as === 'buffer' && typeof file.arrayBuffer === 'function') return file.arrayBuffer()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('read_error'))
    reader.onload = () => resolve(reader.result as string | ArrayBuffer)
    if (as === 'text') reader.readAsText(file)
    else reader.readAsArrayBuffer(file)
  })
}

const ACTION_STYLES: Record<string, string> = {
  create: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  update: 'bg-sky-50 text-sky-700 ring-sky-200',
  new_price_version: 'bg-amber-50 text-amber-700 ring-amber-200',
  error: 'bg-red-50 text-red-700 ring-red-200',
}

export function ImportDialog({ open, busy, onClose, onImport, onDone }: ImportDialogProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [stage, setStage] = useState<Stage>('choose')
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<unknown[]>([])
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)

  function reset() {
    setStage('choose')
    setFileName('')
    setRows([])
    setResult(null)
    setError(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function onFile(file: File) {
    setError(null)
    if (file.size > MAX_IMPORT_BYTES) {
      setError(t('services.import.tooLarge', { mb: Math.round(MAX_IMPORT_BYTES / (1024 * 1024)) }))
      return
    }
    setWorking(true)
    try {
      let matrix: string[][]
      if (/\.xlsx?$/i.test(file.name)) {
        const { readXlsx } = await import('../../lib/services/catalogFile')
        matrix = await readXlsx((await readFile(file, 'buffer')) as ArrayBuffer)
      } else {
        matrix = parseCsv((await readFile(file, 'text')) as string)
      }
      if (matrix.length < 2) {
        setError(t('services.import.empty'))
        return
      }
      if (matrix.length - 1 > MAX_IMPORT_ROWS) {
        setError(t('services.import.tooManyRows', { rows: MAX_IMPORT_ROWS }))
        return
      }
      const { rows: parsed, missingColumns } = rowsToPayload(matrix)
      if (missingColumns.length) {
        setError(t('services.import.missingColumns', { columns: missingColumns.join(', ') }))
        return
      }
      const localErrors = parsed.filter((r) => r.errors.length > 0)
      const payloads = parsed.map((r) => r.payload)
      setFileName(file.name)
      setRows(payloads)
      if (localErrors.length) {
        // Errores detectados en el navegador: se muestran sin llamar al servidor
        setResult({
          ok: false,
          committed: false,
          total: parsed.length,
          errors: localErrors.length,
          rows: parsed.map((r) => ({
            index: r.index,
            code: String((r.payload as { code?: string }).code ?? ''),
            action: r.errors.length ? 'error' : 'create',
            error: r.errors[0] ?? null,
          })),
        })
        setStage('preview')
        return
      }
      setResult(await onImport(payloads, false))
      setStage('preview')
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : t('services.import.unreadable'))
    } finally {
      setWorking(false)
    }
  }

  async function confirm() {
    setWorking(true)
    setError(null)
    try {
      const res = await onImport(rows, true)
      setResult(res)
      setStage(res.committed ? 'done' : 'preview')
      if (res.committed) onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('services.errors.import'))
    } finally {
      setWorking(false)
    }
  }

  const errorLabel = (code: string | null) =>
    code && i18n.exists(`services.errors.${code}`) ? t(`services.errors.${code}`) : (code ?? '')

  return (
    <Modal
      open={open}
      title={t('services.import.title')}
      description={t('services.import.intro')}
      onClose={() => {
        reset()
        onClose()
      }}
      size="lg"
      footer={
        <>
          {stage === 'preview' && (
            <Button variant="ghost" onClick={reset}>
              {t('services.import.again')}
            </Button>
          )}
          {stage === 'preview' && result?.ok && (
            <Button onClick={confirm} disabled={working || busy}>
              {t('services.import.confirm')}
            </Button>
          )}
          {stage !== 'preview' && (
            <Button
              onClick={() => {
                reset()
                onClose()
              }}
            >
              {t('services.actions.close')}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">{t('services.import.limits', { mb: Math.round(MAX_IMPORT_BYTES / (1024 * 1024)), rows: MAX_IMPORT_ROWS })}</p>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            {error}
          </p>
        )}

        {stage === 'choose' && (
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center">
            <FileSpreadsheet className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
            <label className="mt-3 block">
              <span className="sr-only">{t('services.import.choose')}</span>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="mx-auto block w-full max-w-sm cursor-pointer rounded-lg border border-slate-300 p-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void onFile(f)
                }}
              />
            </label>
            <p className="mt-3 text-sm text-slate-500">{t('services.import.templateHint')}</p>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => downloadBlob(new Blob([toCsv([])], { type: 'text/csv;charset=utf-8' }), 'feblio-servicios-plantilla.csv')}
              >
                {t('services.actions.templateCsv')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  const { toXlsxBlob } = await import('../../lib/services/catalogFile')
                  downloadBlob(await toXlsxBlob(templateMatrix()), 'feblio-servicios-plantilla.xlsx')
                }}
              >
                {t('services.actions.templateXlsx')}
              </Button>
            </div>
          </div>
        )}

        {stage === 'preview' && result && (
          <div>
            <p className="text-sm text-slate-600">
              <Upload className="mr-1 inline h-4 w-4 align-text-bottom" aria-hidden="true" />
              {fileName} · {t('services.import.previewIntro')}
            </p>
            {!result.ok && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">{t('services.import.blocked')}</p>}
            <div className="mt-3 max-h-72 overflow-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[28rem] text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">{t('services.import.row')}</th>
                    <th scope="col" className="px-3 py-2 font-medium">{t('services.columns.code')}</th>
                    <th scope="col" className="px-3 py-2 font-medium">{t('services.import.action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r) => (
                    <tr key={r.index} className="border-t border-slate-100">
                      <td className="px-3 py-1.5 text-slate-500">{r.index}</td>
                      <td className="px-3 py-1.5 font-mono text-xs">{r.code}</td>
                      <td className="px-3 py-1.5">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${ACTION_STYLES[r.action]}`}>
                          {t(`services.import.actions.${r.action}`)}
                        </span>
                        {r.error && <span className="ml-2 text-xs text-red-600">{errorLabel(r.error)}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {stage === 'done' && result && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
            {t('services.import.done', { created: result.created ?? 0, updated: result.updated ?? 0, versions: result.new_price_versions ?? 0 })}
          </p>
        )}
      </div>
    </Modal>
  )
}
