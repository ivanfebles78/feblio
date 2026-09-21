import { useTranslation } from 'react-i18next'
import { LegalLayout, LegalSection } from './LegalLayout'
import { LEGAL_VERSIONS } from '../../lib/legal'

/** Secciones con un párrafo (`p1`); la sección 3 es una lista (li1…li5) y se renderiza aparte. */
const PARAGRAPH_SECTIONS_BEFORE_LIST = ['s1', 's2'] as const
const LIST_ITEMS = ['li1', 'li2', 'li3', 'li4', 'li5'] as const
const PARAGRAPH_SECTIONS_AFTER_LIST = ['s4', 's5', 's6', 's7', 's8', 's9'] as const

/**
 * Política de privacidad · BORRADOR ESTRUCTURADO.
 * Requiere revisión jurídica (RGPD / LOPDGDD) antes de considerarse definitiva.
 * Al modificar el texto (src/locales/{es,en}/legal.json), actualiza LEGAL_VERSIONS.privacy en src/lib/legal.ts.
 * La versión española es la jurídicamente vinculante.
 */
export default function Privacidad() {
  const { t } = useTranslation()
  const paragraphSection = (key: string) => (
    <LegalSection key={key} title={t(`legal.privacy.${key}.title`)}>
      <p>{t(`legal.privacy.${key}.p1`)}</p>
    </LegalSection>
  )
  return (
    <LegalLayout title={t('legal.privacy.title')} version={LEGAL_VERSIONS.privacy}>
      {PARAGRAPH_SECTIONS_BEFORE_LIST.map(paragraphSection)}
      <LegalSection title={t('legal.privacy.s3.title')}>
        <ul className="list-disc space-y-1 pl-5">
          {LIST_ITEMS.map((item) => (
            <li key={item}>{t(`legal.privacy.s3.${item}`)}</li>
          ))}
        </ul>
      </LegalSection>
      {PARAGRAPH_SECTIONS_AFTER_LIST.map(paragraphSection)}
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{t('legal.draftNotice')}</p>
    </LegalLayout>
  )
}
