// Feblio · Pruebas del catálogo y la resolución de idioma del servidor (sin red).
// Ejecutar con:  cd supabase/functions && deno test _shared/i18n/i18n.test.ts
import { assert, assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { companyLocale, companyLocaleById, toLocale, userLocale } from './locale.ts'
import { channelVariables, escapeHtml, MESSAGES, serverT, serverTHtml } from './messages.ts'

Deno.test('resolución: es/en aceptados; nulo, vacío o no soportado → es; sin detección del navegador', () => {
  assertEquals(toLocale('en'), 'en')
  assertEquals(toLocale('EN-GB'), 'en')
  assertEquals(toLocale(' es '), 'es')
  for (const bad of [null, undefined, '', 'fr', 'pt', 42, {}, 'English']) assertEquals(toLocale(bad), 'es')
  assertEquals(companyLocale({ language: 'en' }), 'en')
  assertEquals(companyLocale({ language: 'xx' }), 'es')
  assertEquals(companyLocale(null), 'es')
  assertEquals(userLocale({ user_metadata: { language: 'en' } }), 'en')
  assertEquals(userLocale({ user_metadata: {} }), 'es')
  assertEquals(userLocale(null), 'es')
})

Deno.test('companyLocaleById consulta empresas.language y cae a es si no existe', async () => {
  const db = (row: Record<string, unknown> | null) => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }) }) })
  assertEquals(await companyLocaleById(db({ language: 'en' }), 'e1'), 'en')
  assertEquals(await companyLocaleById(db(null), 'e1'), 'es')
  assertEquals(await companyLocaleById(db({ language: 'en' }), null), 'es')
})

Deno.test('catálogo: cada clave tiene es y en, sin vacíos y con las mismas variables', () => {
  for (const [key, entry] of Object.entries(MESSAGES)) {
    assert(entry.es.trim().length > 0, `${key}.es vacío`)
    assert(entry.en.trim().length > 0, `${key}.en vacío`)
    const vars = (s: string) => [...s.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]).sort()
    assertEquals(vars(entry.es), vars(entry.en), `variables distintas en ${key}`)
    assertEquals(channelVariables(entry.es), channelVariables(entry.en), `variables de canal distintas en ${key}`)
  }
})

Deno.test('serverT: es, en, fallback e interpolación; nunca devuelve la clave', () => {
  assertEquals(serverT('es', 'intake.subject', { company: 'Norte SL' }), 'Completa tus datos · Norte SL')
  assertEquals(serverT('en', 'intake.subject', { company: 'Norte SL' }), 'Complete your details · Norte SL')
  assertEquals(serverT('fr', 'intake.subject', { company: 'Norte SL' }), 'Completa tus datos · Norte SL')
  assertEquals(serverT(null, 'otp.greeting', { name: '' }), '¡Gracias por registrarte!')
  assertEquals(serverT('en', 'otp.greeting', { name: ', Ana' }), 'Thanks for signing up, Ana!')
  assert(!serverT('en', 'test.email.text', { company: 'X' }).includes('test.email'))
  assertThrows(() => serverT('es', 'no.existe' as never))
})

Deno.test('HTML: los valores dinámicos se escapan; el texto plano no lleva HTML', () => {
  assertEquals(escapeHtml('<b>&"\''), '&lt;b&gt;&amp;&quot;&#39;')
  assertEquals(serverTHtml('en', 'intake.body', { company: '<img src=x>' }), '&lt;img src=x&gt; invites you to complete your details to register as a client.')
  assert(!/<[a-z]/.test(serverT('es', 'intake.text', { company: 'A', link: 'https://x' })))
})

Deno.test('plantillas de canal: variables {empresa}/{url} idénticas en ambos idiomas', () => {
  assertEquals(channelVariables(MESSAGES['test.sms.template'].es), ['empresa', 'url'])
  assertEquals(channelVariables(MESSAGES['test.sms.template'].en), ['empresa', 'url'])
})
