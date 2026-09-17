-- Feblio · Seed de onboarding para la empresa de ejemplo RALM (solo desarrollo).
-- Requiere: 0001..0009 aplicadas y el seed 0002 (empresa 'Ralm').
-- No contiene credenciales ni contraseñas. Idempotente.
--
--   Razón social: RALM, S.L. · Nombre comercial: RALM · Tipo: Empresa
--   Zona horaria: Atlantic/Canary · Moneda: EUR · Impuesto: IGIC 7 % · Anticipo: 50 %
--   Email: dirección de entrada de Feblio, borrador + aprobación humana
--   WhatsApp: pending_credentials · SMS: not_configured · Telefonía: registro manual
--   Drive: pending_credentials · Automatización: Nivel 1

do $$
declare v_empresa uuid; v_owner uuid;
begin
  select id into v_empresa from public.empresas where name in ('Ralm', 'RALM, S.L.') order by created_at limit 1;
  if v_empresa is null then
    raise notice 'No existe la empresa Ralm: ejecuta antes el seed 0002.';
    return;
  end if;
  select id into v_owner from public.profiles where empresa_id = v_empresa and role = 'empresa' order by created_at limit 1;

  -- (La sesión del SQL Editor es confiable para el trigger de guarda: current_user ≠ anon/authenticated.)

  update public.empresas
     set name = 'RALM, S.L.', trade_name = 'RALM', entity_type = 'company', tax_type = 'CIF',
         country = 'ES', province = 'Las Palmas', city = 'Las Palmas de Gran Canaria', postal_code = '35001',
         timezone = 'Atlantic/Canary', language = 'es', currency = 'EUR',
         email_verified = true,
         onboarding_status = 'completed', onboarding_current_step = null,
         onboarding_started_at = coalesce(onboarding_started_at, now() - interval '1 day'),
         onboarding_completed_at = coalesce(onboarding_completed_at, now())
   where id = v_empresa;

  update public.profiles set is_onboarding_owner = true, job_title = 'Administrador' where id = v_owner;

  -- Filas por defecto (pasos, conexiones, ajustes, plantillas)
  perform public.ensure_onboarding_defaults(v_empresa);

  -- Consentimientos (registro permanente)
  insert into public.consent_records (user_id, empresa_id, consent_type, version, accepted, source)
  select v_owner, v_empresa, t, '2026-09-17', true, 'seed'
  from unnest(array['terms_of_service', 'privacy_policy']) as t
  where not exists (select 1 from public.consent_records c where c.empresa_id = v_empresa and c.consent_type = t and c.accepted);
  insert into public.consent_records (user_id, empresa_id, consent_type, version, accepted, source)
  select v_owner, v_empresa, 'marketing', '2026-09-17', false, 'seed'
  where not exists (select 1 from public.consent_records c where c.empresa_id = v_empresa and c.consent_type = 'marketing');

  -- Pasos
  update public.onboarding_steps set status = 'completed', started_at = now() - interval '1 day', completed_at = now(), skipped_at = null
   where empresa_id = v_empresa and step_key in ('company', 'repository', 'email', 'voice', 'forms', 'automation', 'billing', 'review');
  update public.onboarding_steps set status = 'skipped', skipped_at = now(), skipped_reason = 'Seed: pendiente de credenciales'
   where empresa_id = v_empresa and step_key in ('whatsapp', 'sms');
  update public.onboarding_steps set data = '{"provider":"google_drive"}'::jsonb where empresa_id = v_empresa and step_key = 'repository';
  update public.onboarding_steps set data = '{"provider":"feblio_inbox","scope":"labeled","labels":["Feblio"],"prepare_drafts":true,"require_approval":true,"auto_send":false,"auto_create_requests":true}'::jsonb
   where empresa_id = v_empresa and step_key = 'email';
  update public.onboarding_steps set data = '{"mode":"manual"}'::jsonb where empresa_id = v_empresa and step_key = 'voice';

  -- Conexiones (sin secretos; ningún proveedor externo aparece como connected)
  update public.integration_connections set provider = 'google_drive', status = 'pending_credentials',
         last_error = 'Faltan variables: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI'
   where empresa_id = v_empresa and kind = 'document_repository';
  update public.integration_connections set provider = 'feblio_inbox', status = 'not_configured',
         settings = '{"provider":"feblio_inbox","prepare_drafts":true,"require_approval":true,"auto_send":false}'::jsonb
   where empresa_id = v_empresa and kind = 'email';
  update public.integration_connections set provider = 'meta', status = 'pending_credentials',
         last_error = 'Faltan variables: WHATSAPP_APP_ID, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN'
   where empresa_id = v_empresa and kind = 'whatsapp';
  update public.integration_connections set provider = null, status = 'not_configured' where empresa_id = v_empresa and kind = 'sms';
  update public.integration_connections set provider = 'manual_log', status = 'connected', display_name = 'Registro manual',
         settings = '{"mode":"manual"}'::jsonb, connected_at = now(), last_test_at = now(), last_test_ok = true
   where empresa_id = v_empresa and kind = 'voice';

  -- Automatización y facturación
  update public.automation_settings set level = 1, require_human_approval = true, auto_send_form = false, auto_send_quote = false where empresa_id = v_empresa;
  update public.billing_settings set currency = 'EUR', tax_type = 'IGIC', tax_rate = 7, advance_percentage = 50 where empresa_id = v_empresa;

  insert into public.audit_events (empresa_id, user_id, action, entity_type, entity_id, result, metadata)
  values (v_empresa, v_owner, 'onboarding.seeded', 'empresas', v_empresa, 'ok', '{"source":"seed_0003"}'::jsonb);
end $$;
