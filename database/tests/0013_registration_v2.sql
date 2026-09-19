-- Feblio · Pruebas de 0013 (registro simplificado + bienvenida única).
--
-- Ejecutar con 0001..0013 aplicadas. Transacción con ROLLBACK final: no deja datos.
-- Simula el signup público (inserción en auth.users como supabase_auth_admin si el
-- entorno lo permite) y las llamadas del frontend como el usuario autenticado.
--
--   N1  nueva empresa desde el registro v2 (solo razón social, CIF/NIF, responsable, email,
--       consentimientos): crea empresa not_started, sin bienvenida vista, configuración inicial
--       vacía (0 pasos, 0 integraciones), profile role=empresa y consentimientos
--   N2  el registro público NUNCA crea admin (role='admin' → cliente) ni empresa
--   N3  bienvenida una sola vez: mark_onboarding_welcome_seen() marca; la segunda llamada
--       devuelve la misma marca (idempotente); el UPDATE directo desde el cliente se bloquea
--   N4  acceso al dashboard con onboarding incompleto: la empresa lee sus datos (empresas,
--       projects, clientes, tasks), usa get_onboarding() y actualiza su propia empresa (regresión
--       de 0011 corregida) sin poder tocar las columnas onboarding_* directamente
--   N5  empresa existente ya operativa (completed): el backfill la deja con bienvenida vista;
--       status y datos intactos
--   N6  aislamiento: la empresa A no marca ni lee la bienvenida de la empresa B; un cliente
--       no puede usar el RPC
--   N7  reintentos sin duplicados: 1 empresa, 1 profile y 3 consentimientos por usuario;
--       ensure_onboarding_defaults repetido no duplica pasos

begin;
create temp table _t (name text, ok boolean) on commit drop;
grant insert on table pg_temp._t to authenticated;

do $$
declare
  v_new uuid := gen_random_uuid(); v_adm uuid := gen_random_uuid(); v_cli uuid := gen_random_uuid();
  v_new_e uuid; v_old_e uuid; v_old_u uuid := gen_random_uuid();
  r record; n int; v_ok boolean; v_simulated boolean := true; v_seen1 timestamptz; v_seen2 timestamptz; j jsonb;
begin
  -- N5 (preparación): empresa "antigua" ya operativa, como las existentes antes de 0013
  insert into public.empresas (name, cif, email_verified, onboarding_status, onboarding_completed_at)
  values ('Empresa Operativa SL', 'B22222222', true, 'completed', now() - interval '30 days')
  returning id into v_old_e;
  -- Re-aplica el backfill de 0013 sobre esta fila (la migración ya corrió; la fila es nueva)
  update public.empresas set onboarding_welcome_seen_at = coalesce(onboarding_completed_at, now())
   where id = v_old_e and onboarding_welcome_seen_at is null and onboarding_status <> 'not_started';

  -- ---- Simula GoTrue ----
  begin
    execute 'set local session authorization supabase_auth_admin';
  exception when others then
    v_simulated := false;
  end;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                          confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  values
    ('00000000-0000-0000-0000-000000000000', v_new, 'authenticated', 'authenticated', 'registro-v2@example.invalid', '', null, now(), now(), '{"provider":"email"}',
     '{"full_name":"Laura Martín","role":"empresa","company_name":"Construcciones Norte SL","entity_type":"company","tax_type":"CIF","tax_id":"b-12.345.674","terms_accepted":true,"terms_version":"2026-09-17","privacy_version":"2026-09-17","marketing_consent":false,"user_agent":"UA"}',
     '', '', '', '', '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_adm, 'authenticated', 'authenticated', 'wannabe-admin-v2@example.invalid', '', null, now(), now(), '{"provider":"email"}',
     '{"full_name":"Mal Actor","role":"admin","company_name":"X","terms_accepted":true}', '', '', '', '', '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_cli, 'authenticated', 'authenticated', 'cliente-v2@example.invalid', '', now(), now(), now(), '{"provider":"email"}',
     '{"full_name":"Cliente Final","role":"cliente"}', '', '', '', '', '', '', '', '');
  if v_simulated then execute 'reset session authorization'; end if;

  -- N1
  select p.role::text as role, p.empresa_id, p.full_name, e.name, e.cif, e.entity_type, e.onboarding_status, e.onboarding_welcome_seen_at, e.email_verified
    into r from public.profiles p left join public.empresas e on e.id = p.empresa_id where p.id = v_new;
  v_new_e := r.empresa_id;
  insert into pg_temp._t values ('N1a registro v2: profile role=empresa y responsable guardado', r.role = 'empresa' and r.full_name = 'Laura Martín');
  insert into pg_temp._t values ('N1b registro v2: empresa con razón social y CIF normalizado', r.name = 'Construcciones Norte SL' and r.cif = 'B12345674' and r.entity_type = 'company');
  insert into pg_temp._t values ('N1c registro v2: onboarding not_started y bienvenida pendiente', r.onboarding_status = 'not_started' and r.onboarding_welcome_seen_at is null and r.email_verified = false);
  select count(*) into n from public.onboarding_steps where empresa_id = v_new_e;
  insert into pg_temp._t values ('N1d registro v2: configuración inicial vacía (0 pasos)', n = 0);
  select count(*) into n from public.consent_records where user_id = v_new and consent_type in ('terms_of_service', 'privacy_policy') and accepted;
  insert into pg_temp._t values ('N1e registro v2: términos y privacidad aceptados', n = 2);
  select accepted into v_ok from public.consent_records where user_id = v_new and consent_type = 'marketing';
  insert into pg_temp._t values ('N1f registro v2: marketing opcional (rechazado)', v_ok = false);

  -- N2
  insert into pg_temp._t values ('N2a registro público con role=admin → cliente', (select role::text from public.profiles where id = v_adm) = 'cliente');
  insert into pg_temp._t values ('N2b registro público con role=admin: sin empresa', (select empresa_id from public.profiles where id = v_adm) is null);

  -- N7 (parte 1): sin duplicados tras el alta
  select count(*) into n from public.profiles where id = v_new;
  insert into pg_temp._t values ('N7a un único profile por usuario', n = 1);
  select count(*) into n from public.audit_events where user_id = v_new and action = 'empresa.registered';
  insert into pg_temp._t values ('N7b una única empresa por registro (una sola alta auditada)', n = 1 and (select count(*) from public.profiles where id = v_new and empresa_id = v_new_e) = 1);
  select count(*) into n from public.consent_records where user_id = v_new;
  insert into pg_temp._t values ('N7c tres consentimientos por usuario (sin duplicados)', n = 3);

  -- ---- Como la nueva empresa (sesión authenticated) ----
  perform set_config('request.jwt.claims', json_build_object('sub', v_new, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_new::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;

  -- N4: acceso al dashboard con onboarding incompleto
  select count(*) into n from public.empresas where id = v_new_e;
  insert into pg_temp._t values ('N4a onboarding incompleto: lee su empresa', n = 1);
  begin
    perform (select count(*) from public.projects) + (select count(*) from public.clientes) + (select count(*) from public.tasks);
    v_ok := true;
  exception when others then v_ok := false; end;
  insert into pg_temp._t values ('N4b onboarding incompleto: lee proyectos, clientes y tareas (0 filas, sin bloqueo)', v_ok);
  begin
    j := public.get_onboarding();
    v_ok := (j->'empresa'->>'onboarding_status') = 'not_started';
  exception when others then v_ok := false; end;
  insert into pg_temp._t values ('N4c onboarding incompleto: get_onboarding() disponible', v_ok);
  begin
    update public.empresas set city = 'Madrid', phone = '+34600000000' where id = v_new_e; v_ok := true;
  exception when others then v_ok := false; end;
  insert into pg_temp._t values ('N4d la empresa actualiza sus propios datos (guarda evaluable; corrección de 0011)', v_ok and (select city from public.empresas where id = v_new_e) = 'Madrid');
  begin
    update public.empresas set onboarding_status = 'completed' where id = v_new_e; v_ok := false;
  exception when insufficient_privilege then v_ok := true; end;
  insert into pg_temp._t values ('N4e la empresa NO puede cambiar onboarding_status por UPDATE directo', v_ok);
  select count(*) into n from public.onboarding_steps where empresa_id = v_new_e;
  insert into pg_temp._t values ('N7d ensure_onboarding_defaults crea los 10 pasos', n = 10);
  perform public.get_onboarding();
  select count(*) into n from public.onboarding_steps where empresa_id = v_new_e;
  insert into pg_temp._t values ('N7e ensure_onboarding_defaults repetido no duplica pasos', n = 10);

  -- N3: bienvenida una sola vez
  j := public.mark_onboarding_welcome_seen();
  v_seen1 := (j->>'seen_at')::timestamptz;
  insert into pg_temp._t values ('N3a mark_onboarding_welcome_seen marca la bienvenida', v_seen1 is not null and (j->>'ok')::boolean);
  perform pg_sleep(0.01);
  j := public.mark_onboarding_welcome_seen();
  v_seen2 := (j->>'seen_at')::timestamptz;
  insert into pg_temp._t values ('N3b segunda llamada: misma marca (idempotente)', v_seen2 = v_seen1);
  begin
    update public.empresas set onboarding_welcome_seen_at = null where id = v_new_e;
    v_ok := false;
  exception when insufficient_privilege then v_ok := true; end;
  insert into pg_temp._t values ('N3c el cliente no puede desmarcar la bienvenida por UPDATE directo', v_ok);
  insert into pg_temp._t values ('N3d el onboarding sigue not_started tras la bienvenida (no fuerza el wizard)', (j->>'onboarding_status') = 'not_started');

  -- N6a: no ve la empresa B
  select count(*) into n from public.empresas where id = v_old_e;
  insert into pg_temp._t values ('N6a aislamiento: la empresa nueva no lee la empresa operativa', n = 0);
  reset role;

  -- N5: empresa operativa intacta
  select onboarding_status, onboarding_welcome_seen_at into r from public.empresas where id = v_old_e;
  insert into pg_temp._t values ('N5a empresa operativa: sigue completed', r.onboarding_status = 'completed');
  insert into pg_temp._t values ('N5b empresa operativa: bienvenida ya marcada por el backfill (nunca la verá)', r.onboarding_welcome_seen_at is not null);
  insert into pg_temp._t values ('N5c empresa nueva: bienvenida vista solo en la nueva, no afecta a la operativa', (select onboarding_welcome_seen_at from public.empresas where id = v_old_e) < (select onboarding_welcome_seen_at from public.empresas where id = v_new_e));

  -- N6b: un cliente no puede usar el RPC
  perform set_config('request.jwt.claims', json_build_object('sub', v_cli, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_cli::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  begin perform public.mark_onboarding_welcome_seen(); v_ok := false; exception when others then v_ok := true; end;
  insert into pg_temp._t values ('N6b un cliente final no puede marcar bienvenidas', v_ok);
  reset role;

  -- N6c: anon no puede ejecutar el RPC
  insert into pg_temp._t values ('N6c anon sin permiso de ejecución sobre el RPC', not has_function_privilege('anon', 'public.mark_onboarding_welcome_seen()', 'execute'));
end $$;

reset role;

select name, case when ok then 'OK' else 'FALLO' end as resultado from pg_temp._t order by name;

do $$
declare failed int;
begin
  select count(*) into failed from pg_temp._t where not ok;
  if failed > 0 then raise exception 'Han fallado % comprobaciones de 0013', failed; end if;
  raise notice 'Registro v2 / bienvenida: todas las comprobaciones han pasado';
end $$;

rollback;
