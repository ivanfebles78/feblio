-- Feblio · Pruebas de 0015 (idioma de la empresa en contextos públicos). Transacción con ROLLBACK.
--   L1 la vista del cliente por token incluye empresa.language y nada más nuevo (name, logo_url, language)
--   L2 un idioma no soportado en la empresa se devuelve como 'es'
--   L3 get_intake_form devuelve language sin exponer otros campos nuevos de la empresa
--   L4 anon puede ejecutar get_intake_form pero no sol_vista_cliente; token inválido sigue rechazado
--   L5 el idioma de la empresa no se filtra en la vista de otra empresa (aislamiento por token)
begin;
create temp table _t (name text, ok boolean) on commit drop;
grant insert on table pg_temp._t to authenticated, anon;

create function pg_temp.as_user(u uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
end $f$;
create function pg_temp.as_anon() returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'anon', true);
  execute 'set local role anon';
end $f$;

do $$
declare
  v_ua uuid := gen_random_uuid(); v_ea uuid; v_eb uuid; v_sol uuid; v_link jsonb; v_tok text; v_view jsonb; v_ci uuid; v_form jsonb; v_ok boolean;
begin
  insert into public.empresas (name, cif, email_verified, onboarding_status, language) values ('Empresa EN', 'B33333333', true, 'completed', 'en') returning id into v_ea;
  insert into public.empresas (name, cif, email_verified, onboarding_status, language) values ('Empresa PT', 'B44444444', true, 'completed', 'pt') returning id into v_eb;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                          confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  values ('00000000-0000-0000-0000-000000000000', v_ua, 'authenticated', 'authenticated', 'i18n@example.invalid', '', now(), now(), now(), '{}', '{"role":"cliente","full_name":"I18n"}', '', '', '', '', '', '', '', '');
  update public.profiles set role = 'empresa', empresa_id = v_ea where id = v_ua;

  -- Solicitud + enlace de la empresa EN
  perform pg_temp.as_user(v_ua);
  v_sol := public.solicitud_crear(jsonb_build_object('contact_name', 'Ana', 'title', 'Idioma', 'source_channel', 'email', 'is_test', true));
  v_link := public.solicitud_generar_enlace(v_sol, 7); v_tok := v_link->>'token';
  reset role;

  perform pg_temp.as_anon();
  v_view := public.solicitud_acceso_obtener(v_tok);
  insert into pg_temp._t values ('L1 vista del cliente: empresa.language = en y solo name/logo_url/language',
    (v_view->'empresa'->>'language') = 'en' and (select array_agg(k order by k) from jsonb_object_keys(v_view->'empresa') k) = array['language', 'logo_url', 'name']);
  begin perform public.solicitud_acceso_obtener('x' || substr(v_tok, 2)); v_ok := false; exception when others then v_ok := true; end;
  insert into pg_temp._t values ('L4a token manipulado sigue rechazado', v_ok);
  begin perform public.sol_vista_cliente(null::public.solicitudes, null::public.solicitud_accesos); v_ok := false; exception when insufficient_privilege then v_ok := true; end;
  insert into pg_temp._t values ('L4b anon no ejecuta sol_vista_cliente directamente', v_ok);
  reset role;

  -- Empresa con idioma no soportado → 'es'
  update public.empresas set language = 'pt' where id = v_ea;
  perform pg_temp.as_anon();
  v_view := public.solicitud_acceso_obtener(v_tok);
  insert into pg_temp._t values ('L2 idioma no soportado (pt) se entrega como es', (v_view->'empresa'->>'language') = 'es');
  reset role;
  update public.empresas set language = 'en' where id = v_ea;

  -- Formulario público heredado (client_intake) de la empresa EN
  insert into public.client_intake (empresa_id, status) values (v_ea, 'pendiente') returning token into v_ci;
  perform pg_temp.as_anon();
  v_form := public.get_intake_form(v_ci);
  insert into pg_temp._t values ('L3 get_intake_form devuelve language = en y las mismas claves de antes + language',
    (v_form->>'language') = 'en' and (select array_agg(k order by k) from jsonb_object_keys(v_form) k) = array['empresa', 'form', 'is_test', 'language', 'logo_url', 'primary_color', 'project_types', 'status']);
  insert into pg_temp._t values ('L4c get_intake_form con token inexistente devuelve null', public.get_intake_form(gen_random_uuid()) is null);
  reset role;

  -- Aislamiento: la vista de la solicitud de EN nunca muestra datos de PT
  perform pg_temp.as_anon();
  v_view := public.solicitud_acceso_obtener(v_tok);
  insert into pg_temp._t values ('L5 la vista solo lleva el idioma de su propia empresa', (v_view->'empresa'->>'name') = 'Empresa EN' and (v_view->'empresa'->>'language') = 'en');
  reset role;
end $$;

reset role;
select name, case when ok then 'OK' else 'FALLO' end as resultado from pg_temp._t order by name;
do $$
declare failed int;
begin
  select count(*) into failed from pg_temp._t where not ok;
  if failed > 0 then raise exception 'Han fallado % comprobaciones de 0015', failed; end if;
  raise notice 'i18n 0015: todas las comprobaciones han pasado';
end $$;
rollback;
