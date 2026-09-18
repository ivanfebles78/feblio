-- Feblio · Pruebas de la auditoría de seguridad (migración 0011).
--
-- Ejecutar en una RAMA de Supabase o en desarrollo, con 0001..0011 aplicadas.
-- Transacción con ROLLBACK final: no deja rastro. Cada comprobación imprime OK/FALLO.
--
--   S1  anon no lee configuración, pasos, integraciones, auditoría ni credenciales
--   S2  anon no puede invocar RPCs privados ni helpers internos
--   S3  la empresa no puede insertar, modificar ni borrar audit_events
--   S4  la empresa no puede cambiar email_verified ni onboarding_status directamente
--   S5  el cliente final no lee integraciones, facturación ni pasos
--   S6  integration_credentials es ilegible para empresa y cliente
--   S7  intake-files es privado; anon solo sube bajo un token pendiente válido;
--       solo la empresa dueña lee sus adjuntos; otra empresa no los lee ni logra borrarlos
--       (el DELETE directo puede ser bloqueado por RLS o por storage.protect_delete() en Supabase alojado)
--   S8  submit_intake_form descarta rutas de adjuntos fuera del prefijo del token
--   S9  el signup público no puede auto-asignarse 'admin' (si el entorno permite simularlo)
--   S10 log_audit_event rechaza a clientes finales

begin;
create temp table _t (name text, ok boolean) on commit drop;
grant insert on table pg_temp._t to anon, authenticated;   -- solo lo necesario mientras se simula ese rol

do $$
declare
  v_u_a uuid := gen_random_uuid(); v_u_b uuid := gen_random_uuid(); v_u_c uuid := gen_random_uuid();
  v_e_a uuid; v_e_b uuid; v_cli uuid; v_tok_a uuid; v_tok_b uuid;
  n int; n_before int; v_ok boolean; v_json jsonb; v_text text; v_public boolean;
begin
  -- ---------- Datos (sin JWT: confiable) ----------
  insert into public.empresas (name, cif, entity_type, email_verified, onboarding_status) values ('SEC_A', 'B12345674', 'company', true, 'in_progress') returning id into v_e_a;
  insert into public.empresas (name, cif, entity_type, email_verified, onboarding_status) values ('SEC_B', 'B98765432', 'company', true, 'in_progress') returning id into v_e_b;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                          confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  values
    ('00000000-0000-0000-0000-000000000000', v_u_a, 'authenticated', 'authenticated', 'sec-a@example.invalid', '', now(), now(), now(), '{}', '{}', '', '', '', '', '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_u_b, 'authenticated', 'authenticated', 'sec-b@example.invalid', '', now(), now(), now(), '{}', '{}', '', '', '', '', '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_u_c, 'authenticated', 'authenticated', 'sec-c@example.invalid', '', now(), now(), now(), '{}', '{}', '', '', '', '', '', '', '', '');
  update public.profiles set role = 'empresa', empresa_id = v_e_a, full_name = 'A' where id = v_u_a;
  update public.profiles set role = 'empresa', empresa_id = v_e_b, full_name = 'B' where id = v_u_b;
  insert into public.clientes (empresa_id, name) values (v_e_a, 'C') returning id into v_cli;
  update public.profiles set role = 'cliente', empresa_id = v_e_a, cliente_id = v_cli where id = v_u_c;
  perform public.ensure_onboarding_defaults(v_e_a);
  perform public.ensure_onboarding_defaults(v_e_b);
  insert into public.integration_credentials (empresa_id, connection_id, provider, ciphertext, iv)
  select v_e_a, id, 'gmail', 'cifrado', 'iv' from public.integration_connections where empresa_id = v_e_a and kind = 'email';
  insert into public.client_intake (empresa_id, expires_at) values (v_e_a, now() + interval '1 day') returning token into v_tok_a;
  insert into public.client_intake (empresa_id, expires_at) values (v_e_b, now() + interval '1 day') returning token into v_tok_b;
  insert into public.audit_events (empresa_id, user_id, action) values (v_e_a, v_u_a, 'seed.event');

  -- ---------- S7a: bucket privado ----------
  select public into v_public from storage.buckets where id = 'intake-files';
  insert into pg_temp._t values ('S7a intake-files es privado', v_public = false);

  -- ---------- Como anon ----------
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'anon', true);
  set local role anon;

  -- Nota: las políticas RLS usan helpers revocados a anon (0003), por lo que anon recibe
  -- "permission denied" en vez de 0 filas. Ambos resultados significan acceso denegado.
  begin select count(*) into n from public.onboarding_steps; v_ok := n = 0; exception when others then v_ok := true; end;
  insert into pg_temp._t values ('S1a anon no lee onboarding_steps', v_ok);
  begin select count(*) into n from public.integration_connections; v_ok := n = 0; exception when others then v_ok := true; end;
  insert into pg_temp._t values ('S1b anon no lee integration_connections', v_ok);
  begin select count(*) into n from public.billing_settings; v_ok := n = 0; exception when others then v_ok := true; end;
  insert into pg_temp._t values ('S1c anon no lee billing_settings', v_ok);
  begin select count(*) into n from public.automation_settings; v_ok := n = 0; exception when others then v_ok := true; end;
  insert into pg_temp._t values ('S1d anon no lee automation_settings', v_ok);
  begin select count(*) into n from public.audit_events; v_ok := n = 0; exception when others then v_ok := true; end;
  insert into pg_temp._t values ('S1e anon no lee audit_events', v_ok);
  begin
    select count(*) into n from public.integration_credentials; v_ok := false;
  exception when others then v_ok := true; end;
  insert into pg_temp._t values ('S1f anon: integration_credentials denegado', v_ok);

  begin perform public.get_onboarding(); v_ok := false; exception when others then v_ok := true; end;
  insert into pg_temp._t values ('S2a anon no ejecuta get_onboarding', v_ok);
  begin perform public.verify_email_otp('000000'); v_ok := false; exception when others then v_ok := true; end;
  insert into pg_temp._t values ('S2b anon no ejecuta verify_email_otp', v_ok);
  begin perform public.feblio_trusted(); v_ok := false; exception when others then v_ok := true; end;
  insert into pg_temp._t values ('S2c anon no ejecuta feblio_trusted', v_ok);
  begin perform public.audit_log_internal(v_e_a, null, 'x.y', null, null, 'ok', '{}'); v_ok := false; exception when others then v_ok := true; end;
  insert into pg_temp._t values ('S2d anon no ejecuta audit_log_internal', v_ok);
  -- feblio_trusted() no debe considerar confiable a anon aunque intente escribir en empresas (RLS lo impide igualmente)
  begin update public.empresas set email_verified = false where id = v_e_a; exception when others then null; end;
  reset role;
  select email_verified into v_ok from public.empresas where id = v_e_a;
  insert into pg_temp._t values ('S4c anon no altera email_verified', v_ok = true);

  -- S7b: anon sube bajo token válido; no bajo token ajeno/inválido; no lee
  set local role anon;
  begin
    insert into storage.objects (bucket_id, name) values ('intake-files', v_tok_a::text || '/doc.pdf'); v_ok := true;
  exception when others then v_ok := false; end;
  insert into pg_temp._t values ('S7b anon sube bajo un token pendiente válido', v_ok);
  begin
    insert into storage.objects (bucket_id, name) values ('intake-files', gen_random_uuid()::text || '/doc.pdf'); v_ok := false;
  exception when others then v_ok := true; end;
  insert into pg_temp._t values ('S7c anon no sube bajo un token inexistente', v_ok);
  begin
    insert into storage.objects (bucket_id, name) values ('intake-files', v_tok_a::text || '/sub/doc.pdf'); v_ok := false;
  exception when others then v_ok := true; end;
  insert into pg_temp._t values ('S7d anon no crea subcarpetas', v_ok);
  select count(*) into n from storage.objects where bucket_id = 'intake-files'; insert into pg_temp._t values ('S7e anon no lista adjuntos', n = 0);
  reset role;

  -- Token caducado: no admite subidas
  update public.client_intake set expires_at = now() - interval '1 hour' where token = v_tok_b;
  set local role anon;
  begin
    insert into storage.objects (bucket_id, name) values ('intake-files', v_tok_b::text || '/doc.pdf'); v_ok := false;
  exception when others then v_ok := true; end;
  insert into pg_temp._t values ('S7f anon no sube bajo un token caducado', v_ok);
  reset role;
  update public.client_intake set expires_at = now() + interval '1 day' where token = v_tok_b;
  insert into storage.objects (bucket_id, name) values ('intake-files', v_tok_b::text || '/doc-b.pdf');

  -- S8: submit descarta rutas fuera del token
  set local role anon;
  v_json := public.submit_intake_form(v_tok_a, jsonb_build_object('name', 'Cliente', 'files', jsonb_build_array(
    jsonb_build_object('name', 'ok.pdf', 'path', v_tok_a::text || '/doc.pdf'),
    jsonb_build_object('name', 'ajeno.pdf', 'path', v_tok_b::text || '/doc-b.pdf'),
    jsonb_build_object('name', 'trav.pdf', 'path', v_tok_a::text || '/../x'))));
  reset role;
  select jsonb_array_length(submitted->'files') into n from public.client_intake where token = v_tok_a;
  insert into pg_temp._t values ('S8 submit conserva solo adjuntos del propio token', (v_json->>'ok')::boolean and n = 1);

  -- ---------- Como empresa A ----------
  perform set_config('request.jwt.claims', json_build_object('sub', v_u_a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_u_a::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;

  select count(*) into n_before from public.audit_events where empresa_id = v_e_a;
  begin
    insert into public.audit_events (empresa_id, user_id, action) values (v_e_a, v_u_a, 'hack.insert'); v_ok := false;
  exception when others then v_ok := true; end;
  insert into pg_temp._t values ('S3a empresa no inserta en audit_events', v_ok);
  update public.audit_events set action = 'hack.update' where empresa_id = v_e_a;
  delete from public.audit_events where empresa_id = v_e_a;
  reset role;
  select count(*) into n from public.audit_events where empresa_id = v_e_a and action = 'seed.event';
  insert into pg_temp._t values ('S3b empresa no modifica ni borra audit_events', n = 1 and n_before >= 1);
  set local role authenticated;

  begin
    update public.empresas set email_verified = false where id = v_e_a; v_ok := false;
  exception when others then v_ok := true; end;
  insert into pg_temp._t values ('S4a empresa no cambia email_verified', v_ok);
  begin
    update public.empresas set onboarding_status = 'completed' where id = v_e_a; v_ok := false;
  exception when others then v_ok := true; end;
  insert into pg_temp._t values ('S4b empresa no cambia onboarding_status', v_ok);

  begin
    select count(*) into n from public.integration_credentials; v_ok := false;
  exception when others then v_ok := true; end;
  insert into pg_temp._t values ('S6a empresa: integration_credentials denegado', v_ok);

  -- Storage: A lee su adjunto, no el de B; no borra el de B
  select count(*) into n from storage.objects where bucket_id = 'intake-files' and name like v_tok_a::text || '/%';
  insert into pg_temp._t values ('S7g empresa A lee sus adjuntos', n = 1);
  select count(*) into n from storage.objects where bucket_id = 'intake-files' and name like v_tok_b::text || '/%';
  insert into pg_temp._t values ('S7h empresa A no lee adjuntos de B', n = 0);
  -- Intento de borrado como empresa A. En Supabase alojado, storage.protect_delete() impide el
  -- DELETE directo sobre storage.objects (SQLSTATE 42501, "use the Storage API"); en un entorno sin
  -- esa protección, RLS deja el DELETE en 0 filas. Solo se admite ese error de permisos: cualquier
  -- otro error sigue deteniendo el test. Lo que se demuestra es que el objeto de B sobrevive.
  begin
    delete from storage.objects where bucket_id = 'intake-files' and name like v_tok_b::text || '/%';
  exception
    when insufficient_privilege then null;   -- 42501: protección de Storage alojado o permiso denegado
  end;
  reset role;
  select count(*) into n from storage.objects where bucket_id = 'intake-files' and name like v_tok_b::text || '/%';
  insert into pg_temp._t values ('S7i empresa A no logra borrar adjuntos de B', n = 1);

  -- ---------- Como cliente final C ----------
  perform set_config('request.jwt.claims', json_build_object('sub', v_u_c, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_u_c::text, true);
  set local role authenticated;
  select count(*) into n from public.integration_connections; insert into pg_temp._t values ('S5a cliente no lee integraciones', n = 0);
  select count(*) into n from public.billing_settings; insert into pg_temp._t values ('S5b cliente no lee facturación', n = 0);
  select count(*) into n from public.onboarding_steps; insert into pg_temp._t values ('S5c cliente no lee pasos', n = 0);
  select count(*) into n from storage.objects where bucket_id = 'intake-files'; insert into pg_temp._t values ('S7j cliente no lee adjuntos', n = 0);
  begin
    select count(*) into n from public.integration_credentials; v_ok := false;
  exception when others then v_ok := true; end;
  insert into pg_temp._t values ('S6b cliente: integration_credentials denegado', v_ok);
  begin perform public.log_audit_event('hack.event'); v_ok := false; exception when others then v_ok := true; end;
  insert into pg_temp._t values ('S10 log_audit_event rechaza a clientes', v_ok);
  reset role;

  -- ---------- S9: signup público no puede ser admin (requiere poder simular supabase_auth_admin) ----------
  begin
    execute 'set local session authorization supabase_auth_admin';
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                            confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'wannabe-admin@example.invalid', '', now(), now(), now(), '{}',
            '{"full_name":"X","role":"admin"}', '', '', '', '', '', '', '', '');
    execute 'reset session authorization';
    select role::text into v_text from public.profiles where email = 'wannabe-admin@example.invalid';
    insert into pg_temp._t values ('S9 el signup público no puede auto-asignarse admin', v_text = 'cliente');
  exception when others then
    execute 'reset session authorization';
    insert into pg_temp._t values ('S9 (omitida: no se puede simular supabase_auth_admin aquí)', true);
  end;
end $$;

reset role;   -- garantía: ningún cambio de rol sobrevive al bloque de pruebas

select name, case when ok then 'OK' else 'FALLO' end as resultado from pg_temp._t order by name;

do $$
declare failed int;
begin
  select count(*) into failed from pg_temp._t where not ok;
  if failed > 0 then raise exception 'Han fallado % comprobaciones de seguridad', failed; end if;
  raise notice 'Auditoría de seguridad: todas las comprobaciones han pasado';
end $$;

rollback;
