-- Feblio · Pruebas de 0019 (análisis inteligente de solicitudes). ROLLBACK final. Sin datos reales.
-- Ejecutar con 0001..0019 aplicadas. Transacción con ROLLBACK final: no deja datos.
--   A  aislamiento entre empresas: no se lee ni se encola el análisis de otra empresa
--   R  roles: owner/manager encolan; member no; cliente y anon sin ningún acceso
--   W  escrituras directas rechazadas: authenticated no inserta ni actualiza en las tablas nuevas
--   I  idempotencia: la misma entrada no crea un segundo análisis
--   V  versionado: cambiar un documento produce la versión N+1 y sustituye la anterior
--   L  leases: un solo trabajador toma el trabajo; el lease caducado se puede reclamar
--   S  servicios: se resuelven contra el catálogo propio; los ajenos, inactivos o inventados se descartan
--   T  texto OCR: inalcanzable para authenticated, tanto en tabla como en evidencias
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
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                          confirmation_token, recovery_token, email_change_token_new, email_change,
                          email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  values ('00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated', mail, '', now(), now(), now(),
          '{}', '{"role":"empresa","full_name":"Prueba 0019"}', '', '', '', '', '', '', '', '');
end $f$;

do $$
declare
  v_ea uuid; v_eb uuid;
  v_owner_a uuid := gen_random_uuid(); v_member_a uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid(); v_cliente_a uuid := gen_random_uuid();
  v_cli_row uuid;
  v_sol_a uuid; v_sol_b uuid;
  v_doc_a uuid; v_doc_b uuid;
  v_svc_a uuid; v_svc_b uuid; v_svc_off uuid;
  v_an public.solicitud_analisis_ia; v_an2 public.solicitud_analisis_ia;
  v_first uuid; v_taken public.solicitud_analisis_ia; v_taken2 public.solicitud_analisis_ia;
  v_ok boolean; v_n int; v_txt text;
begin
  -- ---------------------------------------------------------------
  -- Datos base (como postgres): dos empresas independientes
  -- ---------------------------------------------------------------
  insert into public.empresas (name, cif) values ('Empresa A 0019', 'A00000019') returning id into v_ea;
  insert into public.empresas (name, cif) values ('Empresa B 0019', 'B00000019') returning id into v_eb;

  perform pg_temp.mkuser(v_owner_a, 'owner.a.0019@example.test');
  perform pg_temp.mkuser(v_member_a, 'member.a.0019@example.test');
  perform pg_temp.mkuser(v_owner_b, 'owner.b.0019@example.test');
  perform pg_temp.mkuser(v_cliente_a, 'cliente.a.0019@example.test');

  insert into public.clientes (empresa_id, name) values (v_ea, 'Cliente A') returning id into v_cli_row;

  update public.profiles set role = 'empresa', empresa_id = v_ea, company_role = 'owner'   where id = v_owner_a;
  update public.profiles set role = 'empresa', empresa_id = v_ea, company_role = 'member'  where id = v_member_a;
  update public.profiles set role = 'empresa', empresa_id = v_eb, company_role = 'owner'   where id = v_owner_b;
  update public.profiles set role = 'cliente', empresa_id = v_ea, cliente_id = v_cli_row, company_role = null
   where id = v_cliente_a;

  insert into public.solicitudes (empresa_id, cliente_id, contact_name, title, status)
  values (v_ea, v_cli_row, 'Contacto A', 'Requerimiento de prueba', 'submitted') returning id into v_sol_a;
  insert into public.solicitudes (empresa_id, contact_name, title, status)
  values (v_eb, 'Contacto B', 'Solicitud de B', 'submitted') returning id into v_sol_b;

  insert into public.solicitud_documentos
    (solicitud_id, empresa_id, uploaded_by_kind, original_name, storage_path, mime_type, size_bytes,
     content_sha256, scan_status)
  values (v_sol_a, v_ea, 'cliente', 'requerimiento.pdf', 'sol/a/0019-a.pdf', 'application/pdf', 1024,
          repeat('a', 64), 'clean') returning id into v_doc_a;
  insert into public.solicitud_documentos
    (solicitud_id, empresa_id, uploaded_by_kind, original_name, storage_path, mime_type, size_bytes,
     content_sha256, scan_status)
  values (v_sol_b, v_eb, 'cliente', 'otro.pdf', 'sol/b/0019-b.pdf', 'application/pdf', 2048,
          repeat('b', 64), 'clean') returning id into v_doc_b;

  insert into public.services (empresa_id, code, name_es) values (v_ea, 'REQ-01', 'Respuesta a requerimiento')
    returning id into v_svc_a;
  insert into public.services (empresa_id, code, name_es, is_active)
    values (v_ea, 'OFF-01', 'Servicio desactivado', false) returning id into v_svc_off;
  insert into public.services (empresa_id, code, name_es) values (v_eb, 'BBB-01', 'Servicio de B')
    returning id into v_svc_b;

  -- ---------------------------------------------------------------
  -- R  Roles
  -- ---------------------------------------------------------------
  perform pg_temp.as_user(v_owner_a);
  v_an := public.solicitud_ia_encolar(v_sol_a);
  reset role;
  insert into pg_temp._t values ('R1 owner encola un análisis', v_an.id is not null and v_an.status = 'queued');
  insert into pg_temp._t values ('R2 la versión inicial es 1', v_an.version = 1);
  insert into pg_temp._t values ('R3 requiere revisión humana por defecto', v_an.requires_human_review);

  perform pg_temp.as_user(v_member_a);
  begin
    perform public.solicitud_ia_encolar(v_sol_a);
    v_ok := false;
  exception when insufficient_privilege then v_ok := true;
  end;
  reset role;
  insert into pg_temp._t values ('R4 member no puede encolar', v_ok);

  perform pg_temp.as_user(v_member_a);
  select count(*) into v_n from public.solicitud_analisis_ia;
  reset role;
  insert into pg_temp._t values ('R5 member sí lee el análisis de su empresa', v_n = 1);

  perform pg_temp.as_user(v_cliente_a);
  select count(*) into v_n from public.solicitud_analisis_ia;
  begin
    perform public.solicitud_ia_encolar(v_sol_a);
    v_ok := false;
  exception when insufficient_privilege then v_ok := true;
  end;
  reset role;
  insert into pg_temp._t values ('R6 cliente no ve ningún análisis', v_n = 0);
  insert into pg_temp._t values ('R7 cliente no puede encolar', v_ok);

  perform pg_temp.as_anon();
  begin
    select count(*) into v_n from public.solicitud_analisis_ia;
    v_ok := (v_n = 0);
  exception when insufficient_privilege then v_ok := true;
  end;
  reset role;
  insert into pg_temp._t values ('R8 anon no accede al análisis', v_ok);

  -- ---------------------------------------------------------------
  -- A  Aislamiento entre empresas
  -- ---------------------------------------------------------------
  perform pg_temp.as_user(v_owner_b);
  select count(*) into v_n from public.solicitud_analisis_ia;
  reset role;
  insert into pg_temp._t values ('A1 B no ve el análisis de A', v_n = 0);

  perform pg_temp.as_user(v_owner_b);
  begin
    perform public.solicitud_ia_encolar(v_sol_a);          -- solicitud de A
    v_ok := false;
  exception when others then v_ok := (sqlstate = 'PT404');
  end;
  reset role;
  insert into pg_temp._t values ('A2 B no encola sobre una solicitud de A (PT404 neutro)', v_ok);

  perform pg_temp.as_user(v_owner_b);
  begin
    perform * from public.solicitud_ia_evidencias(v_an.id);
    v_ok := false;
  exception when others then v_ok := (sqlstate = 'PT404');
  end;
  reset role;
  insert into pg_temp._t values ('A3 B no lee las evidencias de un análisis de A', v_ok);

  -- ---------------------------------------------------------------
  -- I  Idempotencia
  -- ---------------------------------------------------------------
  perform pg_temp.as_user(v_owner_a);
  v_an2 := public.solicitud_ia_encolar(v_sol_a);
  reset role;
  select count(*) into v_n from public.solicitud_analisis_ia where solicitud_id = v_sol_a;
  insert into pg_temp._t values ('I1 reencolar la misma entrada devuelve el mismo análisis', v_an2.id = v_an.id);
  insert into pg_temp._t values ('I2 no se crea una segunda fila', v_n = 1);

  -- ---------------------------------------------------------------
  -- L  Leases
  -- ---------------------------------------------------------------
  v_taken := public.ia_analisis_tomar(300);
  insert into pg_temp._t values ('L1 el trabajador toma el trabajo encolado',
    v_taken.id = v_an.id and v_taken.status = 'running' and v_taken.attempts = 1);

  v_taken2 := public.ia_analisis_tomar(300);
  insert into pg_temp._t values ('L2 un segundo trabajador no toma el mismo trabajo', v_taken2.id is null);

  update public.solicitud_analisis_ia set lease_until = now() - interval '1 minute' where id = v_an.id;
  v_taken2 := public.ia_analisis_tomar(300);
  insert into pg_temp._t values ('L3 un lease caducado se puede reclamar',
    v_taken2.id = v_an.id and v_taken2.attempts = 2);

  -- ---------------------------------------------------------------
  -- S  Servicios y evidencias: el servidor decide, no el modelo
  -- ---------------------------------------------------------------
  v_an := public.ia_analisis_guardar(v_an.id, jsonb_build_object(
    'status', 'generated',
    'provider', 'prueba', 'model', 'prueba-0019',
    'primary_type', 'requerimiento_administrativo',
    'has_formal_requirement', true,
    'requirement_class', 'administrativo',
    'summary', 'Resumen de prueba', 'summary_lang', 'es',
    'confidence_document', 0.9,
    'cost_micros', 1500, 'ocr_pages', 3, 'input_tokens', 100, 'output_tokens', 50,
    'items', jsonb_build_array(
      jsonb_build_object('kind', 'service', 'origin', 'inferred', 'service_code', 'REQ-01',
                         'confidence', 0.91,
                         'evidence', jsonb_build_array(
                           jsonb_build_object('documento_id', v_doc_a, 'page_no', 1, 'quote', 'texto de apoyo'))),
      jsonb_build_object('kind', 'service', 'origin', 'inferred', 'service_code', 'BBB-01'),
      jsonb_build_object('kind', 'service', 'origin', 'inferred', 'service_code', 'OFF-01'),
      jsonb_build_object('kind', 'service', 'origin', 'inferred', 'service_code', 'INVENTADO'),
      jsonb_build_object('kind', 'deadline', 'origin', 'explicit', 'deadline_kind', 'expreso',
                         'due_date', (current_date + 10)::text, 'label', 'Plazo de diez días'),
      jsonb_build_object('kind', 'question', 'origin', 'inferred', 'label', '¿Dispone del expediente?',
                         'evidence', jsonb_build_array(
                           jsonb_build_object('documento_id', v_doc_b, 'page_no', 1, 'quote', 'ajeno'))))));

  select count(*) into v_n from public.solicitud_analisis_items
   where analisis_id = v_an.id and kind = 'service';
  insert into pg_temp._t values ('S1 solo se guarda el servicio propio, activo y vigente', v_n = 1);

  select count(*) into v_n from public.solicitud_analisis_items
   where analisis_id = v_an.id and kind = 'service' and service_id = v_svc_a;
  insert into pg_temp._t values ('S2 el servicio guardado es el del catálogo de A', v_n = 1);

  select count(*) into v_n from public.solicitud_analisis_items
   where analisis_id = v_an.id and kind = 'service' and service_id in (v_svc_b, v_svc_off);
  insert into pg_temp._t values ('S3 ni el servicio de B ni el inactivo se guardan', v_n = 0);

  insert into pg_temp._t values ('S4 los descartes quedan como avisos, no como invenciones',
    jsonb_array_length(v_an.warnings) >= 3);

  select count(*) into v_n from public.solicitud_analisis_evidencias e
    join public.solicitud_analisis_items i on i.id = e.item_id
   where i.analisis_id = v_an.id;
  insert into pg_temp._t values ('S5 la evidencia de un documento ajeno se rechaza', v_n = 1);

  insert into pg_temp._t values ('S6 un plazo fuerza revisión humana', v_an.requires_human_review);

  select count(*) into v_n from public.solicitud_analisis_items
   where analisis_id = v_an.id and kind = 'deadline' and deadline_kind = 'expreso';
  insert into pg_temp._t values ('S7 el plazo conserva que es expreso, no calculado', v_n = 1);

  select count(*) into v_n from public.ia_empresa_consumo
   where empresa_id = v_ea and cost_micros = 1500 and analyses = 1;
  insert into pg_temp._t values ('S8 el consumo se contabiliza por empresa y mes', v_n = 1);

  -- Un ítem que no es de servicio no puede referenciar el catálogo.
  begin
    insert into public.solicitud_analisis_items (analisis_id, empresa_id, kind, origin, service_id)
    values (v_an.id, v_ea, 'question', 'inferred', v_svc_a);
    v_ok := false;
  exception when check_violation then v_ok := true;
  end;
  insert into pg_temp._t values ('S9 solo los ítems de servicio referencian el catálogo', v_ok);

  -- Aislamiento reforzado por clave foránea compuesta.
  begin
    insert into public.solicitud_analisis_items (analisis_id, empresa_id, kind, origin, service_id)
    values (v_an.id, v_ea, 'service', 'inferred', v_svc_b);
    v_ok := false;
  exception when foreign_key_violation then v_ok := true;
  end;
  insert into pg_temp._t values ('S10 la FK compuesta impide referenciar un servicio de otra empresa', v_ok);

  -- Un plazo sin declarar su clase es imposible.
  begin
    insert into public.solicitud_analisis_items (analisis_id, empresa_id, kind, origin)
    values (v_an.id, v_ea, 'deadline', 'explicit');
    v_ok := false;
  exception when check_violation then v_ok := true;
  end;
  insert into pg_temp._t values ('S11 un plazo debe declarar si es expreso o calculado', v_ok);

  -- ---------------------------------------------------------------
  -- V  Versionado y obsolescencia
  -- ---------------------------------------------------------------
  update public.solicitud_documentos set content_sha256 = repeat('c', 64) where id = v_doc_a;

  perform pg_temp.as_user(v_owner_a);
  v_an2 := public.solicitud_ia_encolar(v_sol_a);
  reset role;
  insert into pg_temp._t values ('V1 cambiar un documento produce la versión 2',
    v_an2.id <> v_an.id and v_an2.version = 2);
  insert into pg_temp._t values ('V2 la huella de entrada cambia',
    v_an2.input_fingerprint <> v_an.input_fingerprint);

  v_taken := public.ia_analisis_tomar(300);
  v_an2 := public.ia_analisis_guardar(v_taken.id, jsonb_build_object('status', 'generated', 'items', '[]'::jsonb));

  select status into v_txt from public.solicitud_analisis_ia where id = v_an.id;
  insert into pg_temp._t values ('V3 la versión anterior queda sustituida', v_txt = 'superseded');
  insert into pg_temp._t values ('V4 la versión anterior se conserva',
    exists (select 1 from public.solicitud_analisis_ia where id = v_an.id));

  -- ---------------------------------------------------------------
  -- W  Escrituras directas rechazadas
  -- ---------------------------------------------------------------
  perform pg_temp.as_user(v_owner_a);
  begin
    insert into public.solicitud_analisis_ia (solicitud_id, empresa_id, version, input_fingerprint, idempotency_key)
    values (v_sol_a, v_ea, 99, repeat('d', 64), repeat('e', 64));
    v_ok := false;
  exception when insufficient_privilege then v_ok := true;
  end;
  reset role;
  insert into pg_temp._t values ('W1 authenticated no inserta en la cabecera del análisis', v_ok);

  perform pg_temp.as_user(v_owner_a);
  begin
    update public.solicitud_analisis_ia set status = 'approved' where id = v_an2.id;
    v_ok := false;
  exception when insufficient_privilege then v_ok := true;
  end;
  reset role;
  insert into pg_temp._t values ('W2 authenticated no actualiza el análisis', v_ok);

  perform pg_temp.as_user(v_owner_a);
  begin
    insert into public.solicitud_analisis_items (analisis_id, empresa_id, kind, origin)
    values (v_an2.id, v_ea, 'question', 'inferred');
    v_ok := false;
  exception when insufficient_privilege then v_ok := true;
  end;
  reset role;
  insert into pg_temp._t values ('W3 authenticated no inserta ítems', v_ok);

  perform pg_temp.as_user(v_owner_a);
  begin
    perform public.ia_analisis_guardar(v_an2.id, '{}'::jsonb);
    v_ok := false;
  exception when insufficient_privilege then v_ok := true;
  end;
  reset role;
  insert into pg_temp._t values ('W4 authenticated no ejecuta la RPC interna de persistencia', v_ok);

  perform pg_temp.as_user(v_owner_a);
  begin
    perform public.ia_analisis_tomar(300);
    v_ok := false;
  exception when insufficient_privilege then v_ok := true;
  end;
  reset role;
  insert into pg_temp._t values ('W5 authenticated no toma trabajos de la cola', v_ok);

  -- ---------------------------------------------------------------
  -- T  El texto OCR no es accesible
  -- ---------------------------------------------------------------
  insert into public.solicitud_documento_texto
    (empresa_id, solicitud_id, documento_id, content_sha256, page_no, text, char_count)
  values (v_ea, v_sol_a, v_doc_a, repeat('c', 64), 1, 'Contenido completo del documento', 32);

  perform pg_temp.as_user(v_owner_a);
  begin
    select count(*) into v_n from public.solicitud_documento_texto;
    v_ok := false;
  exception when insufficient_privilege then v_ok := true;
  end;
  reset role;
  insert into pg_temp._t values ('T1 ni el owner puede leer el texto extraído', v_ok);

  perform pg_temp.as_user(v_owner_a);
  begin
    select count(*) into v_n from public.solicitud_analisis_evidencias;
    v_ok := false;
  exception when insufficient_privilege then v_ok := true;
  end;
  reset role;
  insert into pg_temp._t values ('T2 las evidencias no se leen directamente', v_ok);

  perform pg_temp.as_user(v_owner_a);
  select count(*) into v_n from public.solicitud_ia_evidencias(v_an.id);
  reset role;
  insert into pg_temp._t values ('T3 el owner sí obtiene las citas por la RPC controlada', v_n = 1);

  perform pg_temp.as_user(v_owner_a);
  select quote into v_txt from public.solicitud_ia_evidencias(v_an.id) limit 1;
  reset role;
  insert into pg_temp._t values ('T4 la RPC devuelve la cita corta, no el texto completo',
    v_txt = 'texto de apoyo');

  -- ---------------------------------------------------------------
  -- Comprobaciones adicionales del contrato
  -- ---------------------------------------------------------------
  perform pg_temp.as_user(v_owner_a);
  begin
    perform public.solicitud_ia_encolar(v_sol_b);          -- solicitud de otra empresa
    v_ok := false;
  exception when others then v_ok := (sqlstate = 'PT404');
  end;
  reset role;
  insert into pg_temp._t values ('A4 encolar sobre una solicitud ajena devuelve PT404', v_ok);

  update public.solicitudes set status = 'draft' where id = v_sol_b;
  perform pg_temp.as_user(v_owner_b);
  begin
    perform public.solicitud_ia_encolar(v_sol_b);
    v_ok := false;
  exception when others then v_ok := (sqlstate = '22023');
  end;
  reset role;
  insert into pg_temp._t values ('C1 un borrador no se analiza', v_ok);

  update public.ia_empresa_config set monthly_limit_micros = 1 where empresa_id = v_ea;
  perform pg_temp.as_user(v_owner_a);
  begin
    perform public.solicitud_ia_encolar(v_sol_a, 'v2');
    v_ok := false;
  exception when others then v_ok := (sqlstate = '22023');
  end;
  reset role;
  insert into pg_temp._t values ('C2 alcanzar la cuota mensual detiene el análisis', v_ok);
end $$;

reset role;
select name, case when ok then 'OK' else 'FALLO' end as resultado from pg_temp._t order by name;

do $$
declare failed int;
begin
  select count(*) into failed from pg_temp._t where not ok;
  if failed > 0 then raise exception 'Han fallado % comprobaciones de 0019', failed; end if;
  raise notice 'Análisis 0019: todas las comprobaciones han pasado';
end $$;
rollback;
