// Feblio · Edge Function: envía por email el enlace del formulario de cliente.
// Requiere el secreto RESEND_API_KEY (y opcional INTAKE_FROM_EMAIL) en el proyecto.
// Deploy:  supabase functions deploy send-intake-email
//          supabase secrets set RESEND_API_KEY=re_xxx INTAKE_FROM_EMAIL="Tu Empresa <no-reply@tudominio.com>"

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { to, link, empresa } = await req.json()
    if (!to || !link) return json({ ok: false, error: 'Faltan datos (to, link)' }, 400)

    const KEY = Deno.env.get('RESEND_API_KEY')
    if (!KEY) return json({ ok: false, error: 'RESEND_API_KEY no configurada' }, 500)

    const from = Deno.env.get('INTAKE_FROM_EMAIL') ?? 'Feblio <onboarding@resend.dev>'
    const nombre = empresa ?? 'Feblio'

    const html = `
      <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
        <h2 style="color:#2563eb;margin-bottom:4px">${nombre}</h2>
        <p>Hola,</p>
        <p><strong>${nombre}</strong> te invita a completar tus datos para darte de alta como cliente.</p>
        <p style="margin:24px 0">
          <a href="${link}" style="background:#2563eb;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;display:inline-block">
            Completar formulario
          </a>
        </p>
        <p style="font-size:12px;color:#64748b">O copia este enlace: ${link}</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0" />
        <p style="font-size:11px;color:#94a3b8">Enviado con Feblio</p>
      </div>`

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to,
        subject: `Completa tus datos · ${nombre}`,
        html,
      }),
    })
    const data = await r.json()
    return json({ ok: r.ok, data }, r.ok ? 200 : 502)
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500)
  }
})
