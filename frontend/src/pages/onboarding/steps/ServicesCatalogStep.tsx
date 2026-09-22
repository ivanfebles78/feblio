// Feblio · Paso «Servicios y precios» del onboarding y pestaña Configuración → Servicios (mismo
// componente en ambos modos). El catálogo es de la empresa de la sesión: la RLS y las RPC de 0018
// garantizan el aislamiento; aquí solo se decide qué acciones se muestran según el rol interno.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, FileUp, History, Pencil, Plus, Power, Trash2 } from 'lucide-react'
import { Button } from '../../../components/v2/Button'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { SelectField, TextField } from '../../../components/forms/Field'
import { ServiceEditor } from '../../../components/services/ServiceEditor'
import { PriceHistory } from '../../../components/services/PriceHistory'
import { ImportDialog } from '../../../components/services/ImportDialog'
import { CategoriesPanel } from '../../../components/services/CategoriesPanel'
import { useOnboarding } from '../../../lib/onboarding/OnboardingContext'
import { currentLanguage } from '../../../i18n'
import { formatDate } from '../../../lib/intl'
import { priceLabel, taxLabel } from '../../../lib/services/format'
import { toServicePayload } from '../../../lib/services/validation'
import { downloadBlob, toCsv, type ExportRow } from '../../../lib/services/catalogFile'
import {
  canManageCatalog,
  currentCompanyRole,
  deleteService,
  importServices,
  listCatalog,
  listCategories,
  listPriceHistory,
  setServiceActive,
  upsertService,
} from '../../../lib/services/api'
import { PRICING_MODES, type CatalogRow, type CompanyRole, type PriceVersion, type ServiceCategory, type ServiceInput } from '../../../lib/services/types'
import type { StepProps } from './types'

type StatusFilter = 'all' | 'active' | 'inactive'

export function ServicesCatalogStep(_props: StepProps) {
  const { t } = useTranslation()
  const ctx = useOnboarding()
  const lang = currentLanguage()
  const billing = ctx.snapshot?.billing
  const empresa = ctx.snapshot?.empresa

  const [rows, setRows] = useState<CatalogRow[]>([])
  const [categories, setCategories] = useState<ServiceCategory[]>([])
  const [role, setRole] = useState<CompanyRole | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [pricingMode, setPricingMode] = useState('')

  const [editing, setEditing] = useState<CatalogRow | null | undefined>(undefined)
  const [editorError, setEditorError] = useState<string | null>(null)
  const [historyFor, setHistoryFor] = useState<CatalogRow | null>(null)
  const [versions, setVersions] = useState<PriceVersion[]>([])
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [confirmAction, setConfirmAction] = useState<{ row: CatalogRow; kind: 'deactivate' | 'delete' } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const canManage = canManageCatalog(role)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [catalog, cats, r] = await Promise.all([listCatalog(), listCategories(), currentCompanyRole()])
      setRows(catalog)
      setCategories(cats)
      setRole(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('services.errors.loadList'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (q && !`${r.code} ${r.name_es} ${r.name_en ?? ''}`.toLowerCase().includes(q)) return false
      if (category && r.category_id !== category) return false
      if (status === 'active' && !r.is_active) return false
      if (status === 'inactive' && r.is_active) return false
      if (pricingMode && r.pricing_mode !== pricingMode) return false
      return true
    })
  }, [rows, search, category, status, pricingMode])

  /** Servicios por categoría: decide qué opciones se ofrecen al eliminar una categoría en uso. */
  const categoryUsage = useMemo(() => {
    const out: Record<string, number> = {}
    for (const r of rows) if (r.category_id) out[r.category_id] = (out[r.category_id] ?? 0) + 1
    return out
  }, [rows])

  const serviceName = (r: CatalogRow) => (lang === 'en' && r.name_en ? r.name_en : r.name_es)
  const categoryName = (r: CatalogRow) => (lang === 'en' && r.category_name_en ? r.category_name_en : r.category_name_es)

  async function save(input: ServiceInput, opts: { withPrice: boolean }) {
    setBusy(true)
    setEditorError(null)
    try {
      await upsertService(toServicePayload(input, { withPrice: opts.withPrice }) as unknown as ServiceInput)
      setEditing(undefined)
      await load()
    } catch (e) {
      setEditorError(e instanceof Error ? e.message : t('services.errors.saveService'))
    } finally {
      setBusy(false)
    }
  }

  async function toggleActive(row: CatalogRow, active: boolean) {
    setBusy(true)
    setError(null)
    try {
      await setServiceActive(row.id, active)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('services.errors.saveService'))
    } finally {
      setBusy(false)
      setConfirmAction(null)
    }
  }

  async function remove(row: CatalogRow) {
    setBusy(true)
    setError(null)
    try {
      await deleteService(row.id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('services.errors.deleteService'))
    } finally {
      setBusy(false)
      setConfirmAction(null)
    }
  }

  async function openHistory(row: CatalogRow) {
    setHistoryFor(row)
    setVersions([])
    setHistoryError(null)
    try {
      setVersions(await listPriceHistory(row.id))
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : t('services.errors.loadHistory'))
    }
  }

  function exportRows(): ExportRow[] {
    return filtered.map((r) => ({
      code: r.code,
      category_code: r.category_code,
      name_es: r.name_es,
      name_en: r.name_en,
      description_es: r.description_es,
      description_en: r.description_en,
      is_active: r.is_active,
      pricing_mode: r.pricing_mode,
      base_price: r.base_price,
      currency: r.currency,
      tax_type: r.tax_type,
      tax_rate: r.tax_rate,
      unit: r.unit,
      min_price: r.min_price,
      max_price: r.max_price,
      urgency_surcharge_type: r.urgency_surcharge_type,
      urgency_surcharge_value: r.urgency_surcharge_value,
      external_costs: r.external_costs,
      estimated_duration_minutes: r.estimated_duration_minutes,
      prerequisites: r.prerequisites ?? [],
      requires_human_review: r.requires_human_review,
      min_info: r.min_info ?? [],
      required_documents: r.required_documents ?? [],
      client_questions: r.client_questions ?? [],
      included_actions: r.included_actions ?? [],
      excluded_actions: r.excluded_actions ?? [],
      valid_from: r.valid_from,
      valid_to: r.valid_to,
    }))
  }

  function exportCsv() {
    downloadBlob(new Blob([`\ufeff${toCsv(exportRows())}`], { type: 'text/csv;charset=utf-8' }), `${t('services.export.filename')}.csv`)
    setNotice(t('services.export.done'))
  }

  async function exportXlsx() {
    const { toExportMatrix, toXlsxBlob } = await import('../../../lib/services/catalogFile')
    downloadBlob(await toXlsxBlob(toExportMatrix(exportRows())), `${t('services.export.filename')}.xlsx`)
    setNotice(t('services.export.done'))
  }

  const defaults = {
    currency: billing?.currency ?? empresa?.currency ?? 'EUR',
    taxType: billing?.tax_type ?? 'IVA',
    taxRate: billing?.tax_rate !== undefined && billing?.tax_rate !== null ? String(billing.tax_rate) : '21',
  }

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-lg font-semibold text-slate-900">{t('services.title')}</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">{t('services.subtitle')}</p>
        {!canManage && !loading && <p className="mt-2 text-sm font-medium text-amber-700">{t('services.readOnly')}</p>}
      </header>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
          {notice}
        </p>
      )}

      <CategoriesPanel categories={categories} canManage={canManage} usage={categoryUsage} onChanged={load} />

      <div className="flex flex-wrap items-end gap-3">
        <TextField
          label={t('services.filters.search')}
          className="min-w-[12rem] flex-1"
          placeholder={t('services.filters.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <SelectField
          label={t('services.filters.category')}
          className="w-48"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder={t('services.filters.allCategories')}
          options={categories.map((c) => ({ value: c.id, label: lang === 'en' && c.name_en ? c.name_en : c.name_es }))}
        />
        <SelectField
          label={t('services.filters.status')}
          className="w-40"
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          options={[
            { value: 'all', label: t('services.filters.all') },
            { value: 'active', label: t('services.filters.active') },
            { value: 'inactive', label: t('services.filters.inactive') },
          ]}
        />
        <SelectField
          label={t('services.filters.mode')}
          className="w-44"
          value={pricingMode}
          onChange={(e) => setPricingMode(e.target.value)}
          placeholder={t('services.filters.allModes')}
          options={PRICING_MODES.map((m) => ({ value: m, label: t(`services.modes.${m}`) }))}
        />
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" leading={<Download className="h-4 w-4" aria-hidden="true" />} onClick={exportCsv}>
            {t('services.actions.exportCsv')}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void exportXlsx()}>
            {t('services.actions.exportXlsx')}
          </Button>
          {canManage && (
            <>
              <Button variant="secondary" size="sm" leading={<FileUp className="h-4 w-4" aria-hidden="true" />} onClick={() => setImportOpen(true)}>
                {t('services.actions.import')}
              </Button>
              <Button size="sm" leading={<Plus className="h-4 w-4" aria-hidden="true" />} onClick={() => setEditing(null)}>
                {t('services.actions.new')}
              </Button>
            </>
          )}
        </div>
      </div>

      {!loading && rows.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center">
          <h3 className="text-base font-semibold text-slate-900">{t('services.empty.title')}</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">{t('services.empty.body')}</p>
          {canManage && (
            <Button className="mt-4" leading={<Plus className="h-4 w-4" aria-hidden="true" />} onClick={() => setEditing(null)}>
              {t('services.empty.action')}
            </Button>
          )}
        </div>
      )}

      {rows.length > 0 && (
        <>
          <p className="text-sm text-slate-500">{t('services.filters.results', { count: filtered.length })}</p>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[46rem] text-left text-sm">
              <caption className="sr-only">{t('services.title')}</caption>
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">{t('services.columns.code')}</th>
                  <th scope="col" className="px-3 py-2 font-medium">{t('services.columns.name')}</th>
                  <th scope="col" className="px-3 py-2 font-medium">{t('services.columns.category')}</th>
                  <th scope="col" className="px-3 py-2 font-medium">{t('services.columns.price')}</th>
                  <th scope="col" className="px-3 py-2 font-medium">{t('services.columns.tax')}</th>
                  <th scope="col" className="px-3 py-2 font-medium">{t('services.columns.status')}</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">{t('services.columns.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-2 font-mono text-xs text-slate-500">{r.code}</td>
                    <td className="px-3 py-2">
                      <span className="font-medium text-slate-900">{serviceName(r)}</span>
                      {r.next_price_version_id && (
                        <span className="mt-0.5 block text-xs text-amber-700">
                          {t('services.status.scheduled', { date: formatDate(r.next_valid_from) })}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{categoryName(r) ?? '—'}</td>
                    <td className="px-3 py-2 text-slate-900">
                      {priceLabel(r)}
                      {r.version_no && <span className="ml-2 text-xs text-slate-400">v{r.version_no}</span>}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{taxLabel(r)}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                          r.is_active ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-slate-100 text-slate-600 ring-slate-200'
                        }`}
                      >
                        {t(r.is_active ? 'services.status.active' : 'services.status.inactive')}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <IconButton label={t('services.actions.history')} onClick={() => void openHistory(r)}>
                          <History className="h-4 w-4" aria-hidden="true" />
                        </IconButton>
                        {canManage && (
                          <>
                            <IconButton label={t('services.actions.edit')} onClick={() => setEditing(r)}>
                              <Pencil className="h-4 w-4" aria-hidden="true" />
                            </IconButton>
                            <IconButton
                              label={t(r.is_active ? 'services.actions.deactivate' : 'services.actions.activate')}
                              onClick={() => (r.is_active ? setConfirmAction({ row: r, kind: 'deactivate' }) : void toggleActive(r, true))}
                            >
                              <Power className="h-4 w-4" aria-hidden="true" />
                            </IconButton>
                            <IconButton label={t('services.actions.delete')} onClick={() => setConfirmAction({ row: r, kind: 'delete' })} danger>
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </IconButton>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-500">
                      {t('services.filters.noResults')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <ServiceEditor
        open={editing !== undefined}
        service={editing}
        categories={categories}
        defaults={defaults}
        busy={busy}
        error={editorError}
        onSave={save}
        onClose={() => setEditing(undefined)}
      />

      <PriceHistory
        open={historyFor !== null}
        code={historyFor?.code ?? ''}
        versions={versions}
        error={historyError}
        onClose={() => setHistoryFor(null)}
      />

      <ImportDialog open={importOpen} busy={busy} onClose={() => setImportOpen(false)} onImport={importServices} onDone={load} />

      <ConfirmDialog
        open={confirmAction !== null}
        title={
          confirmAction
            ? t(confirmAction.kind === 'delete' ? 'services.confirm.deleteTitle' : 'services.confirm.deactivateTitle', { code: confirmAction.row.code })
            : ''
        }
        confirmLabel={t(confirmAction?.kind === 'delete' ? 'services.actions.delete' : 'services.actions.deactivate')}
        busy={busy}
        onConfirm={() => {
          if (!confirmAction) return
          if (confirmAction.kind === 'delete') void remove(confirmAction.row)
          else void toggleActive(confirmAction.row, false)
        }}
        onCancel={() => setConfirmAction(null)}
      >
        {confirmAction?.kind === 'delete'
          ? confirmAction.row.usage_count > 0
            ? t('services.confirm.deleteBlocked')
            : t('services.confirm.deleteBody')
          : t('services.confirm.deactivateBody')}
      </ConfirmDialog>
    </div>
  )
}

function IconButton({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`rounded-lg p-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
        danger ? 'text-slate-400 hover:bg-red-50 hover:text-red-600' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      {children}
    </button>
  )
}
