import { useTranslation } from 'react-i18next'
import { LANGUAGE_NAME, setUserLanguage, SUPPORTED_LANGUAGES, toLanguage, type Language } from '../i18n'

export interface LanguageSwitcherProps {
  /** `light` sobre fondos claros (por defecto); `dark` sobre fondos oscuros (landing, onboarding). */
  tone?: 'light' | 'dark'
  className?: string
}

/**
 * Selector de idioma ES | EN (sin banderas). Cambia solo la interfaz del usuario actual y guarda
 * su preferencia local; nunca modifica el idioma de la empresa. Accesible: grupo con etiqueta,
 * botones con nombre completo del idioma, estado `aria-pressed`, foco visible, sin salto de diseño.
 */
export function LanguageSwitcher({ tone = 'light', className = '' }: LanguageSwitcherProps) {
  const { t, i18n } = useTranslation()
  const active = toLanguage(i18n.language) ?? 'es'
  const dark = tone === 'dark'
  return (
    <div role="group" aria-label={t('common.language.switcher')} className={`inline-flex shrink-0 items-center rounded-lg p-0.5 text-xs font-semibold ${dark ? 'bg-white/10 ring-1 ring-white/20' : 'bg-slate-100 ring-1 ring-slate-200'} ${className}`}>
      {SUPPORTED_LANGUAGES.map((lang: Language) => {
        const on = lang === active
        return (
          <button
            key={lang}
            type="button"
            lang={lang}
            aria-label={LANGUAGE_NAME[lang]}
            aria-pressed={on}
            onClick={() => setUserLanguage(lang)}
            className={`h-7 min-w-[2.25rem] rounded-md px-2 uppercase tracking-wide transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${
              dark
                ? `focus-visible:ring-white focus-visible:ring-offset-slate-900 ${on ? 'bg-white text-slate-900' : 'text-slate-200 hover:bg-white/10 hover:text-white'}`
                : `focus-visible:ring-brand-500 focus-visible:ring-offset-white ${on ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:text-slate-900'}`
            }`}
          >
            {lang}
          </button>
        )
      })}
    </div>
  )
}
