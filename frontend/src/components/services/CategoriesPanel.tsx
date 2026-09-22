// Feblio · Categorías comerciales del catálogo. Son las que define cada empresa (Derecho laboral,
// Reformas, Ingeniería…): Feblio no crea ninguna automáticamente y no tienen relación con la futura
// clasificación de las entradas de clientes.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Tag, Trash2 } from 'lucide-react'
import { Button } from '../v2/Button'
import { Modal } from '../v2/Modal'
import { SelectField, TextField } from '../forms/Field'
import { currentLanguage } from '../../i18n'
import { normalizeCode } from '../../lib/services/validation'
import { deleteCategory, upsertCategory } from '../../lib/services/api'
import type { ServiceCategory } from '../../lib/services/types'

export interface CategoriesPanelProps {
  categories: ServiceCategory[]
  canManage: boolean
  /** Número de servicios por categoría (para decidir qué hacer al eliminar). */
  usage?: Record<string, number>
  onChanged: () => void | Promise<void>
}

export function CategoriesPanel({ categories, canManage, usage = {}, onChanged }: CategoriesPanelProps) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [nameEs, setNameEs] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<ServiceCategory | null>(null)
  const [mode, setMode] = useState<'clear' | 'reassign'>('clear')
  const [target, setTarget] = useState('')

  const label = (c: ServiceCategory) => (lang === 'en' && c.name_en ? c.name_en : c.name_es)

  async function add() {
    setBusy(true)
    setError(null)
    try {
      await upsertCategory({ code: normalizeCode(code), name_es: nameEs.trim(), name_en: nameEn.trim() || null })
      setCode('')
      setNameEs('')
      setNameEn('')
      await onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('services.errors.saveCategory'))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!removing) return
    setBusy(true)
    setError(null)
    try {
      const used = usage[removing.id] ?? 0
      await deleteCategory(removing.id, used > 0 ? mode : 'block', mode === 'reassign' ? target : undefined)
      setRemoving(null)
      await onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('services.errors.deleteCategory'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Tag className="h-4 w-4 text-slate-400" aria-hidden="true" /> {t('services.categories.title')}
        </h3>
        <ul className="flex flex-1 flex-wrap gap-2">
          {categories.map((c) => (
            <li key={c.id} className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-sm text-slate-700 ring-1 ring-slate-200">
              {label(c)}
              {canManage && (
                <button
                  type="button"
                  onClick={() => {
                    setRemoving(c)
                    setMode('clear')
                    setTarget('')
                  }}
                  aria-label={t('services.categories.deleteTitle', { name: label(c) })}
                  className="rounded-full p-0.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
          {categories.length === 0 && <li className="text-sm text-slate-500">{t('services.categories.empty')}</li>}
        </ul>
        {canManage && (
          <Button variant="ghost" size="sm" leading={<Plus className="h-4 w-4" aria-hidden="true" />} onClick={() => setOpen(true)}>
            {t('services.categories.new')}
          </Button>
        )}
      </div>
      {categories.length === 0 && <p className="mt-2 text-xs text-slate-500">{t('services.categories.suggestions')}</p>}

      <Modal
        open={open}
        title={t('services.categories.new')}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t('services.actions.cancel')}
            </Button>
            <Button
              disabled={busy || !code.trim() || !nameEs.trim()}
              onClick={async () => {
                await add()
                setOpen(false)
              }}
            >
              {t('services.actions.save')}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label={t('services.categories.code')} value={code} onChange={(e) => setCode(normalizeCode(e.target.value))} required />
          <TextField label={t('services.categories.nameEs')} value={nameEs} onChange={(e) => setNameEs(e.target.value)} required />
          <TextField label={t('services.categories.nameEn')} value={nameEn} onChange={(e) => setNameEn(e.target.value)} className="sm:col-span-2" />
          {error && (
            <p role="alert" className="sm:col-span-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              {error}
            </p>
          )}
        </div>
      </Modal>

      <Modal
        open={removing !== null}
        title={removing ? t('services.categories.deleteTitle', { name: label(removing) }) : ''}
        onClose={() => setRemoving(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              {t('services.actions.cancel')}
            </Button>
            <Button disabled={busy || (mode === 'reassign' && !target)} onClick={() => void remove()}>
              {t('services.actions.delete')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {removing && (usage[removing.id] ?? 0) > 0 ? (
            <>
              <p className="text-sm text-slate-700">{t('services.categories.deleteBody', { count: usage[removing.id] ?? 0 })}</p>
              <SelectField
                label={t('services.filters.status')}
                value={mode}
                onChange={(e) => setMode(e.target.value as 'clear' | 'reassign')}
                options={[
                  { value: 'clear', label: t('services.categories.modeClear') },
                  { value: 'reassign', label: t('services.categories.modeReassign') },
                ]}
              />
              {mode === 'reassign' && (
                <SelectField
                  label={t('services.categories.reassignTo')}
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  options={categories.filter((c) => c.id !== removing.id).map((c) => ({ value: c.id, label: label(c) }))}
                />
              )}
            </>
          ) : (
            <p className="text-sm text-slate-700">{t('services.categories.deleteUnused')}</p>
          )}
          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              {error}
            </p>
          )}
        </div>
      </Modal>
    </section>
  )
}
