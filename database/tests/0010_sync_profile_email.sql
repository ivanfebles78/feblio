-- Feblio · Prueba del trigger de sincronización de email (migración 0010).
--
-- Ejecutar en una RAMA de Supabase o en desarrollo, con 0001..0010 aplicadas.
-- Todo ocurre en una transacción que termina en ROLLBACK: no deja rastro.
-- Comprueba que:
--   T1  al cambiar auth.users.email se actualiza profiles.email
--   T2  role, empresa_id y cliente_id del perfil no cambian
--   T3  clientes.email del cliente vinculado se actualiza
--   T4  un update de auth.users que no toca el email no altera profiles
--   T5  el rol authenticated no puede ejecutar la función del trigger
--   T6  un usuario autenticado no puede cambiar el email de su perfil ni el de otros (guard 0009)

begin;

create temp table _t (name text, ok boolean) on commit drop;
grant all on _t to authenticated;

do $$
declare
  v_u uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_e uuid; v_cli uuid;
  v_role text; v_email text; v_cli_email text; v_emp uuid; v_cli_id uuid; v_ok boolean;
begin
  insert into public.empresas (name, cif, entity_type, email_verified, onboarding_status)
  values ('TEST_SYNC', 'B12345674', 'company', true, 'completed') returning id into v_e;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                          confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  values
    ('00000000-0000-0000-0000-000000000000', v_u, 'authenticated', 'authenticated', 'antiguo@example.invalid', '', now(), now(), now(), '{"provider":"email"}', '{"full_name":"Casa Chona","role":"cliente"}', '', '', '', '', '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_other, 'authenticated', 'authenticated', 'otro@example.invalid', '', now(), now(), now(), '{"provider":"email"}', '{"full_name":"Otro","role":"cliente"}', '', '', '', '', '', '', '', '');

  insert into public.clientes (empresa_id, name, email, linked_profile_id) values (v_e, 'Casa Chona', 'antiguo@example.invalid', v_u) returning id into v_cli;
  update public.profiles set empresa_id = v_e, cliente_id = v_cli where id = v_u;

  -- Simula el cambio desde Supabase Authentication (panel / Admin API)
  update auth.users set email = 'nuevo@example.invalid', updated_at = now() where id = v_u;

  select email, role::text, empresa_id, cliente_id into v_email, v_role, v_emp, v_cli_id from public.profiles where id = v_u;
  insert into _t values ('T1 profiles.email sincronizado', v_email = 'nuevo@example.invalid');
  insert into _t values ('T2 role/empresa_id/cliente_id intactos', v_role = 'cliente' and v_emp = v_e and v_cli_id = v_cli);
  select email into v_cli_email from public.clientes where id = v_cli;
  insert into _t values ('T3 clientes.email sincronizado', v_cli_email = 'nuevo@example.invalid');

  -- Un update sin cambio de email no toca el perfil
  update auth.users set updated_at = now() where id = v_other;
  select email into v_email from public.profiles where id = v_other;
  insert into _t values ('T4 update sin cambio de email no altera profiles', v_email = 'otro@example.invalid');

  -- authenticated no puede ejecutar la función del trigger
  insert into _t values ('T5 authenticated sin EXECUTE sobre handle_user_email_change',
    not has_function_privilege('authenticated', 'public.handle_user_email_change()', 'EXECUTE'));

  -- Un usuario autenticado no puede cambiar emails de perfiles (ni el suyo ni el de otros)
  perform set_config('request.jwt.claims', json_build_object('sub', v_u, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_u::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  begin
    update public.profiles set email = 'hack@example.invalid' where id = v_u;
    v_ok := false;
  exception when others then v_ok := true;
  end;
  insert into _t values ('T6 un usuario no cambia su email de perfil', v_ok);
  update public.profiles set email = 'hack@example.invalid' where id = v_other;   -- RLS: 0 filas afectadas
  reset role;
  select email into v_email from public.profiles where id = v_other;
  insert into _t values ('T6b un usuario no cambia el email de otro perfil', v_email = 'otro@example.invalid');
end $$;

select name, case when ok then 'OK' else 'FALLO' end as resultado from _t order by name;

do $$
declare failed int;
begin
  select count(*) into failed from _t where not ok;
  if failed > 0 then raise exception 'Han fallado % comprobaciones del trigger de sincronización', failed; end if;
  raise notice 'Sincronización de email: todas las comprobaciones han pasado';
end $$;

rollback;
