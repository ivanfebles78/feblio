import { useTranslation } from 'react-i18next'
import { LegalLayout, LegalSection } from './LegalLayout'
import { LEGAL_VERSIONS } from '../../lib/legal'

/** Secciones de los términos: cada una tiene `title` y `p1` en legal.json (legal.terms.sN). */
const TERMS_SECTIONS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11'] as const

/**
 * Términos del servicio · BORRADOR ESTRUCTURADO.
 * Requiere revisión jurídica antes de considerarse definitivo (ver docs/onboarding.md).
 * Al modificar el texto (src/locales/{es,en}/legal.json), actualiza LEGAL_VERSIONS.terms en src/lib/legal.ts.
 * La versión española es la jurídicamente vinculante.
 */
export default function Terminos() {
  const { t } = useTranslation()
  return (
    <LegalLayout title={t('legal.terms.title')} version={LEGAL_VERSIONS.terms}>
      {TERMS_SECTIONS.map((key) => (
        <LegalSection key={key} title={t(`legal.terms.${key}.title`)}>
          <p>{t(`legal.terms.${key}.p1`)}</p>
        </LegalSection>
      ))}
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{t('legal.draftNotice')}</p>
    </LegalLayout>
  )
}
