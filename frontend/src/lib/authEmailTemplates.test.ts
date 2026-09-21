// Feblio · comprobaciones de las plantillas bilingües de Supabase Auth versionadas en docs/email-templates.
// No se aplican aquí: solo se valida que cada archivo tenga ramas es/en, conserve exactamente las variables
// oficiales, no incluya scripts ni imágenes Base64, cargue el logo por HTTPS y no deje claves técnicas.
import { describe, expect, it } from 'vitest'

// Archivos versionados en docs/email-templates, leídos vía Vite (sin APIs de Node y sin importaciones
// estáticas fuera de `frontend/`: el build de Railway solo dispone de este directorio y `tsc` no debe
// depender de que exista docs/).
type Manifest = Record<string, { file: string; subject: string; subject_es: string; subject_en: string; api_subject_key: string; api_content_key: string }>
const RAW = import.meta.glob('../../../docs/email-templates/**/*.html', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const MANIFESTS = import.meta.glob('../../../docs/email-templates/templates.json', { import: 'default', eager: true }) as Record<string, Manifest>
const manifest: Manifest = Object.values(MANIFESTS)[0] ?? {}
const templateHtml = (key: string): string => {
  const path = Object.keys(RAW).find((p) => p.endsWith(`/email-templates/${key}.html`))
  if (!path) throw new Error(`falta docs/email-templates/${key}.html`)
  return RAW[path]
}

const REQUIRED_VARIABLES: Record<string, string[]> = {
  'confirm-signup': ['{{ .ConfirmationURL }}'],
  'reset-password': ['{{ .ConfirmationURL }}'],
  'invite-user': ['{{ .ConfirmationURL }}'],
  'magic-link': ['{{ .ConfirmationURL }}'],
  'change-email': ['{{ .ConfirmationURL }}', '{{ .NewEmail }}', '{{ .Email }}'],
  reauthentication: ['{{ .Token }}'],
  'security/password-changed': [],
  'security/email-changed': ['{{ .OldEmail }}', '{{ .Email }}'],
  'security/phone-changed': ['{{ .OldPhone }}', '{{ .Phone }}'],
  'security/identity-linked': ['{{ .Provider }}', '{{ .Email }}'],
  'security/identity-unlinked': ['{{ .Provider }}', '{{ .Email }}'],
  'security/mfa-factor-enrolled': ['{{ .FactorType }}'],
  'security/mfa-factor-unenrolled': ['{{ .FactorType }}'],
}
const OFFICIAL = ['ConfirmationURL', 'Token', 'TokenHash', 'SiteURL', 'RedirectTo', 'Data.language', 'Email', 'NewEmail', 'OldEmail', 'Phone', 'OldPhone', 'Provider', 'FactorType']
const IF_EN = '{{ if eq .Data.language "en" }}'

/** Render mínimo de las condicionales Go `{{ if eq .Data.language "en" }}A{{ else }}B{{ end }}` (sin anidar). */
function renderLang(src: string, lang: 'es' | 'en' | null): string {
  return src.replace(/\{\{ if eq \.Data\.language "en" \}\}([\s\S]*?)\{\{ else \}\}([\s\S]*?)\{\{ end \}\}/g, (_, en: string, es: string) => (lang === 'en' ? en : es))
}

const files = Object.keys(RAW).map((p) => p.slice(p.indexOf('/email-templates/') + '/email-templates/'.length))

describe('plantillas de Supabase Auth (docs/email-templates)', () => {
  it('16. existen las 6 plantillas de autenticación + 7 de seguridad, todas en el manifiesto', () => {
    expect(files.sort()).toEqual(Object.keys(REQUIRED_VARIABLES).map((k) => `${k}.html`).sort())
    expect(Object.keys(manifest).sort()).toEqual(Object.keys(REQUIRED_VARIABLES).sort())
  })

  for (const key of Object.keys(REQUIRED_VARIABLES)) {
    const html = templateHtml(key)
    const subject = manifest[key].subject

    it(`${key}: 16. contiene ramas español e inglés y sin idioma se resuelve a español`, () => {
      expect(html).toContain(IF_EN)
      expect(html).toContain('{{ else }}')
      expect(html).toContain('{{ end }}')
      expect(subject).toContain(IF_EN)
      const es = renderLang(html, 'es')
      const en = renderLang(html, 'en')
      const none = renderLang(html, null)
      expect(none).toBe(es)
      expect(es).not.toBe(en)
      for (const out of [es, en]) expect(out).not.toMatch(/\{\{ (if|else|end)/) // ninguna condicional literal
      expect(es).toMatch(/lang="es"/)
      expect(en).toMatch(/lang="en"/)
      expect(renderLang(subject, 'es')).toBe(manifest[key].subject_es)
      expect(renderLang(subject, 'en')).toBe(manifest[key].subject_en)
    })

    it(`${key}: 17. conserva exactamente las variables oficiales en ambas ramas y no inventa otras`, () => {
      for (const lang of ['es', 'en'] as const) {
        const out = renderLang(html, lang)
        for (const v of REQUIRED_VARIABLES[key]) expect(out, `${lang} sin ${v}`).toContain(v)
        const used = [...out.matchAll(/\{\{\s*\.?([\w.]+)\s*\}\}/g)].map((m) => m[1])
        for (const u of used) expect(OFFICIAL, `variable no oficial ${u}`).toContain(u)
        // enlaces de autenticación intactos: el href del botón es la variable, no una URL inventada
        if (REQUIRED_VARIABLES[key].includes('{{ .ConfirmationURL }}')) expect(out).toMatch(/href="\{\{ \.ConfirmationURL \}\}"/)
      }
    })

    it(`${key}: 18. sin JavaScript ni imágenes Base64; 19. logo por HTTPS con texto alternativo`, () => {
      expect(html).not.toMatch(/<script/i)
      expect(html).not.toMatch(/\son[a-z]+\s*=/i) // manejadores de eventos en línea (onclick…)
      expect(html).not.toMatch(/javascript:/i)
      expect(html).not.toMatch(/data:image|base64/i)
      expect(html).toContain('src="https://feblio.com/feblio-email-logo.png"')
      expect(html).toMatch(/<img [^>]*alt="Feblio"/)
      for (const m of html.matchAll(/(?:src|href)="([^"{]+)"/g)) expect(m[1], m[1]).toMatch(/^https:\/\//)
    })

    it(`${key}: 20. sin claves técnicas visibles y con aviso de ignorar el correo`, () => {
      const text = renderLang(html, 'en').replace(/<[^>]+>/g, ' ')
      expect(text).not.toMatch(/\b[a-z]+\.[a-z]+\.[a-zA-Z]+\b(?!\.png)/) // p. ej. auth.verify.title
      expect(renderLang(html, 'es')).toMatch(/ignorar|no tienes que hacer nada/)
      expect(renderLang(html, 'en')).toMatch(/ignore|no action is needed/)
    })
  }
})
