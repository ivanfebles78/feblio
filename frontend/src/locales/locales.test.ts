import { describe, expect, it } from 'vitest'
import { es } from './es'
import { en } from './en'

type Tree = { [k: string]: string | Tree }

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>()
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'string') out.set(key, v)
    else flatten(v, key).forEach((val, kk) => out.set(kk, val))
  }
  return out
}

/** Las variables de interpolación ({{count}}, {{email}}) deben coincidir entre idiomas. */
function placeholders(s: string): string[] {
  return [...s.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]).sort()
}

describe('locales es/en', () => {
  const esFlat = flatten(es as unknown as Tree)
  const enFlat = flatten(en as unknown as Tree)

  it('ambos idiomas tienen exactamente el mismo conjunto de claves', () => {
    const onlyEs = [...esFlat.keys()].filter((k) => !enFlat.has(k))
    const onlyEn = [...enFlat.keys()].filter((k) => !esFlat.has(k))
    expect({ onlyEs, onlyEn }).toEqual({ onlyEs: [], onlyEn: [] })
    expect(esFlat.size).toBeGreaterThan(50)
  })

  it('ninguna traducción está vacía', () => {
    const empty = [...esFlat.entries(), ...enFlat.entries()].filter(([, v]) => v.trim() === '').map(([k]) => k)
    expect(empty).toEqual([])
  })

  it('las variables de interpolación coinciden entre idiomas', () => {
    const mismatched = [...esFlat.entries()].filter(([k, v]) => JSON.stringify(placeholders(v)) !== JSON.stringify(placeholders(enFlat.get(k) ?? ''))).map(([k]) => k)
    expect(mismatched).toEqual([])
  })

  it('las formas plurales (_one/_other) están completas en ambos idiomas', () => {
    const incomplete = [...esFlat.keys(), ...enFlat.keys()]
      .filter((k) => /_(one|other)$/.test(k))
      .map((k) => k.replace(/_(one|other)$/, ''))
      .filter((base, i, arr) => arr.indexOf(base) === i)
      .filter((base) => !(esFlat.has(`${base}_one`) && esFlat.has(`${base}_other`) && enFlat.has(`${base}_one`) && enFlat.has(`${base}_other`)))
    expect(incomplete).toEqual([])
  })
})
