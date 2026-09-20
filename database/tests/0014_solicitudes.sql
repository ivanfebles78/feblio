-- Feblio · Pruebas de 0014 (solicitudes, accesos por token, mensajes, documentos, análisis, notificaciones).
-- Ejecutar con 0001..0014 aplicadas. Transacción con ROLLBACK final: no deja datos.
--
--   A  aislamiento entre empresas (A no ve ni opera sobre solicitudes de B) y empresa no falsifica empresa_id
--   C  aislamiento entre clientes (cliente A ve su solicitud; cliente B no) y cliente no cambia estados
--   T  token válido / caducado / revocado / manipulado; el token no lista otras solicitudes
--   N  anon sin acceso directo a tablas; solo RPC por token
--   S  transiciones válidas e inválidas (validadas en servidor), cierre con motivo, reapertura
--   F  archivos: ruta por acceso, extensión/MIME/tamaño, políticas de storage (insert/select)
--   M  conversación, no leídos, peticiones de información
--   I  idempotencia de notificaciones (dedupe_key)
--   K  cálculo de completitud versionado; borrador y envío del formulario
--   D  descarga segura por token (RPC solo service_role): correcta, token manipulado/caducado/revocado,
--      documento de otra solicitud / otra empresa / no visible / eliminado, sin acceso directo anon, rate limit

begin;
create temp table _t (name text, ok boolean) on commit drop;
grant insert on table pg_temp._t to authenticated, anon, service_role;

-- Cambios de rol simulando PostgREST (siempre precedidos de reset role)
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
  v_ua uuid := gen_random_uuid(); v_ub uuid := gen_random_uuid(); v_ca uuid := gen_random_uuid(); v_cb uuid := gen_random_uuid();
  v_ea uuid; v_eb uuid; v_cla uuid; v_clb uuid; v_sol uuid; v_sol_b uuid; v_link jsonb; v_tok text; v_acc uuid; v_view jsonb;
  n int; v_ok boolean; v_msg uuid; v_req uuid; v_an record; v_json jsonb; v_status text;
  v_doc uuid; v_doc_emp uuid; v_doc_b uuid; v_tok_exp text; v_tok_rev text; i int;
begin
  -- ---- Datos base (como postgres) ----
  insert into public.empresas (name, cif, email_verified, onboarding_status) values ('Empresa A', 'B11111111', true, 'completed') returning id into v_ea;
  insert into public.empresas (name, cif, email_verified, onboarding_status) values ('Empresa B', 'B22222222', true, 'completed') returning id into v_eb;
  insert into public.clientes (empresa_id, name, email) values (v_ea, 'Cliente A', 'ca@example.invalid') returning id into v_cla;
  insert into public.clientes (empresa_id, name, email) values (v_eb, 'Cliente B', 'cb@example.invalid') returning id into v_clb;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                          confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  values ('00000000-0000-0000-0000-000000000000', v_ua, 'authenticated', 'authenticated', 'ea@example.invalid', '', now(), now(), now(), '{}', '{"role":"cliente","full_name":"Ana A"}', '', '', '', '', '', '', '', ''),
         ('00000000-0000-0000-0000-000000000000', v_ub, 'authenticated', 'authenticated', 'eb@example.invalid', '', now(), now(), now(), '{}', '{"role":"cliente","full_name":"Bea B"}', '', '', '', '', '', '', '', ''),
         ('00000000-0000-0000-0000-000000000000', v_ca, 'authenticated', 'authenticated', 'cla@example.invalid', '', now(), now(), now(), '{}', '{"role":"cliente","full_name":"Cli A"}', '', '', '', '', '', '', '', ''),
         ('00000000-0000-0000-0000-000000000000', v_cb, 'authenticated', 'authenticated', 'clb@example.invalid', '', now(), now(), now(), '{}', '{"role":"cliente","full_name":"Cli B"}', '', '', '', '', '', '', '', '');
  update public.profiles set role = 'empresa', empresa_id = v_ea where id = v_ua;
  update public.profiles set role = 'empresa', empresa_id = v_eb where id = v_ub;
  update public.profiles set role = 'cliente', empresa_id = v_ea, cliente_id = v_cla where id = v_ca;
  update public.profiles set role = 'cliente', empresa_id = v_eb, cliente_id = v_clb where id = v_cb;
  insert into public.intake_form_templates (empresa_id, key, name, fields, required_documents, is_default)
  values (v_ea, 'std', 'Estándar', '[{"key":"m2","label":"Metros cuadrados","type":"text","required":true}]', '[{"key":"dni","label":"DNI del titular","required":true}]', true);

  -- ---- Empresa A crea una solicitud ----
  perform pg_temp.as_user(v_ua);
  v_sol := public.solicitud_crear(jsonb_build_object('contact_name', 'Ana Pérez', 'contact_email', 'ana@example.invalid', 'title', 'Reforma cocina', 'source_channel', 'llamada', 'cliente_id', v_cla, 'is_test', true));
  insert into pg_temp._t values ('K1 crear solicitud: draft con análisis inicial', (select status = 'draft' and completeness between 0 and 100 from public.solicitudes where id = v_sol));
  select count(*) into n from public.solicitud_analisis where solicitud_id = v_sol;
  insert into pg_temp._t values ('K2 análisis versión 1 guardado', n = 1);
  -- empresa no falsifica empresa_id: la solicitud pertenece a A aunque se intente indicar otra
  begin
    perform public.solicitud_crear(jsonb_build_object('contact_name', 'X', 'title', 'Y', 'empresa_id', v_eb, 'cliente_id', v_clb));
    v_ok := false;
  exception when others then v_ok := true; end;
  insert into pg_temp._t values ('A1 empresa A no puede crear con cliente de B (empresa_id ignorado, cliente ajeno rechazado)', v_ok);
  begin
    insert into public.solicitudes (empresa_id, contact_name, title) values (v_eb, 'X', 'Y'); v_ok := false;
  exception when insufficient_privilege then v_ok := true; end;
  insert into pg_temp._t values ('A2 empresa no inserta directamente en solicitudes', v_ok);

  -- enlace seguro
  v_link := public.solicitud_generar_enlace(v_sol, 7);
  v_tok := v_link->>'token'; v_acc := (v_link->>'access_id')::uuid;
  insert into pg_temp._t values ('T2 generar enlace pasa draft → awaiting_client', (select status from public.solicitudes where id = v_sol) = 'awaiting_client');
  reset role;
  insert into pg_temp._t values ('T1 token de 43 caracteres url-safe y solo se guarda el hash', length(v_tok) >= 43 and (select token_hash = public.sol_hash(v_tok) and token_hash <> v_tok from public.solicitud_accesos where id = v_acc));

  -- ---- Empresa B: aislamiento ----
  perform pg_temp.as_user(v_ub);
  select count(*) into n from public.solicitudes where id = v_sol;
  insert into pg_temp._t values ('A3 empresa B no ve la solicitud de A', n = 0);
  select count(*) into n from public.solicitud_accesos;
  insert into pg_temp._t values ('A4 empresa B no ve accesos de A', n = 0);
  begin perform public.solicitud_cambiar_estado(v_sol, 'closed', 'x'); v_ok := false; exception when others then v_ok := true; end;
  insert into pg_temp._t values ('A5 empresa B no opera sobre la solicitud de A', v_ok);
  begin perform public.solicitud_generar_enlace(v_sol, 7); v_ok := false; exception when others then v_ok := true; end;
  insert into pg_temp._t values ('A6 empresa B no genera enlaces de A', v_ok);
  v_sol_b := public.solicitud_crear(jsonb_build_object('contact_name', 'Bea', 'title', 'Nave', 'is_test', true));
  reset role;

  -- ---- anon: sin acceso directo, solo RPC por token ----
  perform pg_temp.as_anon();
  begin perform count(*) from public.solicitudes; v_ok := false; exception when insufficient_privilege then v_ok := true; end;
  insert into pg_temp._t values ('N1 anon no lee solicitudes', v_ok);
  begin perform count(*) from public.solicitud_mensajes; v_ok := false; exception when insufficient_privilege then v_ok := true; end;
  insert into pg_temp._t values ('N2 anon no lee mensajes', v_ok);
  begin perform count(*) from public.notificaciones; v_ok := false; exception when insufficient_privilege then v_ok := true; end;
  insert into pg_temp._t values ('N3 anon no lee notificaciones', v_ok);
  begin perform public.solicitud_crear('{}'::jsonb); v_ok := false; exception when others then v_ok := true; end;
  insert into pg_temp._t values ('N4 anon no ejecuta RPCs de empresa', v_ok);
  v_view := public.solicitud_acceso_obtener(v_tok);
  insert into pg_temp._t values ('T3 token válido devuelve la vista del cliente sin ids internos de empresa', (v_view->'solicitud'->>'title') = 'Reforma cocina' and v_view ? 'access_id' and not (v_view ? 'empresa_id') and not (v_view->'solicitud' ? 'id'));
  begin perform public.solicitud_acceso_obtener(substr(v_tok, 1, 42) || case when right(v_tok, 1) = 'A' then 'B' else 'A' end); v_ok := false; exception when others then v_ok := true; end;
  insert into pg_temp._t values ('T4 token manipulado → rechazado', v_ok);
  begin perform public.solicitud_acceso_obtener('corto'); v_ok := false; exception when others then v_ok := true; end;
  insert into pg_temp._t values ('T5 token corto → rechazado', v_ok);
  -- borrador y envío
  v_view := public.solicitud_acceso_guardar(v_tok, '{"needs":"Reformar la cocina","objectives":"Más espacio"}'::jsonb);
  insert into pg_temp._t values ('K3 borrador guardado sin cambiar de estado', (v_view->'solicitud'->'form_data'->>'needs') = 'Reformar la cocina' and (v_view->'solicitud'->>'status') = 'awaiting_client');
  v_view := public.solicitud_acceso_enviar(v_tok, '{"scope":"Cocina completa","timeline":"2 meses","m2":"18"}'::jsonb);
  insert into pg_temp._t values ('K4 envío → submitted', (v_view->'solicitud'->>'status') = 'submitted');
  -- completitud: base 6 (contact_name, contact_email, needs, objectives, scope, timeline ✔ todos) + m2 ✔ + dni ✗ = 7/8 = 88
  insert into pg_temp._t values ('K5 completitud calculada (7 de 8 → 88%)', (v_view->'solicitud'->>'completeness')::int = 88);
  begin perform public.solicitud_acceso_enviar(v_tok, '{}'::jsonb); v_ok := false; exception when others then v_ok := true; end;
  insert into pg_temp._t values ('K6 segundo envío rechazado (ya enviado)', v_ok);
  -- mensaje del cliente
  v_view := public.solicitud_acceso_mensaje(v_tok, 'Adjunto los planos la semana que viene');
  insert into pg_temp._t values ('M1 el cliente escribe en la conversación', jsonb_array_length(v_view->'mensajes') >= 2);
  -- archivo: simular subida en storage bajo sol/{access}/ y registrar
  v_status := 'sol/' || v_acc || '/' || gen_random_uuid() || '.pdf';
  insert into storage.objects (bucket_id, name, owner) values ('intake-files', v_status, null);
  begin
    insert into storage.objects (bucket_id, name) values ('intake-files', 'sol/' || gen_random_uuid() || '/x.pdf'); v_ok := false;
  exception when others then v_ok := true; end;
  insert into pg_temp._t values ('F1 anon no sube bajo un acceso inexistente', v_ok);
  begin
    insert into storage.objects (bucket_id, name) values ('intake-files', 'emp/' || v_ea || '/' || v_sol || '/x.pdf'); v_ok := false;
  exception when others then v_ok := true; end;
  insert into pg_temp._t values ('F2 anon no sube bajo el prefijo de empresa', v_ok);
  v_view := public.solicitud_acceso_registrar_documento(v_tok, v_status, 'planos.pdf', 'application/pdf', 123456, null);
  insert into pg_temp._t values ('F3 documento del cliente registrado con nombre original como metadato', (select count(*) from jsonb_array_elements(v_view->'documentos') d where d->>'name' = 'planos.pdf' and d->>'by' = 'cliente') = 1 and not (v_view->'documentos'->0 ? 'storage_path'));
  begin perform public.solicitud_acceso_registrar_documento(v_tok, v_status, 'virus.exe', 'application/octet-stream', 100, null); v_ok := false; exception when others then v_ok := true; end;
  insert into pg_temp._t values ('F4 extensión/MIME no permitidos → rechazado', v_ok);
  begin perform public.solicitud_acceso_registrar_documento(v_tok, v_status, 'grande.pdf', 'application/pdf', 20000000, null); v_ok := false; exception when others then v_ok := true; end;
  insert into pg_temp._t values ('F5 tamaño > 10 MB → rechazado', v_ok);
  begin perform public.solicitud_acceso_registrar_documento(v_tok, 'emp/' || v_ea || '/' || v_sol || '/x.pdf', 'x.pdf', 'application/pdf', 10, null); v_ok := false; exception when others then v_ok := true; end;
  insert into pg_temp._t values ('F6 ruta fuera del acceso → rechazada', v_ok);
  begin perform count(*) from storage.objects where bucket_id = 'intake-files'; v_ok := true; exception when others then v_ok := true; end;
  reset role;

  -- ---- Notificaciones para la empresa e idempotencia ----
  select count(*) into n from public.notificaciones where empresa_id = v_ea and recipient_kind = 'empresa' and solicitud_id = v_sol;
  insert into pg_temp._t values ('I1 la empresa recibe notificaciones (envío, respuesta, archivo)', n = 3);
  perform public.sol_notificar(v_ea, 'empresa', null, v_sol, 'x', 'dup', 'dup', null, 'sol:' || v_sol || ':submitted:' || to_char((select form_submitted_at from public.solicitudes where id = v_sol), 'YYYYMMDDHH24MISS'));
  select count(*) into n from public.notificaciones where empresa_id = v_ea and recipient_kind = 'empresa' and solicitud_id = v_sol;
  insert into pg_temp._t values ('I2 reintento con la misma clave no duplica', n = 3);

  -- ---- Empresa A: conversación, no leídos, petición de información, requisitos, estados ----
  perform pg_temp.as_user(v_ua);
  select count(*) into n from public.solicitud_mensajes where solicitud_id = v_sol and author_kind = 'cliente' and read_by_empresa_at is null;
  insert into pg_temp._t values ('M2 mensajes del cliente no leídos por la empresa', n = 1);
  select count(*) into n from public.notificaciones where read_at is null;
  insert into pg_temp._t values ('M3 notificaciones no leídas visibles solo para la empresa A', n = 3);
  perform public.solicitud_marcar_leida(v_sol);
  select count(*) into n from public.solicitud_mensajes where solicitud_id = v_sol and author_kind = 'cliente' and read_by_empresa_at is null;
  insert into pg_temp._t values ('M4 marcar leída deja 0 no leídos', n = 0 and (select count(*) from public.notificaciones where read_at is null) = 0);
  v_msg := public.solicitud_solicitar_informacion(v_sol, '[{"kind":"document","key":"licencia","label":"Licencia de obra"},{"kind":"field","key":"presupuesto","label":"Presupuesto orientativo"}]'::jsonb, 'Necesitamos la licencia y un presupuesto orientativo');
  insert into pg_temp._t values ('M5 petición de información → missing_information con requisitos', (select status from public.solicitudes where id = v_sol) = 'missing_information' and (select count(*) from public.solicitud_requisitos where solicitud_id = v_sol and status = 'pending') = 3);
  select * into v_an from public.solicitud_analisis where solicitud_id = v_sol order by version desc limit 1;
  insert into pg_temp._t values ('M6 petición de información reanaliza: los nuevos requisitos bajan la completitud', v_an.completeness < 100 and v_an.missing_documents::text like '%"licencia"%' and v_an.missing::text like '%"presupuesto"%' and (select completeness from public.solicitudes where id = v_sol) = v_an.completeness);
  select id into v_req from public.solicitud_requisitos where solicitud_id = v_sol and key = 'dni';
  perform public.solicitud_resolver_requisito(v_req, 'waived');
  select * into v_an from public.solicitud_analisis where solicitud_id = v_sol order by version desc limit 1;
  insert into pg_temp._t values ('K7 resolver requisito reanaliza (versión nueva, dni ya no falta)', v_an.version >= 3 and not (v_an.missing_documents::text like '%"dni"%'));
  perform public.solicitud_analizar(v_sol);
  select count(*) into n from public.solicitud_analisis where solicitud_id = v_sol;
  insert into pg_temp._t values ('K8 reanálisis manual añade versión', n = v_an.version + 1);
  -- transiciones
  begin perform public.solicitud_cambiar_estado(v_sol, 'draft'); v_ok := false; exception when others then v_ok := true; end;
  insert into pg_temp._t values ('S1 transición inválida (missing_information → draft) rechazada', v_ok);
  begin perform public.solicitud_cambiar_estado(v_sol, 'closed', null); v_ok := false; exception when others then v_ok := true; end;
  insert into pg_temp._t values ('S2 cerrar sin motivo rechazado', v_ok);
  perform public.solicitud_cambiar_estado(v_sol, 'ready_for_scope');
  insert into pg_temp._t values ('S3 missing_information → ready_for_scope', (select status from public.solicitudes where id = v_sol) = 'ready_for_scope');
  perform public.solicitud_cambiar_estado(v_sol, 'closed', 'Cliente desiste');
  insert into pg_temp._t values ('S4 cierre con motivo', (select status = 'closed' and closed_reason = 'Cliente desiste' from public.solicitudes where id = v_sol));
  perform public.solicitud_cambiar_estado(v_sol, 'under_review', 'reopen');
  insert into pg_temp._t values ('S5 reapertura (sin presupuesto) → under_review', (select status = 'under_review' and closed_reason is null from public.solicitudes where id = v_sol));
  -- revocación
  n := public.solicitud_revocar_enlaces(v_sol);
  insert into pg_temp._t values ('T6 revocar enlaces', n = 1);
  -- archivo de empresa: subida bajo emp/{empresa}/{solicitud}/
  v_status := 'emp/' || v_ea || '/' || v_sol || '/' || gen_random_uuid() || '.png';
  insert into storage.objects (bucket_id, name) values ('intake-files', v_status);
  begin insert into storage.objects (bucket_id, name) values ('intake-files', 'emp/' || v_eb || '/' || v_sol_b || '/x.png'); v_ok := false; exception when others then v_ok := true; end;
  insert into pg_temp._t values ('F7 empresa A no sube bajo el prefijo de B', v_ok);
  perform public.solicitud_registrar_documento(v_sol, v_status, 'croquis.png', 'image/png', 2048, null);
  select count(*) into n from storage.objects where bucket_id = 'intake-files' and name in (select storage_path from public.solicitud_documentos where solicitud_id = v_sol);
  insert into pg_temp._t values ('F8 empresa lee (para firmar URLs) sus objetos registrados', n = 2);
  reset role;

  -- ---- token revocado / caducado ----
  perform pg_temp.as_anon();
  begin perform public.solicitud_acceso_obtener(v_tok); v_ok := false; exception when others then v_ok := true; end;
  insert into pg_temp._t values ('T7 token revocado → rechazado', v_ok);
  reset role;
  perform pg_temp.as_user(v_ua);
  v_link := public.solicitud_generar_enlace(v_sol, 1); v_tok := v_link->>'token';
  reset role;
  update public.solicitud_accesos set expires_at = now() - interval '1 minute' where token_hash = public.sol_hash(v_tok);
  perform pg_temp.as_anon();
  begin perform public.solicitud_acceso_obtener(v_tok); v_ok := false; exception when others then v_ok := true; end;
  insert into pg_temp._t values ('T8 token caducado → rechazado', v_ok);
  begin insert into storage.objects (bucket_id, name) values ('intake-files', 'sol/' || (v_link->>'access_id') || '/late.pdf'); v_ok := false; exception when others then v_ok := true; end;
  insert into pg_temp._t values ('F9 acceso caducado no permite subir archivos', v_ok);
  reset role;

  -- ---- Clientes autenticados ----
  perform pg_temp.as_user(v_ca);
  select count(*) into n from public.solicitudes where id = v_sol;
  insert into pg_temp._t values ('C1 cliente A (vinculado) ve su solicitud', n = 1);
  select count(*) into n from public.solicitud_mensajes where solicitud_id = v_sol;
  insert into pg_temp._t values ('C2 cliente A ve la conversación', n >= 3);
  select count(*) into n from public.notificaciones;
  insert into pg_temp._t values ('C3 cliente A ve sus notificaciones (petición de información, estados)', n >= 1 and (select count(*) from public.notificaciones where recipient_kind = 'empresa') = 0);
  begin perform public.solicitud_cambiar_estado(v_sol, 'closed', 'x'); v_ok := false; exception when others then v_ok := true; end;
  insert into pg_temp._t values ('C4 el cliente no cambia el estado empresarial', v_ok);
  begin perform public.solicitud_generar_enlace(v_sol, 7); v_ok := false; exception when others then v_ok := true; end;
  insert into pg_temp._t values ('C5 el cliente no genera enlaces', v_ok);
  select count(*) into n from storage.objects where bucket_id = 'intake-files' and name in (select storage_path from public.solicitud_documentos where solicitud_id = v_sol);
  insert into pg_temp._t values ('F10 cliente vinculado lee objetos de su solicitud (URLs firmadas)', n = 2);
  reset role;
  perform pg_temp.as_user(v_cb);
  select count(*) into n from public.solicitudes;
  insert into pg_temp._t values ('C6 cliente B no ve solicitudes de otros clientes', n = 0);
  select count(*) into n from public.solicitud_documentos;
  insert into pg_temp._t values ('C7 cliente B no ve documentos ajenos', n = 0);
  select count(*) into n from storage.objects where bucket_id = 'intake-files' and name like 'sol/%';
  insert into pg_temp._t values ('F11 cliente B no lee objetos ajenos', n = 0);
  reset role;

  -- ---- D: descarga segura del cliente anónimo (Edge Function → RPC solo service_role) ----
  v_tok_exp := v_tok;                                                       -- token caducado (T8)
  select id into v_doc from public.solicitud_documentos where solicitud_id = v_sol and uploaded_by_kind = 'cliente' limit 1;
  select id into v_doc_emp from public.solicitud_documentos where solicitud_id = v_sol and uploaded_by_kind = 'empresa' limit 1;
  -- documento de otra empresa (solicitud B): registrado directamente como postgres
  insert into storage.objects (bucket_id, name) values ('intake-files', 'emp/' || v_eb || '/' || v_sol_b || '/b.pdf');
  insert into public.solicitud_documentos (solicitud_id, empresa_id, uploaded_by_kind, original_name, storage_path, mime_type, size_bytes)
  values (v_sol_b, v_eb, 'empresa', 'b.pdf', 'emp/' || v_eb || '/' || v_sol_b || '/b.pdf', 'application/pdf', 10) returning id into v_doc_b;
  -- token vigente para A y otro revocado
  perform pg_temp.as_user(v_ua);
  v_link := public.solicitud_generar_enlace(v_sol, 7); v_tok_rev := v_link->>'token';
  v_link := public.solicitud_generar_enlace(v_sol, 7); v_tok := v_link->>'token';   -- revoca el anterior
  reset role;
  -- D1/D2/D3 sin acceso directo: ni anon ni cliente autenticado ejecutan la RPC; anon no lee storage.objects
  perform pg_temp.as_anon();
  begin perform public.solicitud_acceso_documento(v_tok, v_doc, 'ip'); v_ok := false; exception when insufficient_privilege then v_ok := true; end;
  insert into pg_temp._t values ('D1 anon no ejecuta la RPC de descarga (solo service_role)', v_ok);
  begin select count(*) into n from storage.objects where bucket_id = 'intake-files'; v_ok := (n = 0); exception when insufficient_privilege then v_ok := true; end;
  insert into pg_temp._t values ('D2 anon no ve ningún objeto de intake-files (sin SELECT directo útil)', v_ok);
  reset role;
  perform pg_temp.as_user(v_ca);
  begin perform public.solicitud_acceso_documento(v_tok, v_doc, 'ip'); v_ok := false; exception when insufficient_privilege then v_ok := true; end;
  insert into pg_temp._t values ('D3 cliente autenticado tampoco ejecuta la RPC directamente', v_ok);
  reset role;
  -- D4/D5 descarga correcta (como service_role): ruta física del documento visible de la solicitud del token
  set local role service_role;
  v_json := public.solicitud_acceso_documento(v_tok, v_doc, 'ip-a');
  insert into pg_temp._t values ('D4 descarga correcta: ruta bajo sol/{acceso}/ y nombre original', (v_json->>'storage_path') like 'sol/%' and (v_json->>'original_name') = 'planos.pdf');
  v_json := public.solicitud_acceso_documento(v_tok, v_doc_emp, 'ip-a');
  insert into pg_temp._t values ('D5 el cliente descarga también los archivos que la empresa le comparte', (v_json->>'storage_path') like ('emp/' || v_ea || '/%'));
  begin perform public.solicitud_acceso_documento(substr(v_tok, 1, 42) || case when right(v_tok, 1) = 'A' then 'B' else 'A' end, v_doc, 'ip-a'); v_ok := false; exception when others then v_ok := (sqlerrm = 'Enlace no válido'); end;
  insert into pg_temp._t values ('D6 token manipulado → Enlace no válido', v_ok);
  begin perform public.solicitud_acceso_documento(v_tok_exp, v_doc, 'ip-a'); v_ok := false; exception when others then v_ok := (sqlerrm = 'Enlace no válido'); end;
  insert into pg_temp._t values ('D7 token caducado → Enlace no válido', v_ok);
  begin perform public.solicitud_acceso_documento(v_tok_rev, v_doc, 'ip-a'); v_ok := false; exception when others then v_ok := (sqlerrm = 'Enlace no válido'); end;
  insert into pg_temp._t values ('D8 token revocado → Enlace no válido', v_ok);
  begin perform public.solicitud_acceso_documento(v_tok, v_doc_b, 'ip-a'); v_ok := false; exception when others then v_ok := (sqlerrm = 'Enlace no válido'); end;
  insert into pg_temp._t values ('D9 documento de otra solicitud / otra empresa → Enlace no válido (mismo mensaje)', v_ok);
  reset role;
  update public.solicitud_documentos set visible_to_client = false where id = v_doc_emp;
  set local role service_role;
  begin perform public.solicitud_acceso_documento(v_tok, v_doc_emp, 'ip-a'); v_ok := false; exception when others then v_ok := (sqlerrm = 'Enlace no válido'); end;
  insert into pg_temp._t values ('D10 documento interno (no visible para el cliente) → Enlace no válido', v_ok);
  v_view := public.solicitud_acceso_obtener(v_tok);
  insert into pg_temp._t values ('D11 la vista del cliente no lista el documento interno', (select count(*) from jsonb_array_elements(v_view->'documentos') d where (d->>'id')::uuid = v_doc_emp) = 0);
  reset role;
  update public.solicitud_documentos set deleted_at = now() where id = v_doc;
  set local role service_role;
  begin perform public.solicitud_acceso_documento(v_tok, v_doc, 'ip-a'); v_ok := false; exception when others then v_ok := (sqlerrm = 'Enlace no válido'); end;
  insert into pg_temp._t values ('D12 documento eliminado → Enlace no válido', v_ok);
  v_view := public.solicitud_acceso_obtener(v_tok);
  insert into pg_temp._t values ('D13 la vista del cliente no lista el documento eliminado', (select count(*) from jsonb_array_elements(v_view->'documentos') d where (d->>'id')::uuid = v_doc) = 0);
  reset role;
  update public.solicitud_documentos set deleted_at = null where id = v_doc;
  -- D14 registro de auditoría sin token
  insert into pg_temp._t values ('D14 descarga auditada sin secretos', (select count(*) from public.audit_events where action = 'solicitud.client_download' and entity_id = v_doc and metadata::text not like '%' || v_tok || '%') >= 1);
  -- D15 rate limit por IP (60 / 5 min) y por acceso (30 / 5 min)
  set local role service_role;
  v_ok := false;
  for i in 1..70 loop
    begin perform public.solicitud_acceso_documento(v_tok, v_doc, 'ip-limite'); exception when others then if sqlerrm like 'Demasiadas%' then v_ok := true; end if; end;
  end loop;
  insert into pg_temp._t values ('D15 rate limit: tras repetir la descarga se rechaza con «Demasiadas solicitudes»', v_ok);
  reset role;
  -- D16 la lectura autenticada del cliente (URL firmada) tampoco expone documentos internos ni eliminados
  update public.solicitud_documentos set deleted_at = now() where id = v_doc;
  perform pg_temp.as_user(v_ca);
  select count(*) into n from storage.objects o join public.solicitud_documentos d on d.storage_path = o.name where d.id in (v_doc, v_doc_emp);
  insert into pg_temp._t values ('D16 cliente autenticado: la política de storage excluye internos y eliminados', n = 0);
  reset role;
end $$;

reset role;

select name, case when ok then 'OK' else 'FALLO' end as resultado from pg_temp._t order by name;

do $$
declare failed int;
begin
  select count(*) into failed from pg_temp._t where not ok;
  if failed > 0 then raise exception 'Han fallado % comprobaciones de 0014', failed; end if;
  raise notice 'Solicitudes 0014: todas las comprobaciones han pasado';
end $$;

rollback;
