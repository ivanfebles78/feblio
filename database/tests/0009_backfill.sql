-- Feblio · Prueba del backfill del onboarding (0009) sin GUC personalizados.
--
-- Ejecutar en una RAMA de Supabase o en desarrollo, con 0001..0011 aplicadas.
-- Transacción con ROLLBACK final.
--
--   B1  una empresa existente queda completed tras el backfill, con completed_at y started_at coherentes
--   B2  el backfill es de una sola ejecución: una empresa nueva queda not_started aunque se repita
--   B3  una empresa autenticada no puede modificar onboarding_status directamente
--   B4  authenticated no puede ejecutar la función interna de backfill
--   B5  ninguna función de public depende de un GUC personalizado (feblio.*)

begin;
create temp table _t (name text, ok boolean) on commit drop;
grant all on _t to authenticated;

do $$
declare v_old uuid; v_new uuid; v_u uuid := gen_random_uuid(); r record; n int; v_ok boolean;
begin
  -- Simula el estado previo a la migración: empresa antigua sin onboarding y sin marca de backfill
  delete from public.platform_settings where key = 'onboarding_backfill_done';
  insert into public.empresas (name, cif, created_at) values ('ANTIGUA', 'B12345674', now() - interval '30 days') returning id into v_old;
  update public.empresas set onboarding_status = 'not_started', onboarding_started_at = null, onboarding_completed_at = null where id = v_old;

  perform public.onboarding_backfill_existing();
  select onboarding_status, onboarding_started_at, onboarding_completed_at, created_at into r from public.empresas where id = v_old;
  insert into _t values ('B1a empresa existente → completed', r.onboarding_status = 'completed');
  insert into _t values ('B1b completed_at establecido', r.onboarding_completed_at is not null);
  insert into _t values ('B1c started_at coherente (= created_at, anterior a completed_at)', r.onboarding_started_at = r.created_at and r.onboarding_started_at <= r.onboarding_completed_at);
  insert into _t values ('B1d marca onboarding_backfill_done registrada', exists (select 1 from public.platform_settings where key = 'onboarding_backfill_done'));

  -- Empresa nueva (registro posterior): no debe completarse aunque se reejecute la migración
  insert into public.empresas (name, cif) values ('NUEVA', 'B98765432') returning id into v_new;
  perform public.onboarding_backfill_existing();
  select onboarding_status into r from public.empresas where id = v_new;
  insert into _t values ('B2 empresa nueva sigue not_started tras repetir el backfill', r.onboarding_status = 'not_started');

  -- Usuario empresa autenticado: no puede tocar onboarding_status ni ejecutar el backfill
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                          confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  values ('00000000-0000-0000-0000-000000000000', v_u, 'authenticated', 'authenticated', 'bf@example.invalid', '', now(), now(), now(), '{}', '{}', '', '', '', '', '', '', '', '');
  update public.profiles set role = 'empresa', empresa_id = v_new where id = v_u;
  perform set_config('request.jwt.claims', json_build_object('sub', v_u, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_u::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  begin
    update public.empresas set onboarding_status = 'completed' where id = v_new; v_ok := false;
  exception when others then v_ok := true; end;
  insert into _t values ('B3 empresa autenticada no modifica onboarding_status', v_ok);
  begin perform public.onboarding_backfill_existing(); v_ok := false; exception when others then v_ok := true; end;
  insert into _t values ('B4 authenticated no ejecuta onboarding_backfill_existing', v_ok);
  reset role;
  select onboarding_status into r from public.empresas where id = v_new;
  insert into _t values ('B3b onboarding_status intacto', r.onboarding_status = 'not_started');

  -- Sin dependencia de GUC personalizados en funciones de public (cuerpo ni cláusula SET)
  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and (p.prosrc ilike '%feblio.trusted%' or p.prosrc ilike '%feblio.allow%' or coalesce(array_to_string(p.proconfig, ','), '') ilike '%feblio.%');
  insert into _t values ('B5 ninguna función depende de un GUC feblio.*', n = 0);
end $$;

select name, case when ok then 'OK' else 'FALLO' end as resultado from _t order by name;

do $$
declare failed int;
begin
  select count(*) into failed from _t where not ok;
  if failed > 0 then raise exception 'Han fallado % comprobaciones del backfill', failed; end if;
  raise notice 'Backfill del onboarding: todas las comprobaciones han pasado';
end $$;

rollback;
