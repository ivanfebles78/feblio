#!/usr/bin/env node
// Auditoría heurística de textos en español hardcodeados en el código fuente (fuera de locales/).
// Uso:  node scripts/i18n-audit.mjs [--all]   (por defecto ignora tests y comentarios)
// Señala líneas con caracteres típicos del español (acentos, ñ, ¿ ¡) o palabras frecuentes en
// literales/JSX. Es una ayuda para la revisión, no una prueba automática: revisa cada aviso.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(process.cwd(), 'src')
const SKIP_DIRS = ['locales', 'i18n', 'test']
const SPANISH = /[áéíóúñÁÉÍÓÚÑ¿¡]/
const WORDS = /\b(?:el|la|los|las|de|del|para|con|sin|una?|tu|tus|este|esta|guardar|cancelar|enviar|crear|cerrar|nuevo|nueva|pendiente|cliente|empresa|solicitud|contraseña|correo|correo electrónico|iniciar|sesión|configuración|siguiente|anterior|volver|añadir|eliminar|borrar|editar|documento|documentos|proyecto|proyectos)\b/i

const showAll = process.argv.includes('--all')
const files = []
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) {
      if (!SKIP_DIRS.includes(name)) walk(p)
    } else if (/\.(tsx?|jsx?)$/.test(name) && (showAll || !/\.test\.tsx?$/.test(name))) files.push(p)
  }
}
walk(ROOT)

let total = 0
const perFile = []
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n')
  const hits = []
  let inBlockComment = false
  lines.forEach((raw, i) => {
    const line = raw.trim()
    if (inBlockComment) {
      if (line.includes('*/')) inBlockComment = false
      return
    }
    if (line.startsWith('/*') || line.startsWith('/**')) {
      if (!line.includes('*/')) inBlockComment = true
      return
    }
    if (line.startsWith('//') || line.startsWith('*')) return
    // Quita comentarios de final de línea y llamadas t('...') ya traducidas
    const code = line.replace(/\/\/.*$/, '').replace(/\bt\((['"`])(?:(?!\1).)*\1/g, 't(…')
    // Solo literales de cadena o texto JSX
    const literal = code.match(/(['"`])((?:(?!\1).)*)\1/g)?.join(' ') ?? ''
    const jsxText = code.replace(/<[^>]*>/g, ' ').replace(/\{[^}]*\}/g, ' ')
    const sample = `${literal} ${jsxText}`
    if (SPANISH.test(sample) || (WORDS.test(literal) && /[A-Za-z]{3,}\s+[A-Za-z]{2,}/.test(literal))) hits.push(`${i + 1}: ${line.slice(0, 120)}`)
  })
  if (hits.length) {
    perFile.push([relative(process.cwd(), file), hits])
    total += hits.length
  }
}
perFile.sort((a, b) => b[1].length - a[1].length)
for (const [file, hits] of perFile) {
  console.log(`\n${file} (${hits.length})`)
  for (const h of hits) console.log(`  ${h}`)
}
console.log(`\n${total} avisos en ${perFile.length} archivos`)
process.exitCode = 0
