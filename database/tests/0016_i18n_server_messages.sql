-- Feblio · Pruebas de 0016 (mensajes del servidor en el idioma de la empresa + códigos de error). ROLLBACK final.
--   M1 empresa es: mensaje de sistema, notificación y cuerpo en español
--   M2 empresa en: mensaje de sistema, notificación, petición de información y títulos en inglés
--   M3 idioma nulo/inválido en la empresa → español
--   M4 catálogo: interpolación y fallback (srv_text)
--   M5 los mensajes históricos no cambian al cambiar empresas.language
--   M6 aislamiento: el idioma de la empresa B no influye en los mensajes de A
--   M7 códigos estables en excepciones públicas (detail) con el mismo mensaje y errcode
--   M8 submit_intake_form devuelve code y persiste la tarea en el idioma de la empresa
--   M9 verify_email_otp devuelve code; anon sin acceso a srv_text/srv_lang
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
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'anon', true);
  execute 'set local role anon';
end $f$;

do $$
declare
  v_ua uuid := gen_random_uuid(); v_ub uuid := gen_random_uuid(); v_ea uuid; v_eb uuid; v_sol_a uuid; v_sol_b uuid;
  v_tok_a text; v_tok_b text; v_link jsonb; v_msg uuid; v_ci uuid; v_res jsonb; v_ok boolean; v_detail text; v_sqlstate text; v_body text; n int;
begin
  insert into public.empresas (name, cif, email_verified, onboarding_status, language) values ('Empresa ES', 'B55555555', true, 'completed', 'es') returning id into v_ea;
  insert into public.empresas (name, cif, email_verified, onboarding_status, language) values ('Empresa EN', 'B66666666', true, 'completed', 'en') returning id into v_eb;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                          confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  values ('00000000-0000-0000-0000-000000000000', v_ua, 'authenticated', 'authenticated', 'srv-es@example.invalid', '', now(), now(), now(), '{}', '{"role":"cliente","full_name":"Ana ES"}', '', '', '', '', '', '', '', ''),
         ('00000000-0000-0000-0000-000000000000', v_ub, 'authenticated', 'authenticated', 'srv-en@example.invalid', '', now(), now(), now(), '{}', '{"role":"cliente","full_name":"Bea EN"}', '', '', '', '', '', '', '', '');
  update public.profiles set role = 'empresa', empresa_id = v_ea where id = v_ua;
  update public.profiles set role = 'empresa', empresa_id = v_eb where id = v_ub;

  -- M4 catálogo
  insert into pg_temp._t values ('M4a srv_text es con interpolación', public.srv_text('es', 'notif.submitted.body', '{"name":"Ana","percent":88}'::jsonb) = 'Ana ha enviado el formulario (88% completo).');
  insert into pg_temp._t values ('M4b srv_text en con interpolación', public.srv_text('en', 'notif.submitted.body', '{"name":"Ana","percent":88}'::jsonb) = 'Ana has submitted the form (88% complete).');
  insert into pg_temp._t values ('M4c idioma inválido/nulo → español', public.srv_text('fr', 'notif.message.title') = 'Nuevo mensaje sobre tu solicitud' and public.srv_text(null, 'notif.message.title') = 'Nuevo mensaje sobre tu solicitud');
  begin perform public.srv_text('es', 'clave.inexistente'); v_ok := false; exception when others then v_ok := true; end;
  insert into pg_temp._t values ('M4d clave desconocida no devuelve la clave al usuario (error interno)', v_ok);
  insert into pg_temp._t values ('M3a srv_lang: empresa inexistente → es', public.srv_lang(gen_random_uuid()) = 'es');

  -- Solicitudes y enlaces en A (es) y B (en)
  perform pg_temp.as_user(v_ua);
  v_sol_a := public.solicitud_crear(jsonb_build_object('contact_name', 'Ana Pérez', 'title', 'Reforma A', 'source_channel', 'llamada', 'is_test', true));
  v_link := public.solicitud_generar_enlace(v_sol_a, 7); v_tok_a := v_link->>'token';
  reset role;
  perform pg_temp.as_user(v_ub);
  v_sol_b := public.solicitud_crear(jsonb_build_object('contact_name', 'Bea Smith', 'title', 'Renovation B', 'source_channel', 'email', 'is_test', true));
  v_link := public.solicitud_generar_enlace(v_sol_b, 7); v_tok_b := v_link->>'token';
  reset role;

  -- M1 / M2 envío del formulario (anon por token)
  perform pg_temp.as_anon();
  perform public.solicitud_acceso_enviar(v_tok_a, '{"needs":"x"}'::jsonb);
  perform public.solicitud_acceso_enviar(v_tok_b, '{"needs":"x"}'::jsonb);
  reset role;
  select body into v_body from public.solicitud_mensajes where solicitud_id = v_sol_a and author_kind = 'sistema';
  insert into pg_temp._t values ('M1a empresa es: mensaje de sistema en español', v_body like 'El cliente ha enviado el formulario (%');
  insert into pg_temp._t values ('M1b empresa es: notificación en español', exists (select 1 from public.notificaciones where solicitud_id = v_sol_a and type = 'solicitud.submitted' and title = 'Formulario recibido: Reforma A' and body like 'Ana Pérez ha enviado el formulario (%'));
  select body into v_body from public.solicitud_mensajes where solicitud_id = v_sol_b and author_kind = 'sistema';
  insert into pg_temp._t values ('M2a empresa en: mensaje de sistema en inglés', v_body like 'The client has submitted the form (%');
  insert into pg_temp._t values ('M2b empresa en: notificación en inglés con el título de la solicitud intacto', exists (select 1 from public.notificaciones where solicitud_id = v_sol_b and type = 'solicitud.submitted' and title = 'Form received: Renovation B' and body like 'Bea Smith has submitted the form (%'));

  -- M2c petición de información sin mensaje → cuerpo por defecto en inglés y notificación en inglés
  perform pg_temp.as_user(v_ub);
  v_msg := public.solicitud_solicitar_informacion(v_sol_b, '[{"kind":"document","key":"plans","label":"Floor plans"}]'::jsonb, null);
  reset role;
  insert into pg_temp._t values ('M2c empresa en: cuerpo por defecto de la petición en inglés', (select body from public.solicitud_mensajes where id = v_msg) = 'We need a little more information to continue.');
  insert into pg_temp._t values ('M2d empresa en: notificación al cliente en inglés', exists (select 1 from public.notificaciones where solicitud_id = v_sol_b and type = 'solicitud.info_requested' and title = 'Information requested from you'));
  perform pg_temp.as_user(v_ua);
  v_msg := public.solicitud_solicitar_informacion(v_sol_a, '[{"kind":"document","key":"planos","label":"Planos"}]'::jsonb, null);
  perform public.solicitud_cambiar_estado(v_sol_a, 'ready_for_scope');
  reset role;
  insert into pg_temp._t values ('M1c empresa es: cuerpo por defecto en español', (select body from public.solicitud_mensajes where id = v_msg) = 'Necesitamos algo más de información para continuar.');
  insert into pg_temp._t values ('M1d empresa es: notificación de estado en español', exists (select 1 from public.notificaciones where solicitud_id = v_sol_a and type = 'solicitud.ready_for_scope' and title = 'Solicitud lista para preparar alcance'));

  -- M5 histórico intacto al cambiar el idioma de la empresa
  update public.empresas set language = 'en' where id = v_ea;
  select count(*) into n from public.solicitud_mensajes where solicitud_id = v_sol_a and author_kind = 'sistema' and body like 'El cliente ha enviado el formulario (%';
  insert into pg_temp._t values ('M5a cambiar empresas.language no reescribe mensajes históricos', n = 1 and exists (select 1 from public.notificaciones where solicitud_id = v_sol_a and title = 'Formulario recibido: Reforma A'));
  -- y los nuevos mensajes usan el idioma vigente en el momento de crearse
  perform pg_temp.as_user(v_ua);
  perform public.solicitud_enviar_mensaje(v_sol_a, 'Hola');
  reset role;
  insert into pg_temp._t values ('M5b un mensaje nuevo tras el cambio usa el idioma actual (en)', exists (select 1 from public.notificaciones where solicitud_id = v_sol_a and type = 'solicitud.message' and title = 'New message about your request'));
  update public.empresas set language = 'es' where id = v_ea;

  -- M3 idioma inválido en la empresa → español
  update public.empresas set language = 'pt' where id = v_eb;
  perform pg_temp.as_user(v_ub);
  perform public.solicitud_enviar_mensaje(v_sol_b, 'Hello');
  reset role;
  insert into pg_temp._t values ('M3b idioma corporativo no soportado (pt) → español', exists (select 1 from public.notificaciones where solicitud_id = v_sol_b and type = 'solicitud.message' and title = 'Nuevo mensaje sobre tu solicitud'));
  update public.empresas set language = 'en' where id = v_eb;

  -- M6 aislamiento: A (es) no se ve afectada por B (en) y viceversa; B no puede tocar A
  perform pg_temp.as_anon();
  perform public.solicitud_acceso_mensaje(v_tok_a, 'Respuesta A');
  perform public.solicitud_acceso_mensaje(v_tok_b, 'Reply B');
  reset role;
  insert into pg_temp._t values ('M6a notificación de respuesta en el idioma de cada empresa',
    exists (select 1 from public.notificaciones where solicitud_id = v_sol_a and type = 'solicitud.client_reply' and title = 'Respuesta del cliente: Reforma A')
    and exists (select 1 from public.notificaciones where solicitud_id = v_sol_b and type = 'solicitud.client_reply' and title = 'Client reply: Renovation B'));
  perform pg_temp.as_user(v_ub);
  begin perform public.solicitud_enviar_mensaje(v_sol_a, 'intruso'); v_ok := false; exception when others then v_ok := true; end;
  reset role;
  insert into pg_temp._t values ('M6b empresa B sigue sin poder operar sobre la solicitud de A', v_ok and not exists (select 1 from public.solicitud_mensajes where solicitud_id = v_sol_a and body = 'intruso'));

  -- M7 códigos estables en excepciones públicas (mensaje y errcode intactos)
  perform pg_temp.as_anon();
  begin perform public.solicitud_acceso_obtener('x' || substr(v_tok_a, 2)); v_ok := false;
  exception when others then get stacked diagnostics v_detail = pg_exception_detail, v_sqlstate = returned_sqlstate; v_ok := (sqlerrm = 'Enlace no válido' and v_detail = 'invalid_link' and v_sqlstate = '42501'); end;
  insert into pg_temp._t values ('M7a enlace inválido → mensaje, errcode y detail=invalid_link', v_ok);
  begin perform public.solicitud_acceso_enviar(v_tok_a, '{}'::jsonb); v_ok := false;
  exception when others then get stacked diagnostics v_detail = pg_exception_detail; v_ok := (sqlerrm = 'El formulario ya se ha enviado' and v_detail = 'already_submitted'); end;
  insert into pg_temp._t values ('M7b segundo envío → detail=already_submitted', v_ok);
  begin perform public.solicitud_acceso_mensaje(v_tok_a, '   '); v_ok := false;
  exception when others then get stacked diagnostics v_detail = pg_exception_detail; v_ok := (v_detail = 'message_required'); end;
  insert into pg_temp._t values ('M7c mensaje vacío → detail=message_required', v_ok);
  begin perform public.solicitud_acceso_registrar_documento(v_tok_a, 'sol/otro/x.pdf', 'x.exe', 'application/octet-stream', 10, null); v_ok := false;
  exception when others then get stacked diagnostics v_detail = pg_exception_detail; v_ok := (v_detail = 'file_type_not_allowed'); end;
  insert into pg_temp._t values ('M7d archivo no permitido → detail=file_type_not_allowed', v_ok);
  reset role;
  perform pg_temp.as_user(v_ua);
  begin perform public.solicitud_cambiar_estado(v_sol_a, 'closed', null); v_ok := false;
  exception when others then get stacked diagnostics v_detail = pg_exception_detail; v_ok := (v_detail = 'close_reason_required'); end;
  insert into pg_temp._t values ('M7e cierre sin motivo → detail=close_reason_required', v_ok);
  begin perform public.solicitud_cambiar_estado(v_sol_a, 'draft'); v_ok := false;
  exception when others then get stacked diagnostics v_detail = pg_exception_detail; v_ok := (v_detail = 'invalid_transition'); end;
  insert into pg_temp._t values ('M7f transición inválida → detail=invalid_transition', v_ok);
  reset role;
  set local role service_role;
  begin perform public.solicitud_acceso_documento('x' || substr(v_tok_a, 2), gen_random_uuid(), 'ip-t'); v_ok := false;
  exception when others then get stacked diagnostics v_detail = pg_exception_detail; v_ok := (sqlerrm = 'Enlace no válido' and v_detail = 'invalid_link'); end;
  insert into pg_temp._t values ('M7g descarga con token inválido → respuesta neutra + detail=invalid_link', v_ok);
  reset role;

  -- M8 formulario público heredado: códigos y tarea en el idioma de la empresa
  insert into public.client_intake (empresa_id, status) values (v_eb, 'pendiente') returning token into v_ci;
  perform pg_temp.as_anon();
  v_res := public.submit_intake_form(gen_random_uuid(), '{"name":"X"}'::jsonb);
  insert into pg_temp._t values ('M8a formulario inexistente → code=invalid_form con mensaje', (v_res->>'code') = 'invalid_form' and (v_res->>'error') = 'Formulario no válido');
  v_res := public.submit_intake_form(v_ci, '{"name":"John Doe","email":"john@example.invalid"}'::jsonb);
  reset role;
  insert into pg_temp._t values ('M8b envío correcto', (v_res->>'ok') = 'true');
  insert into pg_temp._t values ('M8c tarea persistida en inglés para la empresa en', exists (select 1 from public.tasks where empresa_id = v_eb and title = 'New client: John Doe' and detail = 'They have completed the contact form.'));
  perform pg_temp.as_anon();
  v_res := public.submit_intake_form(v_ci, '{"name":"X"}'::jsonb);
  reset role;
  insert into pg_temp._t values ('M8d formulario ya completado → code=already_completed', (v_res->>'code') = 'already_completed');

  -- M9 OTP y helpers
  perform pg_temp.as_user(v_ua);
  v_res := public.verify_email_otp('000000');
  insert into pg_temp._t values ('M9a verify_email_otp sin código pendiente → code=otp_missing con mensaje', (v_res->>'code') = 'otp_missing' and (v_res->>'error') = 'No hay código pendiente. Reenvíalo.');
  reset role;
  perform pg_temp.as_anon();
  begin perform public.srv_text('en', 'notif.message.title'); v_ok := false; exception when insufficient_privilege then v_ok := true; end;
  insert into pg_temp._t values ('M9b anon no ejecuta srv_text', v_ok);
  begin perform public.srv_lang(v_ea); v_ok := false; exception when insufficient_privilege then v_ok := true; end;
  insert into pg_temp._t values ('M9c anon no ejecuta srv_lang', v_ok);
  reset role;
end $$;

reset role;
select name, case when ok then 'OK' else 'FALLO' end as resultado from pg_temp._t order by name;
do $$
declare failed int;
begin
  select count(*) into failed from pg_temp._t where not ok;
  if failed > 0 then raise exception 'Han fallado % comprobaciones de 0016', failed; end if;
  raise notice 'i18n 0016: todas las comprobaciones han pasado';
end $$;
rollback;
