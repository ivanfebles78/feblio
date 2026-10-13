import { useTranslation } from 'react-i18next'
import { LANGUAGE_NAME, setUserLanguage, SUPPORTED_LANGUAGES, toLanguage, type Language } from '../i18n'
import { syncUserLanguageMetadata } from '../lib/userLanguage'

export interface LanguageSwitcherProps {
  /** `light` sobre fondos claros (por defecto); `dark` sobre fondos oscuros (landing, onboarding). */
  tone?: 'light' | 'dark'
  className?: string
}

/** Banderita decorativa (aria-hidden): España (ES) y Reino Unido (EN). */
function Flag({ lang }: { lang: Language }) {
  const common = 'h-3 w-[1.15rem] shrink-0 rounded-[2px] ring-1 ring-black/10'
  if (lang === 'es') {
    return (
      <svg viewBox="0 0 3 2" className={common} aria-hidden="true" preserveAspectRatio="none">
        <rect width="3" height="2" fill="#AA151B" />
        <rect y="0.5" width="3" height="1" fill="#F1BF00" />
      </svg>
    )
  }
  // Union Jack simplificada (legible a tamaño pequeño)
  return (
    <svg viewBox="0 0 60 30" className={common} aria-hidden="true" preserveAspectRatio="none">
      <clipPath id="uk-clip">
        <rect width="60" height="30" />
      </clipPath>
      <g clipPath="url(#uk-clip)">
        <rect width="60" height="30" fill="#012169" />
        <path d="M0,0 60,30 M60,0 0,30" stroke="#fff" strokeWidth="6" />
        <path d="M0,0 60,30 M60,0 0,30" stroke="#C8102E" strokeWidth="2.5" />
        <path d="M30,0 V30 M0,15 H60" stroke="#fff" strokeWidth="10" />
        <path d="M30,0 V30 M0,15 H60" stroke="#C8102E" strokeWidth="6" />
      </g>
    </svg>
  )
}

/**
 * Selector de idioma ES | EN con banderita (España / Reino Unido). Cambia solo la interfaz del
 * usuario actual y guarda su preferencia local; nunca modifica el idioma de la empresa. Si hay
 * sesión, sincroniza además `auth.user_metadata.language` (idioma de los correos de autenticación)
 * sin bloquear el cambio. Accesible: grupo con etiqueta, botones con nombre completo del idioma
 * (la bandera es decorativa), estado `aria-pressed`, foco visible, sin salto de diseño.
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
            onClick={() => {
              setUserLanguage(lang)
              void syncUserLanguageMetadata(lang)
            }}
            className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 uppercase tracking-wide transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${
              dark
                ? `focus-visible:ring-white focus-visible:ring-offset-slate-900 ${on ? 'bg-white text-slate-900' : 'text-slate-200 hover:bg-white/10 hover:text-white'}`
                : `focus-visible:ring-brand-500 focus-visible:ring-offset-white ${on ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:text-slate-900'}`
            } ${on ? '' : 'opacity-85'}`}
          >
            <Flag lang={lang} />
            {lang}
          </button>
        )
      })}
    </div>
  )
}
