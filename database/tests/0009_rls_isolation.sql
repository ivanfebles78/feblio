-- Feblio · Pruebas de aislamiento multiempresa y permisos de la migración 0009.
--
-- Cómo ejecutarlas: en una RAMA de Supabase (o en un proyecto de desarrollo),
-- con 0001..0009 aplicadas, pega este script en el SQL Editor y ejecútalo.
-- Crea datos temporales dentro de una transacción y hace ROLLBACK al final:
-- no deja rastro. Si alguna comprobación falla, lanza una excepción con el
-- nombre del caso (T1, T2, …).
--
-- Simula usuarios autenticados fijando request.jwt.claims como hace PostgREST.

begin;

create temp table _t (name text, ok boolean) on commit drop;
grant insert on table pg_temp._t to authenticated;   -- solo lo necesario mientras se simula ese rol

do $$
declare
  v_u_a uuid := gen_random_uuid();   -- usuario empresa A (RALM)
  v_u_b uuid := gen_random_uuid();   -- usuario empresa B (otra empresa)
  v_u_c uuid := gen_random_uuid();   -- cliente final de A
  v_u_admin uuid := gen_random_uuid();
  v_e_a uuid; v_e_b uuid; v_cli uuid;
  n int; v_json jsonb; v_ok boolean; v_err text;
begin
  -- ---------- Datos de prueba (como service role) ----------
  insert into public.empresas (name, cif, entity_type, email_verified, onboarding_status) values ('TEST_RALM', 'B12345674', 'company', true, 'in_progress') returning id into v_e_a;
  insert into public.empresas (name, cif, entity_type, email_verified, onboarding_status) values ('TEST_OTRA', 'B98765432', 'company', true, 'in_progress') returning id into v_e_b;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                          confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  values
    ('00000000-0000-0000-0000-000000000000', v_u_a, 'authenticated', 'authenticated', 'test-a@example.invalid', '', now(), now(), now(), '{"provider":"email"}', '{}', '', '', '', '', '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_u_b, 'authenticated', 'authenticated', 'test-b@example.invalid', '', now(), now(), now(), '{"provider":"email"}', '{}', '', '', '', '', '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_u_c, 'authenticated', 'authenticated', 'test-c@example.invalid', '', now(), now(), now(), '{"provider":"email"}', '{}', '', '', '', '', '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_u_admin, 'authenticated', 'authenticated', 'test-admin@example.invalid', '', now(), now(), now(), '{"provider":"email"}', '{}', '', '', '', '', '', '', '', '');

  -- handle_new_user crea perfiles 'cliente' sin empresa; los ajustamos
  update public.profiles set role = 'empresa', empresa_id = v_e_a, full_name = 'Ana Pérez' where id = v_u_a;
  update public.profiles set role = 'empresa', empresa_id = v_e_b, full_name = 'Bea López' where id = v_u_b;
  insert into public.clientes (empresa_id, name) values (v_e_a, 'Cliente A') returning id into v_cli;
  update public.profiles set role = 'cliente', empresa_id = v_e_a, cliente_id = v_cli where id = v_u_c;
  update public.profiles set role = 'admin' where id = v_u_admin;
  insert into public.consent_records (user_id, empresa_id, consent_type, version, accepted) values
    (v_u_a, v_e_a, 'terms_of_service', 't', true), (v_u_a, v_e_a, 'privacy_policy', 't', true);

  perform public.ensure_onboarding_defaults(v_e_a);
  perform public.ensure_onboarding_defaults(v_e_b);

  -- ---------- Como usuario A ----------
  perform set_config('request.jwt.claims', json_build_object('sub', v_u_a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_u_a::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;

  -- T1: A no puede leer el onboarding de B (RLS)
  select count(*) into n from public.onboarding_steps where empresa_id = v_e_b;
  insert into pg_temp._t values ('T1 A no lee pasos de B', n = 0);
  select count(*) into n from public.integration_connections where empresa_id = v_e_b;
  insert into pg_temp._t values ('T1b A no lee integraciones de B', n = 0);
  select count(*) into n from public.onboarding_steps where empresa_id = v_e_a;
  insert into pg_temp._t values ('T1c A sí lee sus pasos', n = 11);

  -- T2: A no puede modificar integraciones de B (RPC con empresa explícita)
  begin
    perform public.upsert_integration_connection('email', 'feblio_inbox', 'not_configured', '{}'::jsonb, null, null, v_e_b);
    v_ok := false;
  exception when others then v_ok := true;
  end;
  insert into pg_temp._t values ('T2 A no modifica integraciones de B', v_ok);
  begin
    perform public.save_onboarding_step('email', '{"x":1}'::jsonb, v_e_b);
    v_ok := false;
  exception when others then v_ok := true;
  end;
  insert into pg_temp._t values ('T2b A no guarda pasos de B', v_ok);

  -- T3: guardar y reanudar (persistencia por pasos)
  perform public.save_onboarding_step('email', '{"provider":"feblio_inbox"}'::jsonb);
  select onboarding_current_step into v_err from public.empresas where id = v_e_a;
  insert into pg_temp._t values ('T3 el paso actual se persiste', v_err = 'email');
  select data->>'provider' into v_err from public.onboarding_steps where empresa_id = v_e_a and step_key = 'email';
  insert into pg_temp._t values ('T3b los datos del paso se persisten', v_err = 'feblio_inbox');

  -- T4: no se puede guardar un secreto en data
  begin
    perform public.save_onboarding_step('email', '{"password":"x"}'::jsonb);
    v_ok := false;
  exception when others then v_ok := true;
  end;
  insert into pg_temp._t values ('T4 no se guardan secretos en data', v_ok);

  -- T5: una integración externa no puede marcarse connected sin prueba real
  begin
    perform public.upsert_integration_connection('email', 'gmail', 'connected', '{}'::jsonb);
    v_ok := false;
  exception when others then v_ok := true;
  end;
  insert into pg_temp._t values ('T5 gmail no puede ser connected desde el cliente', v_ok);
  -- pero el almacenamiento interno sí
  v_json := public.upsert_integration_connection('document_repository', 'feblio_storage', 'connected', '{}'::jsonb);
  insert into pg_temp._t values ('T5b feblio_storage connected', v_json->>'status' = 'connected');

  -- T6: la empresa no puede tocar sus columnas de onboarding directamente
  begin
    update public.empresas set onboarding_status = 'completed' where id = v_e_a;
    v_ok := false;
  exception when others then v_ok := true;
  end;
  insert into pg_temp._t values ('T6 onboarding_status protegido por trigger', v_ok);

  -- T7: activación bloqueada sin método de solicitudes; desbloqueada al completar formularios
  v_json := public.activate_onboarding();
  insert into pg_temp._t values ('T7 activación bloqueada', (v_json->>'ok')::boolean = false and jsonb_array_length(v_json->'blockers') > 0);
  perform public.complete_onboarding_step('forms');
  perform public.complete_onboarding_step('company');
  v_json := public.activate_onboarding();
  insert into pg_temp._t values ('T7b activación correcta', (v_json->>'ok')::boolean = true);
  select onboarding_status into v_err from public.empresas where id = v_e_a;
  insert into pg_temp._t values ('T7c estado completed', v_err = 'completed');
  select count(*) into n from public.audit_events where empresa_id = v_e_a and action = 'onboarding.activated';
  insert into pg_temp._t values ('T7d auditoría de activación', n = 1);

  -- T8: credenciales cifradas inaccesibles para authenticated
  begin
    select count(*) into n from public.integration_credentials;
    v_ok := false;
  exception when others then v_ok := true;
  end;
  insert into pg_temp._t values ('T8 integration_credentials inaccesible', v_ok);

  -- T9: prueba guiada crea datos marcados y la limpieza los borra
  v_json := public.run_onboarding_test();
  select count(*) into n from public.projects where empresa_id = v_e_a and is_test;
  insert into pg_temp._t values ('T9 prueba crea proyecto sandbox', n = 1);
  v_json := public.cleanup_onboarding_test_data();
  select count(*) into n from public.projects where empresa_id = v_e_a and is_test;
  insert into pg_temp._t values ('T9b limpieza borra sandbox', n = 0);

  -- ---------- Como cliente final C ----------
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_u_c, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_u_c::text, true);
  set local role authenticated;
  begin
    v_json := public.get_onboarding();
    v_ok := false;
  exception when others then v_ok := true;
  end;
  insert into pg_temp._t values ('T10 un cliente final no accede al onboarding', v_ok);
  select count(*) into n from public.onboarding_steps;
  insert into pg_temp._t values ('T10b cliente no lee pasos', n = 0);

  -- ---------- Como admin ----------
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_u_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_u_admin::text, true);
  set local role authenticated;
  v_json := public.get_onboarding(v_e_b);
  insert into pg_temp._t values ('T11 admin consulta el onboarding de cualquier empresa', v_json ? 'steps');
  select count(*) into n from public.audit_events where empresa_id in (v_e_a, v_e_b);
  insert into pg_temp._t values ('T11b admin lee auditoría', n > 0);

  reset role;
end $$;

reset role;   -- garantía: ningún cambio de rol sobrevive al bloque de pruebas

select name, case when ok then 'OK' else 'FALLO' end as resultado from pg_temp._t order by name;

do $$
declare failed int;
begin
  select count(*) into failed from pg_temp._t where not ok;
  if failed > 0 then raise exception 'Han fallado % comprobaciones de aislamiento/permisos', failed; end if;
  raise notice 'Todas las comprobaciones de aislamiento y permisos han pasado';
end $$;

rollback;
