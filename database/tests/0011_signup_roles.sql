-- Feblio · Pruebas de handle_new_user tras 0011 (roles en el signup).
--
-- Ejecutar en una RAMA de Supabase o en desarrollo, con 0001..0011 aplicadas.
-- Transacción con ROLLBACK final. Simula el signup público de Supabase Auth
-- (inserción en auth.users como supabase_auth_admin; si el entorno no permite
-- SET SESSION AUTHORIZATION, se ejecuta como la sesión actual y se indica).
--
--   R1  alta de empresa desde Landing (role='empresa'): crea empresas, profiles.role='empresa',
--       profiles.empresa_id enlazado, email_verified=false y onboarding_status='not_started'
--       (arranca verificación + wizard), consentimientos y auditoría
--   R2  signup manipulado con role='admin': queda como 'cliente', sin empresa, is_admin()=false,
--       no lee datos de otras empresas y queda auditado (security.admin_signup_blocked)
--   R3  alta de cliente (role='cliente'): profiles.role='cliente', sin empresa creada
--   R4  sesión administrativa (seed) con opt-in explícito: sí puede crear un admin
--   R5  sesión administrativa SIN opt-in: no crea admin

begin;
create temp table _t (name text, ok boolean) on commit drop;
grant all on _t to authenticated;

do $$
declare
  v_emp uuid := gen_random_uuid(); v_adm uuid := gen_random_uuid(); v_cli uuid := gen_random_uuid();
  v_seed uuid := gen_random_uuid(); v_seed2 uuid := gen_random_uuid(); v_other_e uuid;
  r record; n int; v_ok boolean; v_simulated boolean := true; v_text text;
begin
  insert into public.empresas (name, cif) values ('OTRA', 'B11111111') returning id into v_other_e;

  -- ---- Simula GoTrue ----
  begin
    execute 'set local session authorization supabase_auth_admin';
  exception when others then
    v_simulated := false;
  end;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                          confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  values
    ('00000000-0000-0000-0000-000000000000', v_emp, 'authenticated', 'authenticated', 'nueva-empresa@example.invalid', '', null, now(), now(), '{"provider":"email"}',
     '{"full_name":"Ana Pérez","role":"empresa","company_name":"Nueva Empresa SL","entity_type":"company","tax_type":"CIF","tax_id":"b-12.345.674","terms_accepted":true,"terms_version":"2026-09-17","privacy_version":"2026-09-17","marketing_consent":false,"user_agent":"UA"}',
     '', '', '', '', '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_adm, 'authenticated', 'authenticated', 'wannabe-admin@example.invalid', '', null, now(), now(), '{"provider":"email"}',
     '{"full_name":"Mal Actor","role":"admin","terms_accepted":true}', '', '', '', '', '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_cli, 'authenticated', 'authenticated', 'cliente-final@example.invalid', '', null, now(), now(), '{"provider":"email"}',
     '{"full_name":"Casa Chona","role":"cliente"}', '', '', '', '', '', '', '', '');
  if v_simulated then execute 'reset session authorization'; end if;

  -- R1: empresa válida
  select p.role::text as role, p.empresa_id, p.is_onboarding_owner, e.name, e.cif, e.entity_type, e.email_verified, e.onboarding_status
    into r
  from public.profiles p left join public.empresas e on e.id = p.empresa_id where p.id = v_emp;
  insert into _t values ('R1a empresa: profiles.role = empresa', r.role = 'empresa');
  insert into _t values ('R1b empresa: fila en empresas con datos del registro', r.name = 'Nueva Empresa SL' and r.cif = 'B12345674' and r.entity_type = 'company');
  insert into _t values ('R1c empresa: profiles.empresa_id enlazado y propietario del onboarding', r.empresa_id is not null and r.is_onboarding_owner);
  insert into _t values ('R1d empresa: arranca verificación (email_verified=false) y wizard (not_started)', r.email_verified = false and r.onboarding_status = 'not_started');
  select count(*) into n from public.consent_records where user_id = v_emp and accepted and consent_type in ('terms_of_service', 'privacy_policy');
  insert into _t values ('R1e empresa: consentimientos registrados', n = 2);
  select count(*) into n from public.audit_events where user_id = v_emp and action = 'empresa.registered';
  insert into _t values ('R1f empresa: auditoría empresa.registered', n = 1);

  -- R2: intento de admin
  select role::text, empresa_id into v_text, v_other_e from public.profiles where id = v_adm;
  insert into _t values (case when v_simulated then 'R2a admin manipulado → cliente' else 'R2a admin manipulado → cliente (sin simular supabase_auth_admin)' end, v_text = 'cliente');
  insert into _t values ('R2b admin manipulado: sin empresa creada', (select empresa_id from public.profiles where id = v_adm) is null);
  select count(*) into n from public.audit_events where user_id = v_adm and action = 'security.admin_signup_blocked' and result = 'blocked';
  insert into _t values ('R2c admin manipulado: auditado como bloqueado', n = 1);
  -- sin permisos de plataforma: is_admin() falso y no ve empresas ajenas
  perform set_config('request.jwt.claims', json_build_object('sub', v_adm, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_adm::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  insert into _t values ('R2d admin manipulado: is_admin() = false', public.is_admin() = false);
  select count(*) into n from public.empresas;
  insert into _t values ('R2e admin manipulado: no lee empresas de la plataforma', n = 0);
  begin perform public.get_onboarding(); v_ok := false; exception when others then v_ok := true; end;
  insert into _t values ('R2f admin manipulado: no accede al onboarding empresarial', v_ok);
  reset role;

  -- R3: cliente válido
  select role::text, empresa_id into v_text, v_other_e from public.profiles where id = v_cli;
  insert into _t values ('R3a cliente: profiles.role = cliente', v_text = 'cliente');
  insert into _t values ('R3b cliente: no crea empresa', (select empresa_id from public.profiles where id = v_cli) is null and not exists (select 1 from public.empresas where name = 'Casa Chona'));

  -- R4/R5: sesión administrativa directa (seed), con y sin opt-in
  insert into public.platform_settings (key, value) values ('allow_admin_signup', 'true'::jsonb) on conflict (key) do update set value = 'true'::jsonb;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                          confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  values ('00000000-0000-0000-0000-000000000000', v_seed, 'authenticated', 'authenticated', 'seed-admin@example.invalid', '', now(), now(), now(), '{}', '{"full_name":"Seed","role":"admin"}', '', '', '', '', '', '', '', '');
  select role::text into v_text from public.profiles where id = v_seed;
  insert into _t values (case when session_user in ('postgres') or v_simulated then 'R4 seed con opt-in: crea admin' else 'R4 seed con opt-in (sesión no administrativa): degradado' end,
                         case when session_user in ('supabase_auth_admin', 'authenticator', 'anon', 'authenticated', 'service_role') then v_text = 'cliente' else v_text = 'admin' end);
  delete from public.platform_settings where key = 'allow_admin_signup';
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                          confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  values ('00000000-0000-0000-0000-000000000000', v_seed2, 'authenticated', 'authenticated', 'seed-admin2@example.invalid', '', now(), now(), now(), '{}', '{"full_name":"Seed2","role":"admin"}', '', '', '', '', '', '', '', '');
  select role::text into v_text from public.profiles where id = v_seed2;
  insert into _t values ('R5 seed sin opt-in: no crea admin', v_text = 'cliente');
end $$;

select name, case when ok then 'OK' else 'FALLO' end as resultado from _t order by name;

do $$
declare failed int;
begin
  select count(*) into failed from _t where not ok;
  if failed > 0 then raise exception 'Han fallado % comprobaciones de roles en el signup', failed; end if;
  raise notice 'Roles en el signup: todas las comprobaciones han pasado';
end $$;

rollback;
