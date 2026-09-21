-- Feblio · 0016 · Mensajes y notificaciones del servidor en el idioma de la empresa + códigos estables de error.
--
-- Idempotente (create or replace). Aplicar DESPUÉS de 0015. No crea tablas ni columnas; no modifica datos.
-- · srv_lang(empresa) resuelve el idioma corporativo (empresas.language ∈ es|en, si no → es).
-- · srv_text(lang, key, args) es el catálogo tipado de textos generados por el servidor (es/en, fallback es).
-- · Los mensajes de sistema, cuerpos por defecto y notificaciones se persisten en el idioma de la empresa
--   EN EL MOMENTO DE CREARSE (los históricos no se reescriben; cambiar empresas.language después no los altera).
-- · Las excepciones públicas conservan su mensaje (compatibilidad) y añaden `detail` con un código estable
--   (invalid_link, rate_limited, request_closed, …) que el frontend traduce.
-- · submit_intake_form / verify_email_otp / claim_native_email_verification devuelven además `code`.
-- Todas las funciones conservan literalmente firmas, security definer, search_path, RLS, grants y auditoría.

-- ---------------------------------------------------------------------------
-- 1) Idioma de la empresa y catálogo de textos del servidor
-- ---------------------------------------------------------------------------
create or replace function public.srv_lang(p_empresa uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when e.language in ('es', 'en') then e.language else 'es' end
  from public.empresas e where e.id = p_empresa
  union all select 'es' limit 1;
$$;
revoke all on function public.srv_lang(uuid) from public, anon, authenticated;

-- Catálogo (claves semánticas estables). Interpolación segura de {{variable}} desde p_args (texto plano).
create or replace function public.srv_text(p_lang text, p_key text, p_args jsonb default '{}'::jsonb)
returns text language plpgsql immutable as $$
declare
  v_cat constant jsonb := $cat$
  {
    "request.systemSubmitted":   {"es": "El cliente ha enviado el formulario ({{percent}}% de la información necesaria).", "en": "The client has submitted the form ({{percent}}% of the required information)."},
    "request.infoRequestDefault":{"es": "Necesitamos algo más de información para continuar.", "en": "We need a little more information to continue."},
    "request.requisitoDefault":  {"es": "Información", "en": "Information"},
    "request.authorCompany":     {"es": "Empresa", "en": "Company"},
    "notif.submitted.title":     {"es": "Formulario recibido: {{title}}", "en": "Form received: {{title}}"},
    "notif.submitted.body":      {"es": "{{name}} ha enviado el formulario ({{percent}}% completo).", "en": "{{name}} has submitted the form ({{percent}}% complete)."},
    "notif.client_reply.title":  {"es": "Respuesta del cliente: {{title}}", "en": "Client reply: {{title}}"},
    "notif.client_document.title":{"es": "Nuevo archivo del cliente: {{title}}", "en": "New file from the client: {{title}}"},
    "notif.message.title":       {"es": "Nuevo mensaje sobre tu solicitud", "en": "New message about your request"},
    "notif.document.title":      {"es": "Nuevo archivo en tu solicitud", "en": "New file in your request"},
    "notif.info_requested.title":{"es": "Te han pedido información", "en": "Information requested from you"},
    "notif.status.ready_for_scope":{"es": "Solicitud lista para preparar alcance", "en": "Request ready to prepare the scope"},
    "notif.status.closed":       {"es": "Solicitud cerrada", "en": "Request closed"},
    "notif.status.under_review": {"es": "Solicitud en revisión", "en": "Request under review"},
    "notif.status.other":        {"es": "Solicitud actualizada", "en": "Request updated"},
    "intake.taskTitle":          {"es": "Nuevo cliente: {{name}}", "en": "New client: {{name}}"},
    "intake.taskDetail":         {"es": "Ha completado el formulario de contacto.", "en": "They have completed the contact form."},
    "intake.defaultClient":      {"es": "Cliente", "en": "Client"},
    "intake.testPrefix":         {"es": "[PRUEBA] ", "en": "[TEST] "}
  }
  $cat$::jsonb;
  v_lang text := case when p_lang in ('es', 'en') then p_lang else 'es' end;
  v_txt text;
  r record;
begin
  v_txt := coalesce(v_cat #>> array[p_key, v_lang], v_cat #>> array[p_key, 'es']);
  if v_txt is null then raise exception 'srv_text: clave desconocida %', p_key; end if;
  for r in select key, value from jsonb_each_text(coalesce(p_args, '{}'::jsonb)) loop
    v_txt := replace(v_txt, '{{' || r.key || '}}', coalesce(r.value, ''));
  end loop;
  return v_txt;
end $$;
revoke all on function public.srv_text(text, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Funciones de 0014 (misma definición) con textos localizados y códigos de error
-- ---------------------------------------------------------------------------

create or replace function public.sol_propia(p_solicitud uuid)
returns public.solicitudes language plpgsql stable security definer set search_path = public as $$
declare s public.solicitudes;
begin
  select * into s from public.solicitudes where id = p_solicitud and empresa_id = public.sol_empresa_actual();
  if s.id is null then raise exception 'Solicitud no encontrada' using errcode = 'P0002', detail = 'request_not_found'; end if;
  return s;
end $$;
revoke all on function public.sol_propia(uuid) from public, anon, authenticated;

create or replace function public.sol_acceso_valido(p_token text)
returns public.solicitud_accesos language plpgsql security definer set search_path = public as $$
declare a public.solicitud_accesos;
begin
  if p_token is null or length(p_token) < 32 then raise exception 'Enlace no válido' using errcode = '42501', detail = 'invalid_link'; end if;
  select * into a from public.solicitud_accesos where token_hash = public.sol_hash(p_token);
  if a.id is null or a.revoked_at is not null or a.expires_at < now() then
    raise exception 'Enlace no válido' using errcode = '42501', detail = 'invalid_link';
  end if;
  update public.solicitud_accesos set last_used_at = now() where id = a.id;
  return a;
end $$;
revoke all on function public.sol_acceso_valido(text) from public, anon, authenticated;

create or replace function public.sol_validar_archivo(p_name text, p_mime text, p_size bigint)
returns void language plpgsql immutable as $$
declare ext text := lower(substring(p_name from '\.([A-Za-z0-9]+)$'));
begin
  if p_size is null or p_size <= 0 or p_size > 10485760 then raise exception 'El archivo supera el tamaño máximo (10 MB)' using errcode = '22023', detail = 'file_too_large'; end if;
  if ext is null or ext not in ('pdf', 'doc', 'docx', 'xls', 'xlsx', 'png', 'jpg', 'jpeg') then raise exception 'Tipo de archivo no permitido' using errcode = '22023', detail = 'file_type_not_allowed'; end if;
  if lower(coalesce(p_mime, '')) not in ('application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
       'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'image/png', 'image/jpeg') then
    raise exception 'Tipo de archivo no permitido' using errcode = '22023', detail = 'file_type_not_allowed';
  end if;
end $$;
revoke all on function public.sol_validar_archivo(text, text, bigint) from public, anon, authenticated;

create or replace function public.solicitud_cambiar_estado(p_solicitud uuid, p_estado text, p_motivo text default null)
returns public.solicitudes language plpgsql security definer set search_path = public as $$
declare s public.solicitudes := public.sol_propia(p_solicitud); v_cli uuid; v_title text;
begin
  if not public.sol_transicion_valida(s.status, p_estado) then
    raise exception 'Transición no permitida: % → %', s.status, p_estado using errcode = '22023', detail = 'invalid_transition';
  end if;
  if p_estado = 'closed' and nullif(trim(coalesce(p_motivo, '')), '') is null then
    raise exception 'Indica el motivo de cierre' using errcode = '22023', detail = 'close_reason_required';
  end if;
  if s.status = 'closed' and p_estado <> 'closed' and exists (select 1 from public.documents d where d.type = 'presupuesto' and d.empresa_id = s.empresa_id and d.project_id in (select id from public.projects where cliente_id = s.cliente_id and s.cliente_id is not null)) then
    raise exception 'No se puede reabrir: ya existe un presupuesto' using errcode = '22023', detail = 'reopen_blocked';
  end if;
  update public.solicitudes set status = p_estado, closed_reason = case when p_estado = 'closed' then left(p_motivo, 500) else null end, last_activity_at = now()
   where id = s.id returning * into s;
  v_title := public.srv_text(public.srv_lang(s.empresa_id), case when p_estado in ('ready_for_scope', 'closed', 'under_review') then 'notif.status.' || p_estado else 'notif.status.other' end);
  if p_estado in ('ready_for_scope', 'closed') or (p_estado = 'under_review' and p_motivo = 'reopen') then
    perform public.sol_notificar(s.empresa_id, 'cliente', s.cliente_id, s.id, 'solicitud.' || p_estado, v_title, s.title, null,
      'sol:' || s.id || ':status:' || p_estado || ':' || to_char(now(), 'YYYYMMDDHH24MI'));
  end if;
  perform public.audit_log_internal(s.empresa_id, auth.uid(), 'solicitud.status.' || p_estado, 'solicitudes', s.id, 'ok', jsonb_build_object('reason', p_motivo));
  return s;
end $$;
revoke all on function public.solicitud_cambiar_estado(uuid, text, text) from public, anon;
grant execute on function public.solicitud_cambiar_estado(uuid, text, text) to authenticated;

create or replace function public.solicitud_solicitar_informacion(p_solicitud uuid, p_items jsonb, p_mensaje text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare s public.solicitudes := public.sol_propia(p_solicitud); it jsonb; v_ids uuid[] := '{}'; v_id uuid; v_msg uuid; v_name text; v_body text; v_lang text := public.srv_lang(s.empresa_id);
begin
  if s.status not in ('submitted', 'under_review', 'missing_information', 'ready_for_scope') then
    raise exception 'La solicitud no admite peticiones de información en su estado actual' using errcode = '22023', detail = 'info_request_not_allowed';
  end if;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    insert into public.solicitud_requisitos (solicitud_id, empresa_id, kind, key, label, required, status, requested_at)
    values (s.id, s.empresa_id, coalesce(it->>'kind', 'field'), coalesce(nullif(it->>'key', ''), 'req_' || substr(gen_random_uuid()::text, 1, 8)), left(coalesce(it->>'label', it->>'key', public.srv_text(v_lang, 'request.requisitoDefault')), 200), true, 'pending', now())
    on conflict (solicitud_id, key) do update set status = 'pending', requested_at = now(), resolved_at = null, label = excluded.label
    returning id into v_id;
    v_ids := v_ids || v_id;
  end loop;
  select coalesce(full_name, email) into v_name from public.profiles where id = auth.uid();
  v_body := coalesce(nullif(trim(p_mensaje), ''), public.srv_text(v_lang, 'request.infoRequestDefault'));
  insert into public.solicitud_mensajes (solicitud_id, empresa_id, author_kind, author_user_id, author_name, kind, body, requisito_ids, read_by_empresa_at)
  values (s.id, s.empresa_id, 'empresa', auth.uid(), coalesce(v_name, public.srv_text(v_lang, 'request.authorCompany')), 'info_request', v_body, v_ids, now()) returning id into v_msg;
  if s.status <> 'missing_information' then update public.solicitudes set status = 'missing_information' where id = s.id; end if;
  update public.solicitudes set last_activity_at = now() where id = s.id;
  if array_length(v_ids, 1) > 0 then perform public.sol_analizar(s.id, 'empresa'); end if;  -- la completitud refleja los nuevos pendientes
  perform public.sol_notificar(s.empresa_id, 'cliente', s.cliente_id, s.id, 'solicitud.info_requested', public.srv_text(v_lang, 'notif.info_requested.title'), v_body, null, 'msg:' || v_msg);
  perform public.audit_log_internal(s.empresa_id, auth.uid(), 'solicitud.info_requested', 'solicitudes', s.id, 'ok', jsonb_build_object('items', coalesce(jsonb_array_length(p_items), 0)));
  return v_msg;
end $$;
revoke all on function public.solicitud_solicitar_informacion(uuid, jsonb, text) from public, anon;
grant execute on function public.solicitud_solicitar_informacion(uuid, jsonb, text) to authenticated;

create or replace function public.solicitud_enviar_mensaje(p_solicitud uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare s public.solicitudes := public.sol_propia(p_solicitud); v_msg uuid; v_name text; v_lang text := public.srv_lang(s.empresa_id);
begin
  if nullif(trim(coalesce(p_body, '')), '') is null then raise exception 'Escribe un mensaje' using errcode = '22023', detail = 'message_required'; end if;
  select coalesce(full_name, email) into v_name from public.profiles where id = auth.uid();
  insert into public.solicitud_mensajes (solicitud_id, empresa_id, author_kind, author_user_id, author_name, kind, body, read_by_empresa_at)
  values (s.id, s.empresa_id, 'empresa', auth.uid(), coalesce(v_name, public.srv_text(v_lang, 'request.authorCompany')), 'message', left(p_body, 4000), now()) returning id into v_msg;
  update public.solicitudes set last_activity_at = now() where id = s.id;
  perform public.sol_notificar(s.empresa_id, 'cliente', s.cliente_id, s.id, 'solicitud.message', public.srv_text(v_lang, 'notif.message.title'), left(p_body, 200), null, 'msg:' || v_msg);
  perform public.audit_log_internal(s.empresa_id, auth.uid(), 'solicitud.message', 'solicitud_mensajes', v_msg, 'ok', jsonb_build_object('solicitud_id', s.id));
  return v_msg;
end $$;
revoke all on function public.solicitud_enviar_mensaje(uuid, text) from public, anon;
grant execute on function public.solicitud_enviar_mensaje(uuid, text) to authenticated;

create or replace function public.solicitud_registrar_documento(p_solicitud uuid, p_path text, p_name text, p_mime text, p_size bigint, p_requisito uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare s public.solicitudes := public.sol_propia(p_solicitud); v_id uuid;
begin
  perform public.sol_validar_archivo(p_name, p_mime, p_size);
  if p_path not like 'emp/' || s.empresa_id || '/' || s.id || '/%' then raise exception 'Ruta no válida' using errcode = '22023', detail = 'invalid_path'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'intake-files' and o.name = p_path) then raise exception 'Archivo no encontrado' using errcode = '22023', detail = 'file_not_found'; end if;
  insert into public.solicitud_documentos (solicitud_id, empresa_id, uploaded_by_kind, uploaded_by_user_id, original_name, storage_path, mime_type, size_bytes, requisito_id)
  values (s.id, s.empresa_id, 'empresa', auth.uid(), left(p_name, 255), p_path, lower(p_mime), p_size, p_requisito) returning id into v_id;
  update public.solicitudes set last_activity_at = now() where id = s.id;
  perform public.sol_notificar(s.empresa_id, 'cliente', s.cliente_id, s.id, 'solicitud.document', public.srv_text(public.srv_lang(s.empresa_id), 'notif.document.title'), left(p_name, 200), null, 'doc:' || v_id);
  perform public.audit_log_internal(s.empresa_id, auth.uid(), 'solicitud.document.added', 'solicitud_documentos', v_id, 'ok', jsonb_build_object('by', 'empresa', 'size', p_size, 'solicitud_id', s.id));
  return v_id;
end $$;
revoke all on function public.solicitud_registrar_documento(uuid, text, text, text, bigint, uuid) from public, anon;
grant execute on function public.solicitud_registrar_documento(uuid, text, text, text, bigint, uuid) to authenticated;

create or replace function public.solicitud_acceso_guardar(p_token text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.solicitud_accesos := public.sol_acceso_valido(p_token); s public.solicitudes;
begin
  select * into s from public.solicitudes where id = a.solicitud_id;
  if s.status not in ('draft', 'awaiting_client', 'missing_information') then raise exception 'El formulario ya se ha enviado' using errcode = '22023', detail = 'already_submitted'; end if;
  update public.solicitudes
     set form_data = coalesce(s.form_data, '{}'::jsonb) || jsonb_strip_nulls(coalesce(p_data, '{}'::jsonb)),
         contact_name = coalesce(nullif(trim(p_data->>'contact_name'), ''), contact_name),
         contact_email = coalesce(nullif(lower(trim(p_data->>'contact_email')), ''), contact_email),
         contact_phone = coalesce(nullif(trim(p_data->>'contact_phone'), ''), contact_phone),
         last_activity_at = now()
   where id = s.id returning * into s;
  return public.sol_vista_cliente(s, a);
end $$;
revoke all on function public.solicitud_acceso_guardar(text, jsonb) from public;
grant execute on function public.solicitud_acceso_guardar(text, jsonb) to anon, authenticated;

create or replace function public.solicitud_acceso_enviar(p_token text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.solicitud_accesos := public.sol_acceso_valido(p_token); s public.solicitudes; an public.solicitud_analisis; v_msg uuid; v_lang text;
begin
  select * into s from public.solicitudes where id = a.solicitud_id;
  if s.status not in ('draft', 'awaiting_client', 'missing_information') then raise exception 'El formulario ya se ha enviado' using errcode = '22023', detail = 'already_submitted'; end if;
  update public.solicitudes
     set form_data = coalesce(s.form_data, '{}'::jsonb) || jsonb_strip_nulls(coalesce(p_data, '{}'::jsonb)),
         contact_name = coalesce(nullif(trim(p_data->>'contact_name'), ''), contact_name),
         contact_email = coalesce(nullif(lower(trim(p_data->>'contact_email')), ''), contact_email),
         contact_phone = coalesce(nullif(trim(p_data->>'contact_phone'), ''), contact_phone),
         status = case when s.status = 'missing_information' then 'under_review' else 'submitted' end,
         form_submitted_at = now(), last_activity_at = now()
   where id = s.id returning * into s;
  -- Campos pedidos manualmente que ahora vienen informados → recibidos
  update public.solicitud_requisitos q set status = 'received'
   where q.solicitud_id = s.id and q.kind = 'field' and q.status = 'pending' and nullif(trim(coalesce(s.form_data->>q.key, '')), '') is not null;
  an := public.sol_analizar(s.id, 'cliente');
  v_lang := public.srv_lang(s.empresa_id);
  select * into s from public.solicitudes where id = s.id;   -- completeness actualizada
  insert into public.solicitud_mensajes (solicitud_id, empresa_id, author_kind, author_name, kind, body, read_by_cliente_at)
  values (s.id, s.empresa_id, 'sistema', 'Feblio', 'system', public.srv_text(v_lang, 'request.systemSubmitted', jsonb_build_object('percent', an.completeness)), now()) returning id into v_msg;
  perform public.sol_notificar(s.empresa_id, 'empresa', null, s.id, 'solicitud.submitted', public.srv_text(v_lang, 'notif.submitted.title', jsonb_build_object('title', s.title)), public.srv_text(v_lang, 'notif.submitted.body', jsonb_build_object('name', s.contact_name, 'percent', an.completeness)), '/empresa/solicitudes/' || s.id, 'sol:' || s.id || ':submitted:' || to_char(s.form_submitted_at, 'YYYYMMDDHH24MISS'));
  perform public.audit_log_internal(s.empresa_id, null, 'solicitud.submitted', 'solicitudes', s.id, 'ok', jsonb_build_object('completeness', an.completeness, 'access_id', a.id));
  return public.sol_vista_cliente(s, a);
end $$;
revoke all on function public.solicitud_acceso_enviar(text, jsonb) from public;
grant execute on function public.solicitud_acceso_enviar(text, jsonb) to anon, authenticated;

create or replace function public.solicitud_acceso_mensaje(p_token text, p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.solicitud_accesos := public.sol_acceso_valido(p_token); s public.solicitudes; v_msg uuid;
begin
  select * into s from public.solicitudes where id = a.solicitud_id;
  if s.status = 'closed' then raise exception 'La solicitud está cerrada' using errcode = '22023', detail = 'request_closed'; end if;
  if nullif(trim(coalesce(p_body, '')), '') is null then raise exception 'Escribe un mensaje' using errcode = '22023', detail = 'message_required'; end if;
  insert into public.solicitud_mensajes (solicitud_id, empresa_id, author_kind, author_name, kind, body, read_by_cliente_at)
  values (s.id, s.empresa_id, 'cliente', s.contact_name, 'message', left(p_body, 4000), now()) returning id into v_msg;
  update public.solicitudes set last_activity_at = now(), status = case when status = 'missing_information' then 'under_review' else status end where id = s.id;
  perform public.sol_notificar(s.empresa_id, 'empresa', null, s.id, 'solicitud.client_reply', public.srv_text(public.srv_lang(s.empresa_id), 'notif.client_reply.title', jsonb_build_object('title', s.title)), left(p_body, 200), '/empresa/solicitudes/' || s.id, 'msg:' || v_msg);
  perform public.audit_log_internal(s.empresa_id, null, 'solicitud.client_message', 'solicitud_mensajes', v_msg, 'ok', jsonb_build_object('solicitud_id', s.id));
  select * into s from public.solicitudes where id = s.id;
  return public.sol_vista_cliente(s, a);
end $$;
revoke all on function public.solicitud_acceso_mensaje(text, text) from public;
grant execute on function public.solicitud_acceso_mensaje(text, text) to anon, authenticated;

create or replace function public.solicitud_acceso_registrar_documento(p_token text, p_path text, p_name text, p_mime text, p_size bigint, p_requisito uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.solicitud_accesos := public.sol_acceso_valido(p_token); s public.solicitudes; v_id uuid;
begin
  select * into s from public.solicitudes where id = a.solicitud_id;
  if s.status = 'closed' then raise exception 'La solicitud está cerrada' using errcode = '22023', detail = 'request_closed'; end if;
  perform public.sol_validar_archivo(p_name, p_mime, p_size);
  if p_path not like 'sol/' || a.id || '/%' or p_path like '%/../%' then raise exception 'Ruta no válida' using errcode = '22023', detail = 'invalid_path'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'intake-files' and o.name = p_path) then raise exception 'Archivo no encontrado' using errcode = '22023', detail = 'file_not_found'; end if;
  if p_requisito is not null and not exists (select 1 from public.solicitud_requisitos q where q.id = p_requisito and q.solicitud_id = s.id) then
    raise exception 'Requisito no válido' using errcode = '22023', detail = 'invalid_requisito';
  end if;
  insert into public.solicitud_documentos (solicitud_id, empresa_id, uploaded_by_kind, original_name, storage_path, mime_type, size_bytes, requisito_id)
  values (s.id, s.empresa_id, 'cliente', left(p_name, 255), p_path, lower(p_mime), p_size, p_requisito) returning id into v_id;
  if p_requisito is not null then update public.solicitud_requisitos set status = 'received' where id = p_requisito and status = 'pending'; end if;
  update public.solicitudes set last_activity_at = now() where id = s.id;
  if s.status in ('submitted', 'under_review', 'missing_information', 'ready_for_scope') then perform public.sol_analizar(s.id, 'cliente'); end if;
  perform public.sol_notificar(s.empresa_id, 'empresa', null, s.id, 'solicitud.client_document', public.srv_text(public.srv_lang(s.empresa_id), 'notif.client_document.title', jsonb_build_object('title', s.title)), left(p_name, 200), '/empresa/solicitudes/' || s.id, 'doc:' || v_id);
  perform public.audit_log_internal(s.empresa_id, null, 'solicitud.document.added', 'solicitud_documentos', v_id, 'ok', jsonb_build_object('by', 'cliente', 'size', p_size, 'solicitud_id', s.id));
  select * into s from public.solicitudes where id = s.id;
  return public.sol_vista_cliente(s, a);
end $$;
revoke all on function public.solicitud_acceso_registrar_documento(text, text, text, text, bigint, uuid) from public;
grant execute on function public.solicitud_acceso_registrar_documento(text, text, text, text, bigint, uuid) to anon, authenticated;

create or replace function public.solicitud_acceso_documento(p_token text, p_documento uuid, p_rate_key text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.solicitud_accesos; d public.solicitud_documentos;
begin
  if not public.sol_rate_limit('dl:ip:' || coalesce(p_rate_key, 'none'), 60, interval '5 minutes') then
    raise exception 'Demasiadas solicitudes. Inténtalo en unos minutos.' using errcode = '53400', detail = 'rate_limited';
  end if;
  a := public.sol_acceso_valido(p_token);
  if not public.sol_rate_limit('dl:acc:' || a.id::text, 30, interval '5 minutes') then
    raise exception 'Demasiadas solicitudes. Inténtalo en unos minutos.' using errcode = '53400', detail = 'rate_limited';
  end if;
  select * into d from public.solicitud_documentos
   where id = p_documento and solicitud_id = a.solicitud_id and empresa_id = a.empresa_id
     and deleted_at is null and visible_to_client;
  if not found then raise exception 'Enlace no válido' using errcode = '42501', detail = 'invalid_link'; end if;
  perform public.audit_log_internal(d.empresa_id, null, 'solicitud.client_download', 'solicitud_documentos', d.id, 'ok',
                                    jsonb_build_object('solicitud_id', d.solicitud_id, 'access_id', a.id));
  return jsonb_build_object('storage_path', d.storage_path, 'original_name', d.original_name, 'mime_type', d.mime_type, 'size_bytes', d.size_bytes);
end $$;
revoke all on function public.solicitud_acceso_documento(text, uuid, text) from public, anon, authenticated;
grant execute on function public.solicitud_acceso_documento(text, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 3) Formulario público heredado (0011): códigos estables y textos persistidos en el idioma de la empresa
-- ---------------------------------------------------------------------------

create or replace function public.submit_intake_form(p_token uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ci public.client_intake; v_cliente uuid; v_files jsonb; v_data jsonb; v_lang text;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    return jsonb_build_object('ok', false, 'code', 'invalid_data', 'error', 'Datos no válidos');
  end if;
  if pg_column_size(p_data) > 200000 then
    return jsonb_build_object('ok', false, 'code', 'payload_too_large', 'error', 'Los datos enviados son demasiado grandes');
  end if;

  select * into v_ci from public.client_intake where token = p_token;
  if not found then return jsonb_build_object('ok', false, 'code', 'invalid_form', 'error', 'Formulario no válido'); end if;
  if v_ci.status = 'completado' then return jsonb_build_object('ok', false, 'code', 'already_completed', 'error', 'Este formulario ya fue completado'); end if;
  if v_ci.expires_at is not null and v_ci.expires_at < now() then
    return jsonb_build_object('ok', false, 'code', 'link_expired', 'error', 'Este enlace ha caducado. Solicita uno nuevo.');
  end if;

  -- Adjuntos: solo se conservan rutas del bucket privado bajo el prefijo del propio token
  select coalesce(jsonb_agg(jsonb_build_object('name', left(f->>'name', 200), 'path', f->>'path')), '[]'::jsonb)
    into v_files
  from jsonb_array_elements(case when jsonb_typeof(p_data->'files') = 'array' then p_data->'files' else '[]'::jsonb end) f
  where (f->>'path') like (p_token::text || '/%') and (f->>'path') !~ '\.\.';
  v_data := (p_data - 'files') || jsonb_build_object('files', v_files);
  v_lang := public.srv_lang(v_ci.empresa_id);

  insert into public.clientes (empresa_id, name, email, phone, is_test)
  values (v_ci.empresa_id, left(coalesce(nullif(v_data->>'name',''), public.srv_text(v_lang, 'intake.defaultClient')), 200), left(nullif(v_data->>'email',''), 200), left(nullif(v_data->>'phone',''), 40), v_ci.is_test)
  returning id into v_cliente;

  update public.client_intake
     set status='completado', submitted=v_data, cliente_id=v_cliente, completed_at=now()
   where id = v_ci.id;

  insert into public.tasks (empresa_id, type, title, detail, priority, related_id, is_test)
  values (
    v_ci.empresa_id, 'nuevo_cliente',
    left(case when v_ci.is_test then public.srv_text(v_lang, 'intake.testPrefix') else '' end || public.srv_text(v_lang, 'intake.taskTitle', jsonb_build_object('name', coalesce(nullif(v_data->>'name',''), public.srv_text(v_lang, 'intake.defaultClient')))), 200),
    left(coalesce(nullif(v_data->>'description',''), public.srv_text(v_lang, 'intake.taskDetail')), 2000),
    1, v_cliente, v_ci.is_test
  );
  perform public.audit_log_internal(v_ci.empresa_id, null, 'intake.submitted', 'client_intake', v_ci.id, 'ok',
    jsonb_build_object('channel', v_ci.channel, 'is_test', v_ci.is_test, 'files', jsonb_array_length(v_files)));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.submit_intake_form(uuid, jsonb) from public;
grant execute on function public.submit_intake_form(uuid, jsonb) to anon, authenticated;
revoke all on function public.submit_intake_form(uuid, jsonb) from public;
grant execute on function public.submit_intake_form(uuid, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) Verificación de email (0009/0011): códigos estables (mensajes intactos)
-- ---------------------------------------------------------------------------

create or replace function public.verify_email_otp(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_empresa uuid; v_otp public.email_otps;
begin
  select empresa_id into v_empresa from public.profiles where id = auth.uid();
  if v_empresa is null then return jsonb_build_object('ok', false, 'code', 'no_company', 'error', 'Cuenta sin empresa'); end if;

  select * into v_otp from public.email_otps where empresa_id = v_empresa;
  if not found then return jsonb_build_object('ok', false, 'code', 'otp_missing', 'error', 'No hay código pendiente. Reenvíalo.'); end if;
  if v_otp.expires_at < now() then return jsonb_build_object('ok', false, 'code', 'otp_expired', 'error', 'El código ha caducado. Reenvíalo.'); end if;
  if v_otp.attempts >= 5 then return jsonb_build_object('ok', false, 'code', 'otp_too_many_attempts', 'error', 'Demasiados intentos. Reenvía un código nuevo.'); end if;

  if v_otp.code <> p_code then
    update public.email_otps set attempts = attempts + 1 where empresa_id = v_empresa;
    perform public.audit_log_internal(v_empresa, auth.uid(), 'email.otp_failed', 'empresas', v_empresa, 'error', '{}'::jsonb);
    return jsonb_build_object('ok', false, 'code', 'otp_incorrect', 'error', 'Código incorrecto.');
  end if;

    update public.empresas set email_verified = true where id = v_empresa;
  delete from public.email_otps where empresa_id = v_empresa;
  perform public.audit_log_internal(v_empresa, auth.uid(), 'email.verified', 'empresas', v_empresa, 'ok', jsonb_build_object('mode', 'otp'));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.verify_email_otp(text) from public, anon;
grant execute on function public.verify_email_otp(text) to authenticated;

create or replace function public.claim_native_email_verification()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_empresa uuid := public.current_empresa_id(); v_mode text; v_confirmed timestamptz;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  select coalesce(value #>> '{}', 'otp') into v_mode from public.platform_settings where key = 'email_verification_mode';
  if coalesce(v_mode, 'otp') <> 'native' then
    return jsonb_build_object('ok', false, 'code', 'otp_mode', 'error', 'La plataforma usa verificación por código.');
  end if;
  if v_empresa is null then return jsonb_build_object('ok', false, 'code', 'no_company', 'error', 'Cuenta sin empresa'); end if;
  select email_confirmed_at into v_confirmed from auth.users where id = auth.uid();
  if v_confirmed is null then return jsonb_build_object('ok', false, 'code', 'email_not_confirmed', 'error', 'El email aún no está confirmado.'); end if;
    update public.empresas set email_verified = true where id = v_empresa and email_verified = false;
  perform public.audit_log_internal(v_empresa, auth.uid(), 'email.verified', 'empresas', v_empresa, 'ok', jsonb_build_object('mode', 'native'));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.claim_native_email_verification() from public, anon;
grant execute on function public.claim_native_email_verification() to authenticated;

-- ---------------------------------------------------------------------------
-- Comprobaciones
-- ---------------------------------------------------------------------------
do $$
begin
  if public.srv_text('en', 'notif.submitted.title', '{"title":"X"}'::jsonb) <> 'Form received: X' then raise exception '0016: catálogo en'; end if;
  if public.srv_text('xx', 'notif.submitted.title', '{"title":"X"}'::jsonb) <> 'Formulario recibido: X' then raise exception '0016: fallback es'; end if;
  if public.srv_lang(gen_random_uuid()) <> 'es' then raise exception '0016: srv_lang fallback'; end if;
  if has_function_privilege('anon', 'public.srv_text(text, text, jsonb)', 'execute') then raise exception '0016: srv_text no debe ser ejecutable por anon'; end if;
  if has_function_privilege('anon', 'public.solicitud_acceso_documento(text, uuid, text)', 'execute') then raise exception '0016: descarga solo service_role'; end if;
  if not has_function_privilege('anon', 'public.solicitud_acceso_obtener(text)', 'execute') then raise exception '0016: acceso por token debe seguir disponible'; end if;
  if has_function_privilege('anon', 'public.verify_email_otp(text)', 'execute') then raise exception '0016: verify_email_otp no debe ser ejecutable por anon'; end if;
end $$;
