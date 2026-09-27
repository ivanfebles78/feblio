-- Feblio · Pruebas de 0020 (revisión humana del análisis inteligente). ROLLBACK final. Sin datos reales.
--   S1 encolado y persistencia (0019): encolar deja version 1 'queued'; guardar deja 'generated'
--      con los ítems válidos y descarta el servicio inexistente con aviso.
--   S2 abrir_revision: owner mueve generated → in_review; es idempotente en otros estados.
--   S3 item_estado: aceptar, editar (guarda human_value) y descartar; estado inválido rechazado.
--   S4 aislamiento: la empresa B no puede abrir, marcar ítems ni revisar el análisis de A (PT404).
--   S5 permisos: un member no puede revisar (analysis_forbidden); anon no tiene acceso.
--   S6 aprobar: estado 'approved', fila de revisión con changed_items = editados + descartados.
--   S7 inmutable: tras aprobar no se pueden tocar ítems (analysis_closed) ni revisar de nuevo.
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
create function pg_temp.as_anon() returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.role', 'anon', true);
  execute 'set local role anon';
end $f$;
create function pg_temp.mkuser(u uuid, mail text) returns void language plpgsql as $f$
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change_token_new,
                          email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  values ('00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated', mail, '', now(), now(), now(),
          '{}', '{"role":"cliente","full_name":"Prueba 0020"}', '', '', '', '', '', '', '', '');
end $f$;

do $$
declare
  v_ea uuid; v_eb uuid;
  u_owner uuid := gen_random_uuid(); u_mem uuid := gen_random_uuid(); u_b uuid := gen_random_uuid();
  v_sol uuid; v_ana public.solicitud_analisis_ia; v_item public.solicitud_analisis_items;
  v_dl uuid; v_q uuid; v_mi uuid; v_row public.solicitud_analisis_ia;
  v_detail text; v_state text; v_ok boolean; n int;
begin
  -- Empresas y usuarios --------------------------------------------------------------------------
  insert into public.empresas (name, cif, email_verified, onboarding_status, language, currency)
  values ('Análisis A SL', 'B70000101', true, 'completed', 'es', 'EUR') returning id into v_ea;
  insert into public.empresas (name, cif, email_verified, onboarding_status, language, currency)
  values ('Análisis B SL', 'B70000102', true, 'completed', 'es', 'EUR') returning id into v_eb;

  perform pg_temp.mkuser(u_owner, 'ana-owner@example.invalid');
  perform pg_temp.mkuser(u_mem, 'ana-member@example.invalid');
  perform pg_temp.mkuser(u_b, 'ana-b@example.invalid');
  update public.profiles set role = 'empresa', empresa_id = v_ea, is_onboarding_owner = true, company_role = 'owner' where id = u_owner;
  update public.profiles set role = 'empresa', empresa_id = v_ea, company_role = 'member' where id = u_mem;
  update public.profiles set role = 'empresa', empresa_id = v_eb, is_onboarding_owner = true, company_role = 'owner' where id = u_b;

  insert into public.solicitudes (empresa_id, contact_name, source_channel, title, status, form_data)
  values (v_ea, 'Cliente Prueba', 'email', 'Requerimiento del Ayuntamiento', 'submitted', '{"needs":"Contestar requerimiento"}')
  returning id into v_sol;

  -- S1 encolado y persistencia -------------------------------------------------------------------
  perform pg_temp.as_user(u_owner);
  v_ana := public.solicitud_ia_encolar(v_sol, 'v1', 'test');
  insert into pg_temp._t values ('S1a encolar crea la versión 1 en cola',
    v_ana.version = 1 and v_ana.status = 'queued' and v_ana.triggered_by = 'empresa');

  -- El worker persiste el resultado (RPC de service_role; aquí como superusuario del test).
  reset role;
  v_ana := public.ia_analisis_guardar(v_ana.id, jsonb_build_object(
    'status', 'generated', 'primary_type', 'requerimiento_administrativo',
    'summary', 'Requerimiento con plazo de contestación.', 'summary_lang', 'es',
    'confidence_document', 0.82,
    'items', jsonb_build_array(
      jsonb_build_object('kind', 'deadline', 'origin', 'explicit', 'label', 'Contestar el requerimiento',
                         'deadline_kind', 'expreso', 'due_date', '2026-10-15', 'confidence', 0.9),
      jsonb_build_object('kind', 'missing_info', 'origin', 'inferred', 'label', 'Falta el NIF del interesado'),
      jsonb_build_object('kind', 'question', 'origin', 'inferred', 'label', '¿Cuándo se notificó?'),
      jsonb_build_object('kind', 'service', 'origin', 'inferred', 'label', 'Servicio inventado',
                         'service_code', 'NOEXISTE', 'confidence', 0.6))));
  insert into pg_temp._t values ('S1b guardar deja el análisis generado', v_ana.status = 'generated');
  select count(*) into n from public.solicitud_analisis_items where analisis_id = v_ana.id;
  insert into pg_temp._t values ('S1c se guardan 3 ítems válidos y se descarta el servicio inexistente', n = 3);
  insert into pg_temp._t values ('S1d el servicio no resuelto queda como aviso, no se inventa',
    jsonb_array_length(v_ana.warnings) >= 1);
  insert into pg_temp._t values ('S1e un plazo detectado fuerza revisión humana', v_ana.requires_human_review);

  select id into v_dl from public.solicitud_analisis_items where analisis_id = v_ana.id and kind = 'deadline';
  select id into v_q  from public.solicitud_analisis_items where analisis_id = v_ana.id and kind = 'question';
  select id into v_mi from public.solicitud_analisis_items where analisis_id = v_ana.id and kind = 'missing_info';

  -- S2 abrir_revision ----------------------------------------------------------------------------
  perform pg_temp.as_user(u_owner);
  v_row := public.solicitud_ia_abrir_revision(v_ana.id);
  insert into pg_temp._t values ('S2a generated → in_review', v_row.status = 'in_review');
  v_row := public.solicitud_ia_abrir_revision(v_ana.id);
  insert into pg_temp._t values ('S2b abrir de nuevo es idempotente', v_row.status = 'in_review');

  -- S3 item_estado -------------------------------------------------------------------------------
  v_item := public.solicitud_ia_item_estado(v_q, 'accepted');
  insert into pg_temp._t values ('S3a aceptar un ítem', v_item.human_state = 'accepted' and v_item.human_value is null);
  v_item := public.solicitud_ia_item_estado(v_dl, 'edited', '{"due_date":"2026-10-20"}'::jsonb);
  insert into pg_temp._t values ('S3b editar guarda human_value sin perder el original',
    v_item.human_state = 'edited' and v_item.human_value->>'due_date' = '2026-10-20' and v_item.due_date = date '2026-10-15');
  v_item := public.solicitud_ia_item_estado(v_mi, 'rejected');
  insert into pg_temp._t values ('S3c descartar un ítem', v_item.human_state = 'rejected');
  begin perform public.solicitud_ia_item_estado(v_q, 'invalido'); v_ok := false;
  exception when others then v_ok := true; end;
  insert into pg_temp._t values ('S3d un estado de ítem inválido se rechaza', v_ok);

  -- S4 aislamiento entre empresas ----------------------------------------------------------------
  perform pg_temp.as_user(u_b);
  begin perform public.solicitud_ia_abrir_revision(v_ana.id); v_ok := false;
  exception when others then get stacked diagnostics v_state = returned_sqlstate; v_ok := true; end;
  insert into pg_temp._t values ('S4a B no puede abrir la revisión de A', v_ok and v_state = 'PT404');
  begin perform public.solicitud_ia_item_estado(v_q, 'accepted'); v_ok := false;
  exception when others then get stacked diagnostics v_state = returned_sqlstate; v_ok := true; end;
  insert into pg_temp._t values ('S4b B no puede marcar un ítem de A', v_ok and v_state = 'PT404');
  begin perform public.solicitud_ia_revisar(v_ana.id, 'approved'); v_ok := false;
  exception when others then get stacked diagnostics v_state = returned_sqlstate; v_ok := true; end;
  insert into pg_temp._t values ('S4c B no puede revisar el análisis de A', v_ok and v_state = 'PT404');

  -- S5 permisos por rol --------------------------------------------------------------------------
  perform pg_temp.as_user(u_mem);
  begin perform public.solicitud_ia_revisar(v_ana.id, 'approved'); v_ok := false;
  exception when others then get stacked diagnostics v_detail = pg_exception_detail; v_ok := true; end;
  insert into pg_temp._t values ('S5a un member no puede revisar', v_ok and v_detail = 'analysis_forbidden');
  perform pg_temp.as_anon();
  begin perform public.solicitud_ia_revisar(v_ana.id, 'approved'); v_ok := false;
  exception when others then v_ok := true; end;
  insert into pg_temp._t values ('S5b anon no tiene acceso a la revisión', v_ok);

  -- S6 aprobar -----------------------------------------------------------------------------------
  perform pg_temp.as_user(u_owner);
  v_row := public.solicitud_ia_revisar(v_ana.id, 'approved', 'Revisado y correcto');
  insert into pg_temp._t values ('S6a aprobar deja el análisis approved', v_row.status = 'approved');
  select changed_items into n from public.solicitud_analisis_revisiones where analisis_id = v_ana.id order by created_at desc limit 1;
  insert into pg_temp._t values ('S6b la revisión cuenta ítems editados + descartados', n = 2);
  select status into v_detail from public.solicitudes where id = v_sol;
  insert into pg_temp._t values ('S6c aprobar NO cambia el estado de la solicitud', v_detail = 'submitted');

  -- S7 inmutabilidad tras aprobar ----------------------------------------------------------------
  begin perform public.solicitud_ia_item_estado(v_q, 'pending'); v_ok := false;
  exception when others then get stacked diagnostics v_detail = pg_exception_detail; v_ok := true; end;
  insert into pg_temp._t values ('S7a no se tocan ítems de un análisis aprobado', v_ok and v_detail = 'analysis_closed');
  begin perform public.solicitud_ia_revisar(v_ana.id, 'rejected'); v_ok := false;
  exception when others then get stacked diagnostics v_detail = pg_exception_detail; v_ok := true; end;
  insert into pg_temp._t values ('S7b un análisis aprobado no se vuelve a revisar', v_ok and v_detail = 'analysis_not_reviewable');
end $$;

reset role;
select name, case when ok then 'OK' else 'FALLO' end as resultado from pg_temp._t order by name;
do $$
declare failed int;
begin
  select count(*) into failed from pg_temp._t where not ok;
  if failed > 0 then raise exception 'Han fallado % comprobaciones de 0020', failed; end if;
  raise notice 'Revisión 0020: todas las comprobaciones han pasado';
end $$;
rollback;
