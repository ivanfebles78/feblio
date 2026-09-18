/**
 * Campos de formulario accesibles (WCAG 2.2 AA):
 * - label visible asociado por id (nunca placeholder como única etiqueta)
 * - aria-invalid + aria-describedby → error y ayuda anunciados por lectores de pantalla
 * - foco visible y navegación por teclado nativa
 */
import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { AlertCircle } from 'lucide-react'

export const INPUT_CLS =
  'w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 transition focus:outline-none focus:ring-4 disabled:bg-slate-50 disabled:text-slate-500'
const OK_CLS = 'border-slate-200 focus:border-brand-400 focus:ring-brand-100'
const ERR_CLS = 'border-red-400 focus:border-red-500 focus:ring-red-100'

interface BaseProps {
  label: ReactNode
  error?: string
  hint?: ReactNode
  required?: boolean
  className?: string
}

function Label({ id, label, required }: { id: string; label: ReactNode; required?: boolean }) {
  return (
    <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-600">
      {label}
      {required && (
        <span className="ml-0.5 text-red-500" aria-hidden="true">
          *
        </span>
      )}
      {required && <span className="sr-only"> (obligatorio)</span>}
    </label>
  )
}

export function FieldMessage({ id, error, hint }: { id: string; error?: string; hint?: ReactNode }) {
  if (error) {
    return (
      <p id={id} className="mt-1 flex items-start gap-1 text-xs font-medium text-red-600" role="alert">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {error}
      </p>
    )
  }
  if (hint) {
    return (
      <p id={id} className="mt-1 text-xs text-slate-400">
        {hint}
      </p>
    )
  }
  return null
}

export type TextFieldProps = BaseProps & Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'required'> & { trailing?: ReactNode }

export function TextField({ label, error, hint, required, className = '', trailing, ...input }: TextFieldProps) {
  const id = useId()
  const msgId = `${id}-msg`
  const describedBy = [input['aria-describedby'], error || hint ? msgId : null].filter(Boolean).join(' ') || undefined
  return (
    <div className={className}>
      <Label id={id} label={label} required={required} />
      <div className="relative">
        <input
          id={id}
          aria-required={required || undefined}
          className={`${INPUT_CLS} ${error ? ERR_CLS : OK_CLS} ${trailing ? 'pr-11' : ''}`}
          {...input}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
        {trailing && <span className="absolute inset-y-0 right-2 flex items-center">{trailing}</span>}
      </div>
      <FieldMessage id={msgId} error={error} hint={hint} />
    </div>
  )
}

export type SelectFieldProps = BaseProps &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className' | 'required'> & {
    options: { value: string; label: string }[]
    placeholder?: string
  }

export function SelectField({ label, error, hint, required, className = '', options, placeholder, ...select }: SelectFieldProps) {
  const id = useId()
  const msgId = `${id}-msg`
  return (
    <div className={className}>
      <Label id={id} label={label} required={required} />
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? msgId : undefined}
        aria-required={required || undefined}
        className={`${INPUT_CLS} ${error ? ERR_CLS : OK_CLS}`}
        {...select}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <FieldMessage id={msgId} error={error} hint={hint} />
    </div>
  )
}

export type TextareaFieldProps = BaseProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className' | 'required'>

export function TextareaField({ label, error, hint, required, className = '', ...ta }: TextareaFieldProps) {
  const id = useId()
  const msgId = `${id}-msg`
  return (
    <div className={className}>
      <Label id={id} label={label} required={required} />
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? msgId : undefined}
        aria-required={required || undefined}
        className={`${INPUT_CLS} ${error ? ERR_CLS : OK_CLS}`}
        {...ta}
      />
      <FieldMessage id={msgId} error={error} hint={hint} />
    </div>
  )
}

export interface CheckboxFieldProps {
  label: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  error?: string
  hint?: ReactNode
  required?: boolean
  disabled?: boolean
  name?: string
  className?: string
}

export function CheckboxField({ label, checked, onChange, error, hint, required, disabled, name, className = '' }: CheckboxFieldProps) {
  const id = useId()
  const msgId = `${id}-msg`
  return (
    <div className={className}>
      <div className="flex items-start gap-2.5">
        <input
          id={id}
          name={name}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? msgId : undefined}
          aria-required={required || undefined}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-2 focus:ring-brand-300"
        />
        <label htmlFor={id} className="text-sm text-slate-700">
          {label}
          {required && <span className="sr-only"> (obligatorio)</span>}
        </label>
      </div>
      <FieldMessage id={msgId} error={error} hint={hint} />
    </div>
  )
}

export interface ToggleFieldProps {
  label: ReactNode
  description?: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  error?: string
}

/** Interruptor accesible (role="switch") */
export function ToggleField({ label, description, checked, onChange, disabled, error }: ToggleFieldProps) {
  const id = useId()
  const msgId = `${id}-msg`
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-sm font-medium text-slate-800">
          {label}
        </label>
        {description && <p className="text-xs text-slate-500">{description}</p>}
        <FieldMessage id={msgId} error={error} />
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={error ? msgId : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 disabled:opacity-50 ${
          checked ? 'bg-brand-600' : 'bg-slate-300'
        }`}
      >
        <span className="sr-only">{checked ? 'Activado' : 'Desactivado'}</span>
        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </div>
  )
}

export interface RadioCardOption<V extends string> {
  value: V
  label: string
  description?: ReactNode
  badge?: ReactNode
  disabled?: boolean
}

export interface RadioCardsProps<V extends string> {
  legend: ReactNode
  name: string
  value: V | ''
  onChange: (v: V) => void
  options: RadioCardOption<V>[]
  error?: string
  columns?: 1 | 2 | 3
}

/** Grupo de tarjetas seleccionables (fieldset + radios reales) */
export function RadioCards<V extends string>({ legend, name, value, onChange, options, error, columns = 2 }: RadioCardsProps<V>) {
  const id = useId()
  const msgId = `${id}-msg`
  const cols = columns === 1 ? 'grid-cols-1' : columns === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
  return (
    <fieldset aria-describedby={error ? msgId : undefined} aria-invalid={error ? true : undefined}>
      <legend className="mb-2 text-xs font-medium text-slate-600">{legend}</legend>
      <div className={`grid gap-2 ${cols}`}>
        {options.map((o) => {
          const on = o.value === value
          const rid = `${id}-${o.value}`
          return (
            <label
              key={o.value}
              htmlFor={rid}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition focus-within:ring-2 focus-within:ring-brand-300 ${
                on ? 'border-brand-500 bg-brand-50/60' : 'border-slate-200 bg-white hover:border-brand-300'
              } ${o.disabled ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              <input
                id={rid}
                type="radio"
                name={name}
                value={o.value}
                checked={on}
                disabled={o.disabled}
                onChange={() => onChange(o.value)}
                className="mt-1 h-4 w-4 text-brand-600 focus:ring-brand-300"
              />
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
                  {o.label}
                  {o.badge}
                </span>
                {o.description && <span className="mt-0.5 block text-xs text-slate-500">{o.description}</span>}
              </span>
            </label>
          )
        })}
      </div>
      <FieldMessage id={msgId} error={error} />
    </fieldset>
  )
}

/** Lista de chips editable (etiquetas, países, idiomas…) */
export function ChipsField({
  label,
  values,
  onChange,
  error,
  hint,
  placeholder,
  suggestions,
}: {
  label: ReactNode
  values: string[]
  onChange: (v: string[]) => void
  error?: string
  hint?: ReactNode
  placeholder?: string
  suggestions?: string[]
}) {
  const id = useId()
  const msgId = `${id}-msg`
  const listId = `${id}-list`
  function add(raw: string) {
    const v = raw.trim()
    if (!v || values.includes(v)) return
    onChange([...values, v])
  }
  return (
    <div>
      <Label id={id} label={label} />
      <div className="mb-2 flex flex-wrap gap-1.5" aria-live="polite">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 ring-1 ring-brand-100">
            {v}
            <button
              type="button"
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="rounded-full text-brand-400 hover:text-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              aria-label={`Quitar ${v}`}
            >
              ×
            </button>
          </span>
        ))}
        {values.length === 0 && <span className="text-xs text-slate-400">Ninguno</span>}
      </div>
      <input
        id={id}
        list={suggestions ? listId : undefined}
        placeholder={placeholder}
        aria-describedby={error || hint ? msgId : undefined}
        aria-invalid={error ? true : undefined}
        className={`${INPUT_CLS} ${error ? ERR_CLS : OK_CLS}`}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            add(e.currentTarget.value)
            e.currentTarget.value = ''
          }
        }}
        onBlur={(e) => {
          add(e.currentTarget.value)
          e.currentTarget.value = ''
        }}
      />
      {suggestions && (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
      <FieldMessage id={msgId} error={error} hint={hint ?? 'Pulsa Intro para añadir.'} />
    </div>
  )
}
