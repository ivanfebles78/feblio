-- Feblio · Pruebas de 0021 (facturación Stripe). ROLLBACK final. Sin datos reales ni claves.
--   S1 billing_set_customer: fija el customer; idempotente; no sobrescribe uno distinto.
--   S2 billing_apply_subscription: refleja el estado real (active/past_due/canceled) y el fin de periodo.
--   S3 validación: estado inválido y empresa inexistente se rechazan.
--   S4 guarda: la empresa no puede editar subscription_status ni las columnas de Stripe a mano.
--   S5 permisos: authenticated no puede ejecutar las RPC de facturación.
begin;
create temp table _t (name text, ok boolean) on commit drop;
grant insert on table pg_temp._t to authenticated, anon, service_role;

create function pg_temp.as_user(u uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
end $f$;
create function pg_temp.mkuser(u uuid, mail text) returns void language plpgsql as $f$
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change_token_new,
                          email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  values ('00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated', mail, '', now(), now(), now(),
          '{}', '{"role":"cliente","full_name":"Prueba 0021"}', '', '', '', '', '', '', '', '');
end $f$;

do $$
declare
  v_ea uuid; u_owner uuid := gen_random_uuid();
  v_status text; v_cust text; v_sub text; v_ok boolean; v_detail text;
begin
  insert into public.empresas (name, cif, email_verified, onboarding_status, subscription_status, trial_ends_at)
  values ('Facturación A SL', 'B70000201', true, 'completed', 'trial', now() + interval '14 days') returning id into v_ea;
  perform pg_temp.mkuser(u_owner, 'bill-owner@example.invalid');
  update public.profiles set role = 'empresa', empresa_id = v_ea, is_onboarding_owner = true, company_role = 'owner' where id = u_owner;

  -- S1 billing_set_customer (contexto service_role: aquí superusuario del test) -------------------
  perform public.billing_set_customer(v_ea, 'cus_TEST123');
  select stripe_customer_id into v_cust from public.empresas where id = v_ea;
  insert into pg_temp._t values ('S1a fija el customer de Stripe', v_cust = 'cus_TEST123');
  perform public.billing_set_customer(v_ea, 'cus_TEST123');
  select stripe_customer_id into v_cust from public.empresas where id = v_ea;
  insert into pg_temp._t values ('S1b es idempotente con el mismo customer', v_cust = 'cus_TEST123');
  perform public.billing_set_customer(v_ea, 'cus_OTRO');
  select stripe_customer_id into v_cust from public.empresas where id = v_ea;
  insert into pg_temp._t values ('S1c no sobrescribe un customer distinto', v_cust = 'cus_TEST123');

  -- S2 billing_apply_subscription -----------------------------------------------------------------
  perform public.billing_apply_subscription(v_ea, 'active', 'sub_TEST', now() + interval '30 days');
  select subscription_status, stripe_subscription_id into v_status, v_sub from public.empresas where id = v_ea;
  insert into pg_temp._t values ('S2a active con subscription y fin de periodo', v_status = 'active' and v_sub = 'sub_TEST');
  perform public.billing_apply_subscription(v_ea, 'past_due', null, null);
  select subscription_status, stripe_subscription_id into v_status, v_sub from public.empresas where id = v_ea;
  insert into pg_temp._t values ('S2b past_due conserva el subscription anterior', v_status = 'past_due' and v_sub = 'sub_TEST');
  perform public.billing_apply_subscription(v_ea, 'canceled', 'sub_TEST', null);
  select subscription_status into v_status from public.empresas where id = v_ea;
  insert into pg_temp._t values ('S2c canceled', v_status = 'canceled');

  -- S3 validación ---------------------------------------------------------------------------------
  begin perform public.billing_apply_subscription(v_ea, 'inventado', null, null); v_ok := false;
  exception when others then get stacked diagnostics v_detail = pg_exception_detail; v_ok := true; end;
  insert into pg_temp._t values ('S3a estado inválido rechazado', v_ok and v_detail = 'invalid_subscription_status');
  begin perform public.billing_apply_subscription(gen_random_uuid(), 'active', null, null); v_ok := false;
  exception when others then get stacked diagnostics v_detail = pg_exception_detail; v_ok := true; end;
  insert into pg_temp._t values ('S3b empresa inexistente → PT404', v_ok and v_detail = 'company_not_found');

  -- S4 guarda de columnas de estado ---------------------------------------------------------------
  perform pg_temp.as_user(u_owner);
  begin update public.empresas set subscription_status = 'active' where id = v_ea; v_ok := false;
  exception when others then get stacked diagnostics v_detail = returned_sqlstate; v_ok := true; end;
  insert into pg_temp._t values ('S4a la empresa no cambia subscription_status a mano', v_ok and v_detail = '42501');
  begin update public.empresas set stripe_customer_id = 'cus_HACK' where id = v_ea; v_ok := false;
  exception when others then get stacked diagnostics v_detail = returned_sqlstate; v_ok := true; end;
  insert into pg_temp._t values ('S4b la empresa no toca stripe_customer_id a mano', v_ok and v_detail = '42501');

  -- S5 permisos de ejecución ----------------------------------------------------------------------
  begin perform public.billing_apply_subscription(v_ea, 'active', null, null); v_ok := false;
  exception when others then v_ok := true; end;
  insert into pg_temp._t values ('S5 authenticated no ejecuta billing_apply_subscription', v_ok);
end $$;

reset role;
select name, case when ok then 'OK' else 'FALLO' end as resultado from pg_temp._t order by name;
do $$
declare failed int;
begin
  select count(*) into failed from pg_temp._t where not ok;
  if failed > 0 then raise exception 'Han fallado % comprobaciones de 0021', failed; end if;
  raise notice 'Facturación 0021: todas las comprobaciones han pasado';
end $$;
rollback;
