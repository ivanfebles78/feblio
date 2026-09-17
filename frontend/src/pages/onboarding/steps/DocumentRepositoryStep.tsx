import { useCallback, useMemo, useState } from 'react'
import { FolderTree, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { RadioCards, TextField } from '../../../components/forms/Field'
import { IntegrationCard } from '../../../components/onboarding/IntegrationCard'
import { useOnboarding } from '../../../lib/onboarding/OnboardingContext'
import { useIntegration } from '../../../lib/integrations/useIntegration'
import { adapterById } from '../../../lib/integrations/adapters'
import { listRemoteFolders } from '../../../lib/integrations/api'
import { saveFolderTemplate } from '../../../lib/onboarding/api'
import { DEFAULT_FOLDERS, DEFAULT_ROOT_PATTERN, defaultRepositoryData } from '../../../lib/onboarding/steps'
import { onboardingStepPath } from '../../../lib/routing'
import type { RepositoryProvider, RepositoryStepData } from '../../../lib/onboarding/types'
import type { StepProps } from './types'

const FOLDER_RE = /^[\w\-. ]{1,60}$/

export function DocumentRepositoryStep({ errors, showErrors, mode }: StepProps) {
  const ctx = useOnboarding()
  const data = ctx.getStepData<RepositoryStepData & Record<string, unknown>>('repository', defaultRepositoryData as () => RepositoryStepData & Record<string, unknown>)
  const integration = useIntegration('document_repository')
  const empresaId = ctx.snapshot?.empresa.id ?? ''
  const template = ctx.snapshot?.folder_templates.find((f) => f.is_default) ?? ctx.snapshot?.folder_templates[0]
  const [folders, setFolders] = useState<string[]>(template?.folders ?? DEFAULT_FOLDERS)
  const [rootPattern, setRootPattern] = useState(template?.root_pattern ?? DEFAULT_ROOT_PATTERN)
  const [newFolder, setNewFolder] = useState('')
  const [folderError, setFolderError] = useState<string | null>(null)
  const [remoteFolders, setRemoteFolders] = useState<{ id: string; name: string }[] | null>(null)
  const [loadingRemote, setLoadingRemote] = useState(false)

  const set = useCallback(
    (patch: Partial<RepositoryStepData>) => ctx.updateStepData('repository', patch, defaultRepositoryData as () => RepositoryStepData & Record<string, unknown>),
    [ctx],
  )

  const returnTo = mode === 'wizard' ? onboardingStepPath('repository') : '/empresa?settings=integrations'
  const settings = useMemo(
    () => ({ root_folder_id: data.root_folder_id ?? null, root_folder_name: data.root_folder_name ?? null, folder_template_id: template?.id ?? null }),
    [data.root_folder_id, data.root_folder_name, template?.id],
  )

  async function choose(provider: RepositoryProvider) {
    set({ provider })
    if (provider === 'later') {
      await integration.configure(integration.connection?.provider ?? 'feblio_storage', 'not_configured', {})
      return
    }
    if (provider === 'feblio_storage') {
      const ok = await integration.configure('feblio_storage', 'connected', settings, 'empresa-docs/' + empresaId.slice(0, 8) + '…', 'Almacenamiento interno')
      if (ok) await integration.test('feblio_storage')
      return
    }
    // Externos: quedan sin configurar hasta que OAuth confirme; el usuario pulsa "Conectar"
    if (integration.connection?.provider !== provider) {
      await integration.configure(provider, 'not_configured', settings)
    }
  }

  async function loadRemote() {
    setLoadingRemote(true)
    const res = await listRemoteFolders('document_repository')
    setRemoteFolders(res.ok && res.folders ? res.folders : [])
    if (!res.ok) integration.setResult({ ok: false, message: res.message ?? 'No se pudieron listar las carpetas.', checkedAt: new Date().toISOString() })
    setLoadingRemote(false)
  }

  function persistTemplate(nextFolders: string[], nextRoot: string) {
    ctx.scheduleSave('repository:template', async () => {
      await saveFolderTemplate({ id: template?.id, empresa_id: empresaId, name: template?.name ?? 'Estructura estándar Feblio', root_pattern: nextRoot, folders: nextFolders, is_default: true })
      ctx.patchSnapshot((s) => ({
        ...s,
        folder_templates: template
          ? s.folder_templates.map((f) => (f.id === template.id ? { ...f, folders: nextFolders, root_pattern: nextRoot } : f))
          : s.folder_templates,
      }))
    })
  }

  function addFolder() {
    const v = newFolder.trim()
    if (!FOLDER_RE.test(v)) {
      setFolderError('Usa letras, números, guiones o puntos (máx. 60).')
      return
    }
    if (folders.includes(v)) {
      setFolderError('Esa carpeta ya existe.')
      return
    }
    const next = [...folders, v]
    setFolders(next)
    setNewFolder('')
    setFolderError(null)
    persistTemplate(next, rootPattern)
  }

  function removeFolder(f: string) {
    const next = folders.filter((x) => x !== f)
    setFolders(next)
    persistTemplate(next, rootPattern)
  }

  function resetFolders() {
    setFolders(DEFAULT_FOLDERS)
    setRootPattern(DEFAULT_ROOT_PATTERN)
    persistTemplate(DEFAULT_FOLDERS, DEFAULT_ROOT_PATTERN)
  }

  const err = (k: string) => (showErrors ? errors[k] : undefined)
  const chosenAdapter = data.provider !== 'later' ? adapterById(data.provider) : undefined

  return (
    <div className="space-y-8">
      <RadioCards<RepositoryProvider>
        legend="¿Dónde se guardarán los documentos de tus proyectos?"
        name="repository_provider"
        value={data.provider}
        onChange={choose}
        error={err('provider')}
        options={[
          { value: 'feblio_storage', label: 'Almacenamiento interno de Feblio', description: 'Recomendado para empezar. Sin configuración, cifrado y aislado por empresa.', badge: <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">Listo ya</span> },
          { value: 'google_drive', label: 'Google Drive', description: 'Carpeta raíz o unidad compartida de tu Google Workspace.' },
          { value: 'onedrive', label: 'Microsoft OneDrive / SharePoint', description: 'OneDrive o biblioteca de documentos de SharePoint.' },
          { value: 'later', label: 'Configurar más adelante', description: 'Podrás elegir después, pero es necesario para activar Feblio.' },
        ]}
      />

      {chosenAdapter && (
        <IntegrationCard adapter={chosenAdapter} actions={integration} settings={settings} returnTo={returnTo}>
          {(data.provider === 'google_drive' || data.provider === 'onedrive') && integration.connection?.status === 'connected' && (
            <div className="rounded-xl border border-slate-200 p-3">
              <p className="text-xs font-medium text-slate-600">Carpeta raíz o unidad compartida</p>
              <p className="text-xs text-slate-500">Actual: {data.root_folder_name ?? 'raíz de la cuenta'}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={loadRemote} disabled={loadingRemote} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                  {loadingRemote ? 'Cargando…' : 'Elegir carpeta'}
                </button>
                {data.root_folder_id && (
                  <button type="button" onClick={() => set({ root_folder_id: undefined, root_folder_name: undefined })} className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100">
                    Usar la raíz
                  </button>
                )}
              </div>
              {remoteFolders && (
                <ul className="mt-2 max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-100" aria-label="Carpetas disponibles">
                  {remoteFolders.length === 0 && <li className="px-3 py-2 text-xs text-slate-400">No hay carpetas en la raíz.</li>}
                  {remoteFolders.map((f) => (
                    <li key={f.id}>
                      <button type="button" onClick={() => set({ root_folder_id: f.id, root_folder_name: f.name })} className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-brand-50 ${data.root_folder_id === f.id ? 'bg-brand-50 font-semibold text-brand-700' : 'text-slate-700'}`}>
                        <FolderTree className="h-3.5 w-3.5 shrink-0 text-brand-500" aria-hidden="true" /> {f.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </IntegrationCard>
      )}

      {data.provider !== 'later' && (
        <section aria-labelledby="sec-folders">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="sec-folders" className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <FolderTree className="h-4 w-4 text-brand-600" aria-hidden="true" /> Plantilla de carpetas por proyecto
            </h2>
            <button type="button" onClick={resetFolders} className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700">
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Restaurar estándar
            </button>
          </div>
          <TextField
            label="Ruta raíz"
            value={rootPattern}
            onChange={(e) => {
              setRootPattern(e.target.value)
              persistTemplate(folders, e.target.value)
            }}
            hint="Variables disponibles: {codigo_proyecto}, {nombre_cliente}, {anio}."
            spellCheck={false}
          />
          <ol className="mt-3 space-y-1.5 rounded-xl border border-slate-200 bg-slate-50/60 p-3 font-mono text-xs text-slate-700" aria-label="Subcarpetas">
            {folders.map((f) => (
              <li key={f} className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-1.5 ring-1 ring-slate-100">
                <span>{f}/</span>
                <button type="button" onClick={() => removeFolder(f)} className="rounded-md p-1 text-slate-400 hover:text-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400" aria-label={`Quitar carpeta ${f}`}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ol>
          <div className="mt-2 flex items-start gap-2">
            <TextField
              label="Nueva subcarpeta"
              value={newFolder}
              onChange={(e) => setNewFolder(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addFolder()
                }
              }}
              error={folderError ?? undefined}
              className="flex-1"
              spellCheck={false}
            />
            <button type="button" onClick={addFolder} className="mt-5 rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50" aria-label="Añadir subcarpeta">
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
