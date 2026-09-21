// Feblio · Edge Function: envía por email el enlace del formulario de cliente.
// Requiere el secreto RESEND_API_KEY (y opcional INTAKE_FROM_EMAIL) en el proyecto.
// Deploy:  supabase functions deploy send-intake-email
//          supabase secrets set RESEND_API_KEY=re_xxx INTAKE_FROM_EMAIL="Tu Empresa <no-reply@tudominio.com>"
//
// Idioma: comunicación empresarial → empresas.language de la empresa dueña del enlace (se resuelve en
// servidor a partir del token del formulario; nunca del navegador). Sin idioma → español.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { companyLocaleById, type Locale } from '../_shared/i18n/locale.ts'
import { escapeHtml, serverT, serverTHtml } from '../_shared/i18n/messages.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

/** Token del formulario (uuid) a partir del enlace /form/<token>. */
export function intakeTokenFromLink(link: string): string | null {
  const m = /\/form\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(link)
  return m ? m[1].toLowerCase() : null
}

/** HTML del correo (valores dinámicos escapados) y alternativa en texto plano. */
export function buildIntakeEmail(locale: Locale, company: string, link: string): { subject: string; html: string; text: string } {
  const safeLink = escapeHtml(link)
  const html = `
      <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
        <h2 style="color:#2563eb;margin-bottom:4px">${escapeHtml(company)}</h2>
        <p>${serverTHtml(locale, 'intake.greeting')}</p>
        <p>${serverT(locale, 'intake.body', { company: `<strong>${escapeHtml(company)}</strong>` })}</p>
        <p style="margin:24px 0">
          <a href="${safeLink}" style="background:#2563eb;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;display:inline-block">
            ${serverTHtml(locale, 'intake.cta')}
          </a>
        </p>
        <p style="font-size:12px;color:#64748b">${serverTHtml(locale, 'intake.fallbackLink', { link })}</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0" />
        <p style="font-size:11px;color:#94a3b8">${serverTHtml(locale, 'intake.footer')}</p>
      </div>`
  return { subject: serverT(locale, 'intake.subject', { company }), html, text: serverT(locale, 'intake.text', { company, link }) }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { to, link, empresa } = await req.json()
    if (!to || !link) return json({ ok: false, code: 'missing_data', error: serverT('es', 'api.intake.missingData') }, 400)

    const KEY = Deno.env.get('RESEND_API_KEY')
    if (!KEY) return json({ ok: false, code: 'not_configured', error: 'RESEND_API_KEY no configurada' }, 500)

    // Idioma y nombre de la empresa dueña del enlace (service role; el navegador no decide el idioma)
    let locale: Locale = 'es'
    let company = typeof empresa === 'string' && empresa.trim() ? empresa.trim() : 'Feblio'
    const token = intakeTokenFromLink(String(link))
    if (token) {
      const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
      const { data: ci } = await admin.from('client_intake').select('empresa_id').eq('token', token).maybeSingle()
      if (ci?.empresa_id) {
        locale = await companyLocaleById(admin, ci.empresa_id as string)
        const { data: e } = await admin.from('empresas').select('name, trade_name').eq('id', ci.empresa_id).maybeSingle()
        const name = (e?.trade_name as string | null) || (e?.name as string | null)
        if (name) company = name
      }
    }

    const from = Deno.env.get('INTAKE_FROM_EMAIL') ?? 'Feblio <onboarding@resend.dev>'
    const mail = buildIntakeEmail(locale, company, String(link))
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject: mail.subject, html: mail.html, text: mail.text }),
    })
    const data = await r.json()
    return json({ ok: r.ok, data, locale }, r.ok ? 200 : 502)
  } catch (e) {
    return json({ ok: false, code: 'error', error: String(e) }, 500)
  }
})
