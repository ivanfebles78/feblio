// Feblio · Edge Function: envía por email el enlace del formulario de cliente (solo usuarios de empresa
// autenticados y solo para formularios de SU empresa; ver _shared/intake/sendIntake.ts).
// Secretos del servidor: RESEND_API_KEY (obligatorio), INTAKE_FROM_EMAIL (opcional), APP_URL (opcional).
// Deploy (verify_jwt activado, por defecto):  supabase functions deploy send-intake-email
//
// Idioma: comunicación empresarial → empresas.language de la empresa del formulario. Sin idioma → español.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { ALLOWED_METHODS, corsHeaders, handleSendIntake, type EmpresaRow, type IntakeRow, type ProfileRow, type SendIntakeDeps } from '../_shared/intake/sendIntake.ts'

const INTAKE_COLS = 'id, empresa_id, token, status, client_email, expires_at'

function deps(): SendIntakeDeps {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  return {
    async getUserId(jwt) {
      const { data, error } = await admin.auth.getUser(jwt)
      return error || !data?.user ? null : data.user.id
    },
    async getProfile(userId) {
      const { data } = await admin.from('profiles').select('empresa_id, role').eq('id', userId).maybeSingle()
      return (data as ProfileRow | null) ?? null
    },
    async findIntakeById(id) {
      const { data } = await admin.from('client_intake').select(INTAKE_COLS).eq('id', id).maybeSingle()
      return (data as IntakeRow | null) ?? null
    },
    async findIntakeByToken(token) {
      const { data } = await admin.from('client_intake').select(INTAKE_COLS).eq('token', token).maybeSingle()
      return (data as IntakeRow | null) ?? null
    },
    async getEmpresa(empresaId) {
      const { data } = await admin.from('empresas').select('id, name, trade_name, language').eq('id', empresaId).maybeSingle()
      return (data as EmpresaRow | null) ?? null
    },
    async sendMail(mail) {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(mail),
      })
      if (!r.ok) throw new Error(`resend_${r.status}`)
      const data = (await r.json().catch(() => null)) as { id?: string } | null
      return data?.id ?? null
    },
    env: (name) => Deno.env.get(name),
    log: (event, ctx) => console.error(event, ctx),
  }
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get('Origin'), Deno.env.get('APP_URL'))
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, code: 'method_not_allowed' }), { status: 405, headers: { ...cors, Allow: ALLOWED_METHODS, 'Content-Type': 'application/json' } })
  }
  try {
    const out = await handleSendIntake(req, deps())
    return new Response(JSON.stringify(out.body), { status: out.status, headers: { ...cors, 'Content-Type': 'application/json' } })
  } catch (e) {
    // Nunca se devuelve el texto de la excepción al cliente
    console.error('send-intake-email: error inesperado', { reason: e instanceof Error ? e.name : 'unknown' })
    return new Response(JSON.stringify({ ok: false, code: 'error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
