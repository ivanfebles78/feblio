// Feblio · Edge Function: genera un código de 6 dígitos, lo guarda y lo envía
// por email (desde Feblio, vía Resend). La llama el usuario autenticado.
// Secretos: RESEND_API_KEY (obligatorio), OTP_FROM_EMAIL (opcional).
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase automáticamente.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ ok: false, error: 'No autenticado' }, 401)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const { data: userData } = await admin.auth.getUser(authHeader.replace('Bearer ', ''))
    const user = userData?.user
    if (!user) return json({ ok: false, error: 'Sesión no válida' }, 401)

    const { data: prof } = await admin
      .from('profiles')
      .select('empresa_id, full_name')
      .eq('id', user.id)
      .single()
    if (!prof?.empresa_id) return json({ ok: false, error: 'Cuenta sin empresa' }, 400)

    const { data: emp } = await admin
      .from('empresas')
      .select('name')
      .eq('id', prof.empresa_id)
      .single()

    const code = String(Math.floor(100000 + Math.random() * 900000))
    const expires_at = new Date(Date.now() + 15 * 60 * 1000).toISOString()
    await admin
      .from('email_otps')
      .upsert({ empresa_id: prof.empresa_id, code, expires_at, attempts: 0 })

    const KEY = Deno.env.get('RESEND_API_KEY')
    if (!KEY) return json({ ok: false, error: 'RESEND_API_KEY no configurada' }, 500)
    const from = Deno.env.get('OTP_FROM_EMAIL') ?? 'Feblio <onboarding@resend.dev>'
    const nombre = (prof.full_name as string) ?? (emp?.name as string) ?? ''

    const html = `
      <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
        <div style="background:linear-gradient(135deg,#2563eb,#4f46e5);padding:28px 32px;color:#fff">
          <div style="font-size:22px;font-weight:800">Feblio</div>
        </div>
        <div style="padding:32px">
          <h2 style="margin:0 0 8px;color:#0f172a">¡Gracias por registrarte${nombre ? ', ' + nombre : ''}! 🎉</h2>
          <p style="color:#475569;font-size:14px;margin:0 0 24px">Introduce este código para verificar tu email y activar tu cuenta:</p>
          <div style="text-align:center;margin:8px 0 24px">
            <div style="display:inline-block;background:#eff5ff;border:1px dashed #93bbfd;border-radius:12px;padding:16px 28px;font-size:34px;letter-spacing:10px;font-weight:800;color:#1d4ed8">${code}</div>
          </div>
          <p style="color:#94a3b8;font-size:12px;margin:0">El código caduca en 15 minutos. Si no te has registrado en Feblio, ignora este email.</p>
        </div>
        <div style="background:#f8fafc;padding:16px 32px;color:#94a3b8;font-size:11px">Feblio · Gestiona tus proyectos de principio a fin</div>
      </div>`

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: user.email,
        subject: 'Tu código de verificación · Feblio',
        html,
      }),
    })
    return json({ ok: r.ok }, r.ok ? 200 : 502)
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500)
  }
})
