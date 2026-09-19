import { useId, useRef, useState } from 'react'
import { Paperclip, Upload } from 'lucide-react'
import { ACCEPT_ATTR, checkFile, formatBytes, MAX_FILE_BYTES } from '../../lib/solicitudes/files'

export interface FileUploaderProps {
  /** Sube el archivo ya validado; debe lanzar error si falla. */
  onUpload: (file: File, mime: string, ext: string) => Promise<void>
  disabled?: boolean
  label?: string
  compact?: boolean
}

/**
 * Selector de archivo accesible con validación en cliente (extensión, MIME, tamaño) antes de subir.
 * La validación definitiva la hace el servidor (sol_validar_archivo).
 */
export function FileUploader({ onUpload, disabled = false, label = 'Adjuntar archivo', compact = false }: FileUploaderProps) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handle(files: FileList | null) {
    if (!files || files.length === 0) return
    setError(null)
    for (const file of Array.from(files)) {
      const check = checkFile(file)
      if (!check.ok) {
        setError(`${file.name}: ${check.message}`)
        continue
      }
      setBusy(file.name)
      try {
        await onUpload(file, check.mime, check.ext)
      } catch (e) {
        setError(`${file.name}: ${e instanceof Error ? e.message : 'no se pudo subir.'}`)
      } finally {
        setBusy(null)
      }
    }
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div>
      <input ref={inputRef} id={id} type="file" accept={ACCEPT_ATTR} multiple className="sr-only" disabled={disabled || busy !== null} onChange={(e) => void handle(e.target.files)} aria-describedby={`${id}-hint`} />
      <label
        htmlFor={id}
        className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed font-medium transition-colors focus-within:ring-2 focus-within:ring-brand-500 ${
          compact ? 'px-3 py-1.5 text-xs' : 'px-4 py-2.5 text-sm'
        } ${disabled || busy ? 'cursor-not-allowed border-slate-200 text-slate-400' : 'border-slate-300 text-slate-700 hover:border-brand-400 hover:bg-brand-50/40'}`}
      >
        {busy ? <Upload className="h-4 w-4 animate-pulse" aria-hidden="true" /> : <Paperclip className="h-4 w-4" aria-hidden="true" />}
        {busy ? `Subiendo ${busy}…` : label}
      </label>
      <p id={`${id}-hint`} className="mt-1 text-xs text-slate-500">
        PDF, Word, Excel, PNG o JPG · máximo {formatBytes(MAX_FILE_BYTES)} por archivo.
      </p>
      {error && (
        <p className="mt-1 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
