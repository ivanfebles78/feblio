-- Feblio · Pruebas de 0018 (catálogo de servicios y precios). ROLLBACK final. Sin datos reales.
--   S1 roles internos: backfill coherente, normalización y protección de company_role
--   S2 permisos: owner/manager escriben; member solo lee; cliente y anon sin acceso
--   S3 alta: versión 1, valores por defecto de moneda/impuesto desde billing_settings
--   S4 versionado: cambio → v2, sin cambio → sin versión, versión programada, cancelación
--   S5 inmutabilidad: update/delete directos rechazados; solo las RPC cierran la vigencia
--   S6 vigencia: una sola versión aplicable por fecha, sin solapes, service_price_at y la vista
--   S7 aislamiento: A no ve ni modifica el catálogo de B (ni por id, ni por código, ni importando)
--   S8 borrado: servicio usado solo se desactiva; sin usar se borra con su historial; categorías en uso
--   S9 importación: previsualización sin escribir, atomicidad, upsert por código, límites
--   S10 auditoría y onboarding: eventos registrados sin datos superfluos; paso 'services' opcional
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
          '{}', '{"role":"cliente","full_name":"Prueba 0018"}', '', '', '', '', '', '', '', '');
end $f$;

do $$
declare
  v_ea uuid; v_eb uuid;
  u_owner uuid := gen_random_uuid(); u_mgr uuid := gen_random_uuid(); u_mem uuid := gen_random_uuid();
  u_cli uuid := gen_random_uuid(); u_b uuid := gen_random_uuid();
  v_cat_a uuid; v_cat_a2 uuid; v_cat_b uuid; v_svc uuid; v_svc_b uuid; v_svc2 uuid;
  v_res jsonb; v_ver public.service_price_versions; v_row record; v_ok boolean; v_detail text;
  n int; v_id uuid; v_ver_id uuid; v_future date := current_date + 30;
begin
  -- Empresas y usuarios --------------------------------------------------------------------------
  insert into public.empresas (name, cif, email_verified, onboarding_status, language, currency, province, postal_code)
  values ('Catálogo A SL', 'B70000001', true, 'completed', 'es', 'EUR', 'Las Palmas', '35001') returning id into v_ea;
  insert into public.empresas (name, cif, email_verified, onboarding_status, language, currency)
  values ('Catálogo B SL', 'B70000002', true, 'completed', 'en', 'EUR') returning id into v_eb;
  insert into public.billing_settings (empresa_id, currency, tax_type, tax_rate)
  values (v_ea, 'EUR', 'IGIC', 7) on conflict (empresa_id) do update set tax_type = 'IGIC', tax_rate = 7;
  insert into public.billing_settings (empresa_id, currency, tax_type, tax_rate)
  values (v_eb, 'EUR', 'IVA', 21) on conflict (empresa_id) do update set tax_type = 'IVA', tax_rate = 21;

  perform pg_temp.mkuser(u_owner, 'cat-owner@example.invalid');
  perform pg_temp.mkuser(u_mgr, 'cat-manager@example.invalid');
  perform pg_temp.mkuser(u_mem, 'cat-member@example.invalid');
  perform pg_temp.mkuser(u_cli, 'cat-cliente@example.invalid');
  perform pg_temp.mkuser(u_b, 'cat-b@example.invalid');
  update public.profiles set role = 'empresa', empresa_id = v_ea, is_onboarding_owner = true, company_role = 'owner' where id = u_owner;
  update public.profiles set role = 'empresa', empresa_id = v_ea, company_role = 'manager' where id = u_mgr;
  update public.profiles set role = 'empresa', empresa_id = v_ea, company_role = 'member' where id = u_mem;
  update public.profiles set role = 'cliente', empresa_id = v_ea where id = u_cli;
  update public.profiles set role = 'empresa', empresa_id = v_eb, is_onboarding_owner = true, company_role = 'owner' where id = u_b;

  -- S1 roles internos ----------------------------------------------------------------------------
  select count(*) into n from public.profiles where role = 'empresa' and company_role is null;
  insert into pg_temp._t values ('S1a ninguna cuenta de empresa sin rol interno', n = 0);
  select count(*) into n from public.profiles where role <> 'empresa' and company_role is not null;
  insert into pg_temp._t values ('S1b las cuentas que no son de empresa tienen company_role nulo', n = 0);
  select company_role into v_detail from public.profiles where id = u_cli;
  insert into pg_temp._t values ('S1c el cliente no recibe rol interno', v_detail is null);
  -- un usuario nuevo de empresa sin rol explícito se normaliza a member
  v_id := gen_random_uuid(); perform pg_temp.mkuser(v_id, 'cat-new@example.invalid');
  update public.profiles set role = 'empresa', empresa_id = v_ea where id = v_id;
  select company_role into v_detail from public.profiles where id = v_id;
  insert into pg_temp._t values ('S1d nuevo usuario de empresa → member', v_detail = 'member');
  -- el propio usuario no puede ascenderse
  perform pg_temp.as_user(u_mem);
  begin
    update public.profiles set company_role = 'owner' where id = u_mem;
    v_ok := false;
  exception when others then v_ok := true; end;
  reset role;
  select company_role into v_detail from public.profiles where id = u_mem;
  insert into pg_temp._t values ('S1e un member no puede auto-asignarse owner', v_ok and v_detail = 'member');
  insert into pg_temp._t values ('S1f can_manage_catalog distingue rol interno',
    (select public.current_company_role() is null) is not null);

  -- S2 permisos ----------------------------------------------------------------------------------
  perform pg_temp.as_user(u_owner);
  v_cat_a := public.service_category_upsert(jsonb_build_object('code', 'LABORAL', 'name_es', 'Derecho laboral', 'name_en', 'Labour law'));
  v_cat_a2 := public.service_category_upsert(jsonb_build_object('code', 'REFORMAS', 'name_es', 'Reformas'));
  insert into pg_temp._t values ('S2a owner crea categorías', v_cat_a is not null and v_cat_a2 is not null);
  reset role;

  perform pg_temp.as_user(u_mgr);
  v_res := public.service_upsert(jsonb_build_object(
    'code', 'DESP-01', 'name_es', 'Despido improcedente', 'name_en', 'Unfair dismissal',
    'category_code', 'LABORAL', 'requires_human_review', true,
    'prerequisites', jsonb_build_array('meeting'),
    'min_info', jsonb_build_array(jsonb_build_object('key', 'fecha', 'label_es', 'Fecha del despido', 'label_en', 'Dismissal date')),
    'required_documents', jsonb_build_array(jsonb_build_object('key', 'carta', 'label_es', 'Carta de despido')),
    'client_questions', jsonb_build_array(jsonb_build_object('key', 'antiguedad', 'text_es', '¿Antigüedad?', 'answer_type', 'number')),
    'included_actions', jsonb_build_array(jsonb_build_object('es', 'Papeleta de conciliación')),
    'excluded_actions', jsonb_build_array(jsonb_build_object('es', 'Recurso de suplicación')),
    'price', jsonb_build_object('pricing_mode', 'fixed', 'base_price', '450', 'unit', null)));
  v_svc := (v_res->>'id')::uuid;
  insert into pg_temp._t values ('S2b manager crea servicios', (v_res->>'action') = 'created' and v_svc is not null);
  reset role;

  perform pg_temp.as_user(u_mem);
  select count(*) into n from public.services where empresa_id = v_ea;
  insert into pg_temp._t values ('S2c member consulta el catálogo', n = 1);
  select count(*) into n from public.service_price_versions where empresa_id = v_ea;
  insert into pg_temp._t values ('S2d member consulta el historial de precios', n = 1);
  begin
    perform public.service_upsert(jsonb_build_object('code', 'X-1', 'name_es', 'No', 'price', jsonb_build_object('base_price', '10')));
    v_ok := false; v_detail := null;
  exception when others then get stacked diagnostics v_detail = pg_exception_detail; v_ok := true; end;
  insert into pg_temp._t values ('S2e member no puede crear (catalog_forbidden)', v_ok and v_detail = 'catalog_forbidden');
  begin
    perform public.service_set_active(v_svc, false); v_ok := false;
  exception when others then v_ok := true; end;
  insert into pg_temp._t values ('S2f member no puede desactivar', v_ok);
  begin
    insert into public.services (empresa_id, code, name_es) values (v_ea, 'DIRECT', 'Directo'); v_ok := false;
  exception when others then v_ok := true; end;
  insert into pg_temp._t values ('S2g escritura directa en services rechazada', v_ok);
  reset role;

  perform pg_temp.as_user(u_cli);
  select count(*) into n from public.services;
  insert into pg_temp._t values ('S2h el cliente no ve ningún servicio', n = 0);
  begin
    perform public.service_upsert(jsonb_build_object('code', 'C-1', 'name_es', 'No', 'price', jsonb_build_object('base_price', '1')));
    v_ok := false;
  exception when others then v_ok := true; end;
  insert into pg_temp._t values ('S2i el cliente no puede escribir', v_ok);
  reset role;

  perform pg_temp.as_anon();
  -- anon ni siquiera puede evaluar la política (no tiene permiso sobre los helpers): 0 filas o error
  begin
    select count(*) into n from public.services;
  exception when others then n := 0; end;
  insert into pg_temp._t values ('S2j anon no ve el catálogo', n = 0);
  begin perform public.service_upsert('{}'::jsonb); v_ok := false; exception when others then v_ok := true; end;
  insert into pg_temp._t values ('S2k anon no puede ejecutar la RPC', v_ok);
  reset role;

  -- S3 alta y valores por defecto ------------------------------------------------------------------
  select * into v_ver from public.service_price_versions where service_id = v_svc;
  insert into pg_temp._t values ('S3a versión 1 al crear', v_ver.version_no = 1 and v_ver.base_price = 450.00);
  insert into pg_temp._t values ('S3b moneda e impuesto por defecto de la empresa (IGIC 7)',
    v_ver.currency = 'EUR' and v_ver.tax_type = 'IGIC' and v_ver.tax_rate = 7);
  insert into pg_temp._t values ('S3c vigencia abierta desde hoy', v_ver.valid_from = current_date and v_ver.valid_to is null);
  insert into pg_temp._t values ('S3d importes en numeric', pg_typeof(v_ver.base_price)::text = 'numeric');
  perform pg_temp.as_user(u_owner);
  begin
    perform public.service_upsert(jsonb_build_object('code', 'BAD-1', 'name_es', 'Sin precio'));
    v_ok := false; v_detail := null;
  exception when others then get stacked diagnostics v_detail = pg_exception_detail; v_ok := true; end;
  insert into pg_temp._t values ('S3e crear sin precio se rechaza', v_ok and v_detail = 'invalid_price');
  begin
    perform public.service_upsert(jsonb_build_object('code', 'BAD-2', 'name_es', 'Rango', 'price',
      jsonb_build_object('base_price', '10', 'min_price', '50', 'max_price', '20')));
    v_ok := false; v_detail := null;
  exception when others then get stacked diagnostics v_detail = pg_exception_detail; v_ok := true; end;
  insert into pg_temp._t values ('S3f rango mín/máx incoherente se rechaza', v_ok and v_detail = 'invalid_range');
  begin
    perform public.service_upsert(jsonb_build_object('code', 'BAD-3', 'name_es', 'Moneda', 'price',
      jsonb_build_object('base_price', '10', 'currency', 'euros')));
    v_ok := false; v_detail := null;
  exception when others then get stacked diagnostics v_detail = pg_exception_detail; v_ok := true; end;
  insert into pg_temp._t values ('S3g moneda no ISO se rechaza', v_ok and v_detail = 'invalid_currency');
  begin
    perform public.service_upsert(jsonb_build_object('code', 'BAD-4', 'name_es', 'Impuesto', 'price',
      jsonb_build_object('base_price', '10', 'tax_type', 'VAT')));
    v_ok := false; v_detail := null;
  exception when others then get stacked diagnostics v_detail = pg_exception_detail; v_ok := true; end;
  insert into pg_temp._t values ('S3h impuesto desconocido se rechaza (no se asume IVA/IGIC)', v_ok and v_detail = 'invalid_tax');

  -- S4 versionado ----------------------------------------------------------------------------------
  v_res := public.service_upsert(jsonb_build_object('id', v_svc, 'code', 'DESP-01', 'name_es', 'Despido improcedente',
    'price', jsonb_build_object('pricing_mode', 'fixed', 'base_price', '450')));
  select count(*) into n from public.service_price_versions where service_id = v_svc;
  insert into pg_temp._t values ('S4a guardar el mismo precio no crea versión', n = 1 and not (v_res->>'new_price_version')::boolean);
  v_res := public.service_set_price(v_svc, jsonb_build_object('pricing_mode', 'hourly', 'base_price', '90', 'unit', 'hora'));
  select count(*) into n from public.service_price_versions where service_id = v_svc;
  insert into pg_temp._t values ('S4b cambiar el precio crea la versión 2', n = 2 and (v_res->>'version_no')::int = 2);
  select * into v_ver from public.service_price_versions where service_id = v_svc and version_no = 1;
  insert into pg_temp._t values ('S4c la versión anterior conserva sus importes y queda cerrada',
    v_ver.base_price = 450.00 and v_ver.valid_to = current_date and v_ver.superseded_at is not null);
  -- versión programada a futuro
  v_res := public.service_set_price(v_svc, jsonb_build_object('pricing_mode', 'hourly', 'base_price', '110', 'unit', 'hora',
    'valid_from', v_future::text));
  insert into pg_temp._t values ('S4d se puede programar una versión futura', (v_res->>'version_no')::int = 3);
  select id into v_ver_id from public.service_price_versions where service_id = v_svc and version_no = 2;
  select * into v_ver from public.service_price_versions where id = v_ver_id;
  insert into pg_temp._t values ('S4e la vigente se cierra en la fecha futura, no antes', v_ver.valid_to = v_future);
  insert into pg_temp._t values ('S4f hoy sigue aplicando la versión 2', public.service_price_at(v_svc) = v_ver_id);
  insert into pg_temp._t values ('S4g en la fecha futura aplica la versión 3',
    public.service_price_at(v_svc, v_future) = (select id from public.service_price_versions where service_id = v_svc and version_no = 3));
  begin
    perform public.service_set_price(v_svc, jsonb_build_object('base_price', '999', 'valid_from', (current_date + 10)::text));
    v_ok := false; v_detail := null;
  exception when others then get stacked diagnostics v_detail = pg_exception_detail; v_ok := true; end;
  insert into pg_temp._t values ('S4h no se puede intercalar una versión anterior a la programada', v_ok and v_detail = 'price_overlap');
  begin
    perform public.service_set_price(v_svc, jsonb_build_object('base_price', '999', 'valid_from', (current_date - 1)::text));
    v_ok := false; v_detail := null;
  exception when others then get stacked diagnostics v_detail = pg_exception_detail; v_ok := true; end;
  insert into pg_temp._t values ('S4i no se puede fechar una versión en el pasado', v_ok and v_detail = 'price_past_date');
  v_res := public.service_cancel_scheduled_price(v_svc);
  select count(*) into n from public.service_price_versions where service_id = v_svc;
  select * into v_ver from public.service_price_versions where id = v_ver_id;
  insert into pg_temp._t values ('S4j cancelar la versión programada reabre la vigente',
    n = 2 and v_ver.valid_to is null and v_ver.superseded_at is null);

  -- S5 inmutabilidad -------------------------------------------------------------------------------
  reset role;
  perform pg_temp.as_user(u_owner);
  begin
    update public.service_price_versions set base_price = 1 where id = v_ver_id; v_ok := false;
  exception when others then v_ok := true; end;
  insert into pg_temp._t values ('S5a authenticated no puede modificar una versión', v_ok);
  begin
    delete from public.service_price_versions where id = v_ver_id; v_ok := false;
  exception when others then v_ok := true; end;
  insert into pg_temp._t values ('S5b authenticated no puede borrar una versión', v_ok);
  reset role;
  begin
    update public.service_price_versions set base_price = 1 where id = v_ver_id;
    v_ok := false; v_detail := null;
  exception when others then get stacked diagnostics v_detail = pg_exception_detail; v_ok := true; end;
  insert into pg_temp._t values ('S5c ni siquiera un contexto confiable cambia los importes', v_ok and v_detail = 'price_version_immutable');
  select count(*) into n from public.service_price_versions where id = v_ver_id and base_price = 90.00;
  insert into pg_temp._t values ('S5d la versión conserva su importe', n = 1);

  -- S6 vigencia sin solapes -------------------------------------------------------------------------
  begin
    insert into public.service_price_versions (service_id, empresa_id, version_no, pricing_mode, base_price, currency, tax_type, tax_rate, valid_from)
    values (v_svc, v_ea, 99, 'fixed', 10, 'EUR', 'IGIC', 7, current_date);
    v_ok := false;
  exception when others then v_ok := true; end;
  insert into pg_temp._t values ('S6a la restricción de exclusión impide solapar vigencias', v_ok);
  select count(*) into n from public.service_price_versions v
   where v.service_id = v_svc and v.valid_from <= current_date and (v.valid_to is null or current_date < v.valid_to);
  insert into pg_temp._t values ('S6b exactamente una versión aplicable hoy', n = 1);
  perform pg_temp.as_user(u_mem);
  select * into v_row from public.services_catalog_v where id = v_svc;
  insert into pg_temp._t values ('S6c la vista resuelve la versión vigente',
    v_row.price_version_id = v_ver_id and v_row.base_price = 90.00 and v_row.pricing_mode = 'hourly');
  insert into pg_temp._t values ('S6d la vista muestra el código y la categoría', v_row.code = 'DESP-01' and v_row.category_code = 'LABORAL');
  reset role;

  -- S7 aislamiento entre empresas --------------------------------------------------------------------
  perform pg_temp.as_user(u_b);
  v_cat_b := public.service_category_upsert(jsonb_build_object('code', 'LABORAL', 'name_es', 'Labour'));
  v_res := public.service_upsert(jsonb_build_object('code', 'DESP-01', 'name_es', 'Dismissal B', 'category_code', 'LABORAL',
    'price', jsonb_build_object('pricing_mode', 'fixed', 'base_price', '600')));
  v_svc_b := (v_res->>'id')::uuid;
  insert into pg_temp._t values ('S7a el mismo código puede existir en otra empresa', v_svc_b is not null and v_svc_b <> v_svc);
  select count(*) into n from public.services;
  insert into pg_temp._t values ('S7b B solo ve su propio catálogo', n = 1);
  select count(*) into n from public.service_price_versions;
  insert into pg_temp._t values ('S7c B solo ve sus versiones', n = 1);
  begin
    perform public.service_set_price(v_svc, jsonb_build_object('base_price', '1'));
    v_ok := false; v_detail := null;
  exception when others then get stacked diagnostics v_detail = pg_exception_detail; v_ok := true; end;
  insert into pg_temp._t values ('S7d B no puede cambiar el precio de un servicio de A', v_ok and v_detail = 'service_not_found');
  begin
    perform public.service_set_active(v_svc, false); v_ok := false; v_detail := null;
  exception when others then get stacked diagnostics v_detail = pg_exception_detail; v_ok := true; end;
  insert into pg_temp._t values ('S7e B no puede desactivar un servicio de A', v_ok and v_detail = 'service_not_found');
  begin
    perform public.service_delete(v_svc); v_ok := false; v_detail := null;
  exception when others then get stacked diagnostics v_detail = pg_exception_detail; v_ok := true; end;
  insert into pg_temp._t values ('S7f B no puede borrar un servicio de A', v_ok and v_detail = 'service_not_found');
  begin
    perform public.service_category_delete(v_cat_a, 'clear'); v_ok := false; v_detail := null;
  exception when others then get stacked diagnostics v_detail = pg_exception_detail; v_ok := true; end;
  insert into pg_temp._t values ('S7g B no puede borrar una categoría de A', v_ok and v_detail = 'category_not_found');
  -- importar con el id de un servicio de A no toca a A: crea/actualiza en B por código
  v_res := public.services_import(jsonb_build_array(jsonb_build_object('id', v_svc::text, 'code', 'DESP-01',
    'name_es', 'Dismissal B2', 'price', jsonb_build_object('base_price', '600'))), true);
  select name_es into v_detail from public.services where id = v_svc;
  reset role;
  select name_es into v_detail from public.services where id = v_svc;
  insert into pg_temp._t values ('S7h importar desde B no modifica el servicio de A', v_detail = 'Despido improcedente');
  select count(*) into n from public.services where empresa_id = v_eb;
  insert into pg_temp._t values ('S7i la importación de B actúa sobre su propio catálogo', n = 1);

  -- S8 borrado --------------------------------------------------------------------------------------
  perform pg_temp.as_user(u_owner);
  v_res := public.service_upsert(jsonb_build_object('code', 'TEMP-01', 'name_es', 'Temporal',
    'price', jsonb_build_object('base_price', '25')));
  v_svc2 := (v_res->>'id')::uuid;
  reset role;
  perform public.service_register_usage((select id from public.service_price_versions where service_id = v_svc order by version_no desc limit 1));
  perform pg_temp.as_user(u_owner);
  begin
    perform public.service_delete(v_svc); v_ok := false; v_detail := null;
  exception when others then get stacked diagnostics v_detail = pg_exception_detail; v_ok := true; end;
  insert into pg_temp._t values ('S8a un servicio utilizado no se puede borrar', v_ok and v_detail = 'service_in_use');
  v_res := public.service_set_active(v_svc, false);
  select count(*) into n from public.service_price_versions where service_id = v_svc;
  insert into pg_temp._t values ('S8b desactivar conserva el historial', not (select is_active from public.services where id = v_svc) and n = 2);
  v_res := public.service_delete(v_svc2);
  select count(*) into n from public.service_price_versions where service_id = v_svc2;
  insert into pg_temp._t values ('S8c un servicio sin usar se borra con sus versiones',
    not exists (select 1 from public.services where id = v_svc2) and n = 0);
  begin
    perform public.service_category_delete(v_cat_a); v_ok := false; v_detail := null;
  exception when others then get stacked diagnostics v_detail = pg_exception_detail; v_ok := true; end;
  insert into pg_temp._t values ('S8d una categoría en uso no se borra sin decidir qué hacer', v_ok and v_detail = 'category_in_use');
  v_res := public.service_category_delete(v_cat_a, 'clear');
  select category_id into v_id from public.services where id = v_svc;
  insert into pg_temp._t values ('S8e con "clear" los servicios quedan sin categoría',
    v_id is null and (v_res->>'services_updated')::int = 1);

  -- S9 importación -----------------------------------------------------------------------------------
  v_res := public.services_import(jsonb_build_array(
    jsonb_build_object('code', 'IMP-01', 'name_es', 'Importado 1', 'category_code', 'REFORMAS',
      'price', jsonb_build_object('pricing_mode', 'per_unit', 'base_price', '35', 'unit', 'm²')),
    jsonb_build_object('code', 'IMP-02', 'name_es', 'Importado 2',
      'price', jsonb_build_object('pricing_mode', 'on_assessment'))), false);
  select count(*) into n from public.services where empresa_id = v_ea and code like 'IMP-%';
  insert into pg_temp._t values ('S9a la previsualización no escribe nada',
    n = 0 and (v_res->>'committed')::boolean = false and (v_res->>'ok')::boolean = true and (v_res->>'total')::int = 2);
  v_res := public.services_import(jsonb_build_array(
    jsonb_build_object('code', 'IMP-01', 'name_es', 'Importado 1', 'price', jsonb_build_object('base_price', '35')),
    jsonb_build_object('code', 'mal codigo', 'name_es', 'Error', 'price', jsonb_build_object('base_price', '1'))), true);
  select count(*) into n from public.services where empresa_id = v_ea and code like 'IMP-%';
  insert into pg_temp._t values ('S9b si una fila falla no se guarda ninguna',
    n = 0 and (v_res->>'ok')::boolean = false and (v_res->>'errors')::int = 1
    and (v_res->'rows'->1->>'error') = 'invalid_code');
  v_res := public.services_import(jsonb_build_array(
    jsonb_build_object('code', 'IMP-01', 'name_es', 'Importado 1', 'category_code', 'REFORMAS',
      'price', jsonb_build_object('pricing_mode', 'per_unit', 'base_price', '35', 'unit', 'm²')),
    jsonb_build_object('code', 'IMP-02', 'name_es', 'Importado 2', 'price', jsonb_build_object('pricing_mode', 'on_assessment'))), true);
  select count(*) into n from public.services where empresa_id = v_ea and code like 'IMP-%';
  insert into pg_temp._t values ('S9c importación confirmada crea los servicios',
    n = 2 and (v_res->>'committed')::boolean and (v_res->>'created')::int = 2);
  v_res := public.services_import(jsonb_build_array(
    jsonb_build_object('code', 'IMP-01', 'name_es', 'Importado 1 (rev)',
      'price', jsonb_build_object('pricing_mode', 'per_unit', 'base_price', '40', 'unit', 'm²'))), true);
  select count(*) into n from public.service_price_versions v join public.services s on s.id = v.service_id
   where s.code = 'IMP-01' and s.empresa_id = v_ea;
  insert into pg_temp._t values ('S9d reimportar con otro precio crea una versión nueva (upsert por código)',
    n = 2 and (v_res->>'updated')::int = 1 and (v_res->>'new_price_versions')::int = 1);
  begin
    perform public.services_import((select jsonb_agg(jsonb_build_object('code', 'M' || g, 'name_es', 'x', 'price', jsonb_build_object('base_price', '1')))
                                    from generate_series(1, 501) g), false);
    v_ok := false; v_detail := null;
  exception when others then get stacked diagnostics v_detail = pg_exception_detail; v_ok := true; end;
  insert into pg_temp._t values ('S9e más de 500 filas se rechaza', v_ok and v_detail = 'import_too_large');

  -- S10 auditoría y onboarding -------------------------------------------------------------------------
  reset role;
  select count(*) into n from public.audit_events where empresa_id = v_ea and action like 'catalog.%';
  insert into pg_temp._t values ('S10a se auditan las operaciones del catálogo', n >= 8);
  select count(*) into n from public.audit_events where empresa_id = v_ea and action = 'catalog.price_changed';
  insert into pg_temp._t values ('S10b se auditan los cambios de precio', n >= 2);
  select count(*) into n from public.audit_events where empresa_id = v_ea and action = 'catalog.imported'
    and (not (metadata ? 'rows') or metadata ? 'file' or metadata ? 'payload' or metadata ? 'services');
  insert into pg_temp._t values ('S10c la importación se audita sin el archivo ni los datos completos',
    n = 0 and (select count(*) from public.audit_events where empresa_id = v_ea and action = 'catalog.imported') = 2);
  select count(*) into n from public.audit_events where empresa_id = v_ea
    and action in ('catalog.service_deactivated', 'catalog.service_deleted', 'catalog.category_deleted');
  insert into pg_temp._t values ('S10d se auditan desactivaciones y borrados', n = 3);
  perform public.ensure_onboarding_defaults(v_ea);
  select count(*) into n from public.onboarding_steps where empresa_id = v_ea and step_key = 'services';
  insert into pg_temp._t values ('S10e ensure_onboarding_defaults crea el paso opcional services', n = 1);
  select onboarding_status into v_detail from public.empresas where id = v_ea;
  insert into pg_temp._t values ('S10f el paso nuevo no reabre el onboarding', v_detail = 'completed');
  select count(*) into n from public.onboarding_steps where empresa_id = v_ea and step_key = 'services' and status = 'pending';
  insert into pg_temp._t values ('S10g el paso queda pendiente y es opcional', n = 1);
end $$;

reset role;
select name, case when ok then 'OK' else 'FALLO' end as resultado from pg_temp._t order by name;
do $$
declare failed int;
begin
  select count(*) into failed from pg_temp._t where not ok;
  if failed > 0 then raise exception 'Han fallado % comprobaciones de 0018', failed; end if;
  raise notice 'Catálogo 0018: todas las comprobaciones han pasado';
end $$;
rollback;
