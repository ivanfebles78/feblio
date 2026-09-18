-- Feblio · 0012 · Correcciones detectadas en la prueba E2E de staging
-- Idempotente. Aplicar DESPUÉS de 0011.
--
--   A) claim_native_email_verification(): solo audita 'email.verified' cuando realmente cambia
--      email_verified (antes generaba un evento por cada comprobación del gate).

create or replace function public.claim_native_email_verification()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_empresa uuid := public.current_empresa_id(); v_mode text; v_confirmed timestamptz; n int;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  select coalesce(value #>> '{}', 'otp') into v_mode from public.platform_settings where key = 'email_verification_mode';
  if coalesce(v_mode, 'otp') <> 'native' then
    return jsonb_build_object('ok', false, 'error', 'La plataforma usa verificación por código.');
  end if;
  if v_empresa is null then return jsonb_build_object('ok', false, 'error', 'Cuenta sin empresa'); end if;
  select email_confirmed_at into v_confirmed from auth.users where id = auth.uid();
  if v_confirmed is null then return jsonb_build_object('ok', false, 'error', 'El email aún no está confirmado.'); end if;
  update public.empresas set email_verified = true where id = v_empresa and email_verified = false;
  get diagnostics n = row_count;
  if n > 0 then
    perform public.audit_log_internal(v_empresa, auth.uid(), 'email.verified', 'empresas', v_empresa, 'ok', jsonb_build_object('mode', 'native'));
  end if;
  return jsonb_build_object('ok', true, 'already_verified', n = 0);
end $$;
revoke all on function public.claim_native_email_verification() from public, anon;
grant execute on function public.claim_native_email_verification() to authenticated;
