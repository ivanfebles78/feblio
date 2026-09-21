import { useState } from 'react'
import { Download, FileText } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { clienteDescargarDocumento } from '../../lib/solicitudes/api'
import { formatBytes } from '../../lib/solicitudes/files'
import type { ClienteVista } from '../../lib/solicitudes/types'

export type ClienteDoc = ClienteVista['documentos'][number]

/**
 * Lista de documentos en el enlace del cliente con botón «Descargar». La descarga pide al servidor
 * una URL firmada de corta duración (el token se valida allí); el navegador nunca ve rutas internas.
 */
export function ClienteDocList({ token, docs, empresaName }: { token: string; docs: ClienteDoc[]; empresaName: string }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function download(d: ClienteDoc) {
    setBusy(d.id)
    setError(null)
    // La pestaña se abre antes de la llamada asíncrona para que el navegador la trate como acción del usuario
    const win = window.open('', '_blank', 'noopener')
    try {
      const { url } = await clienteDescargarDocumento(token, d.id)
      if (win) win.location.href = url
      else window.location.assign(url)
    } catch (e) {
      win?.close()
      setError(e instanceof Error ? e.message : t('requests.docList.unavailable'))
    } finally {
      setBusy(null)
    }
  }

  if (docs.length === 0) return null
  return (
    <div>
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {docs.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-3 px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <FileText className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
              <div className="min-w-0">
                <p className="truncate text-sm text-slate-800">{d.name}</p>
                <p className="text-xs text-slate-500">
                  {formatBytes(d.size_bytes)} · {d.by === 'empresa' ? t('requests.docList.sharedBy', { company: empresaName }) : t('requests.docList.uploadedByYou')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void download(d)}
              disabled={busy === d.id}
              aria-label={t('requests.docList.download', { name: d.name })}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              {busy === d.id ? t('requests.docList.preparing') : t('common.actions.download')}
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
