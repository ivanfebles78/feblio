-- Feblio · 0011 · Endurecimiento de seguridad tras la auditoría del onboarding
--
-- Idempotente. Aplicar DESPUÉS de 0010. Cambios:
--   A) feblio_trusted(): la marca de confianza solo aplica sin JWT (SQL Editor, GoTrue, seeds)
--      o con service_role; una petición 'anon' de PostgREST nunca es confiable.
--   B) handle_new_user(): el rol 'admin' no puede auto-asignarse desde el signup público
--      (requiere sesión administrativa Y opt-in explícito feblio.allow_admin_signup);
--      'empresa' y 'cliente' se respetan tal cual.
--   C) EXECUTE explícitamente revocado en helpers internos y en verify_email_otp para anon.
--   D) log_audit_event(): solo cuentas empresa/admin; clientes finales no escriben auditoría.
--   E) submit_intake_form(): límite de tamaño y saneado de rutas de adjuntos.
--   F) intake-files pasa a bucket PRIVADO: anon solo sube bajo el prefijo de un token
--      pendiente y válido; lectura solo para la empresa dueña del formulario (o admin);
--      el frontend usa URLs firmadas con caducidad.
--   G) profiles_update_own con WITH CHECK.

-- ===========================================================================
-- A) Marca de confianza
-- ===========================================================================
create or replace function public.feblio_trusted()
returns boolean language sql stable as $$
  select coalesce(current_setting('feblio.trusted', true), '') = 'on'
      or coalesce(auth.role(), '') = 'service_role'
      -- Sin JWT (SQL Editor, migraciones, seeds, triggers de GoTrue). Una petición anónima
      -- de PostgREST lleva role='anon' y NO entra aquí.
      or nullif(auth.role(), '') is null;
$$;
revoke all on function public.feblio_trusted() from public, anon, authenticated;
revoke all on function public.request_ip() from public, anon, authenticated;
revoke all on function public.request_user_agent() from public, anon, authenticated;
revoke all on function public.strip_secret_keys(jsonb) from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.guard_empresa_onboarding_columns() from public, anon, authenticated;
revoke all on function public.guard_profile_identity_columns() from public, anon, authenticated;
revoke all on function public.guard_integration_status() from public, anon, authenticated;

-- ===========================================================================
-- B) Registro: nadie se auto-asigna 'admin' desde el signup público
-- ===========================================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role_raw    text := coalesce(new.raw_user_meta_data->>'role', 'cliente');
  v_role        user_role;
  v_empresa     uuid;
  v_full_name   text := nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), '');
  v_company     text := nullif(trim(coalesce(new.raw_user_meta_data->>'company_name', '')), '');
  v_entity      text := nullif(new.raw_user_meta_data->>'entity_type', '');
  v_tax_type    text := nullif(new.raw_user_meta_data->>'tax_type', '');
  v_terms_ver   text := coalesce(nullif(new.raw_user_meta_data->>'terms_version', ''), 'unknown');
  v_priv_ver    text := coalesce(nullif(new.raw_user_meta_data->>'privacy_version', ''), v_terms_ver);
  v_terms       boolean := coalesce((new.raw_user_meta_data->>'terms_accepted')::boolean, false);
  v_marketing   boolean := coalesce((new.raw_user_meta_data->>'marketing_consent')::boolean, false);
  v_ua          text := left(coalesce(new.raw_user_meta_data->>'user_agent', ''), 512);
  v_admin_blocked boolean := false;
begin
  -- Roles admitidos desde el signup: 'empresa' y 'cliente' pasan tal cual (no se degradan).
  -- 'admin' SOLO se admite cuando se cumplen DOS condiciones independientes:
  --   (a) la sesión no es la de Supabase Auth (supabase_auth_admin/authenticator) ni una de PostgREST, y
  --   (b) el operador lo ha autorizado explícitamente en su sesión SQL:
  --       select set_config('feblio.allow_admin_signup', 'on', false);   -- (seed 0002 lo hace)
  -- Cualquier otro intento se degrada a 'cliente' y queda auditado.
  if v_role_raw = 'admin' then
    if session_user in ('supabase_auth_admin', 'authenticator', 'anon', 'authenticated', 'service_role')
       or coalesce(current_setting('feblio.allow_admin_signup', true), '') <> 'on' then
      v_role_raw := 'cliente';
      v_admin_blocked := true;
    end if;
  end if;
  v_role := case when v_role_raw in ('admin', 'empresa', 'cliente') then v_role_raw::user_role else 'cliente' end;

  if v_entity is null and v_tax_type is not null then
    v_entity := case v_tax_type when 'CIF' then 'company' when 'NIF' then 'self_employed' end;
  end if;
  if v_tax_type is null and v_entity is not null then
    v_tax_type := case v_entity when 'company' then 'CIF' else 'NIF' end;
  end if;
  if v_entity is not null and v_entity not in ('company', 'self_employed') then v_entity := null; end if;
  if v_tax_type is not null and v_tax_type not in ('CIF', 'NIF') then v_tax_type := null; end if;

  if v_role = 'empresa' then
    insert into public.empresas (name, cif, tax_type, entity_type, trial_ends_at, subscription_status, email_verified, onboarding_status)
    values (
      left(coalesce(v_company, v_full_name, new.email), 200),
      nullif(left(upper(regexp_replace(coalesce(new.raw_user_meta_data->>'tax_id', ''), '[\s\-\.]', '', 'g')), 20), ''),
      v_tax_type, v_entity,
      now() + interval '14 days', 'trial', false, 'not_started'
    )
    returning id into v_empresa;
  end if;

  insert into public.profiles (id, email, full_name, role, empresa_id, is_onboarding_owner)
  values (new.id, new.email, left(coalesce(v_full_name, new.email), 200), v_role, v_empresa, v_role = 'empresa')
  on conflict (id) do nothing;

  insert into public.consent_records (user_id, empresa_id, consent_type, version, accepted, user_agent, source)
  values
    (new.id, v_empresa, 'terms_of_service', left(v_terms_ver, 40), v_terms, nullif(v_ua, ''), 'signup'),
    (new.id, v_empresa, 'privacy_policy',   left(v_priv_ver, 40),  v_terms, nullif(v_ua, ''), 'signup'),
    (new.id, v_empresa, 'marketing',        left(v_terms_ver, 40), v_marketing, nullif(v_ua, ''), 'signup');

  if v_admin_blocked then
    perform public.audit_log_internal(null, new.id, 'security.admin_signup_blocked', 'profiles', new.id, 'blocked',
      jsonb_build_object('session_user', session_user::text));
  end if;
  if v_empresa is not null then
    perform public.audit_log_internal(v_empresa, new.id, 'empresa.registered', 'empresas', v_empresa, 'ok',
      jsonb_build_object('entity_type', v_entity, 'tax_type', v_tax_type));
  end if;
  perform public.audit_log_internal(v_empresa, new.id,
    case when v_terms then 'consent.terms_accepted' else 'consent.terms_missing' end,
    'consent_records', null, case when v_terms then 'ok' else 'blocked' end,
    jsonb_build_object('terms_version', v_terms_ver, 'privacy_version', v_priv_ver));
  perform public.audit_log_internal(v_empresa, new.id,
    case when v_marketing then 'consent.marketing_accepted' else 'consent.marketing_rejected' end,
    'consent_records', null, 'ok', jsonb_build_object('version', v_terms_ver));
  return new;
end $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- ===========================================================================
-- C) verify_email_otp: solo authenticated (por defecto Supabase concede EXECUTE a anon)
-- ===========================================================================
revoke all on function public.verify_email_otp(text) from public, anon;
grant execute on function public.verify_email_otp(text) to authenticated;

-- ===========================================================================
-- D) Auditoría: solo cuentas empresa o admin escriben eventos desde el cliente
-- ===========================================================================
create or replace function public.log_audit_event(
  p_action text, p_entity_type text default null, p_entity_id uuid default null,
  p_result text default 'ok', p_metadata jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_empresa uuid := public.current_empresa_id(); v_role user_role := public.current_role_name();
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if v_role is null or v_role not in ('empresa', 'admin') then
    raise exception 'Solo las cuentas de empresa o administración registran auditoría' using errcode = '42501';
  end if;
  if p_action !~ '^[a-z0-9_.]{3,80}$' then raise exception 'Acción no válida'; end if;
  if p_result not in ('ok', 'error', 'blocked') then raise exception 'Resultado no válido'; end if;
  if p_metadata is not null and pg_column_size(p_metadata) > 8192 then raise exception 'Metadatos demasiado grandes'; end if;
  return public.audit_log_internal(v_empresa, auth.uid(), p_action, left(p_entity_type, 60), p_entity_id, p_result, p_metadata);
end $$;
revoke all on function public.log_audit_event(text, text, uuid, text, jsonb) from public, anon;
grant execute on function public.log_audit_event(text, text, uuid, text, jsonb) to authenticated;

-- ===========================================================================
-- E) Formulario público: límite de tamaño y saneado de adjuntos
-- ===========================================================================
create or replace function public.submit_intake_form(p_token uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ci public.client_intake; v_cliente uuid; v_files jsonb; v_data jsonb;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'Datos no válidos');
  end if;
  if pg_column_size(p_data) > 200000 then
    return jsonb_build_object('ok', false, 'error', 'Los datos enviados son demasiado grandes');
  end if;

  select * into v_ci from public.client_intake where token = p_token;
  if not found then return jsonb_build_object('ok', false, 'error', 'Formulario no válido'); end if;
  if v_ci.status = 'completado' then return jsonb_build_object('ok', false, 'error', 'Este formulario ya fue completado'); end if;
  if v_ci.expires_at is not null and v_ci.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'Este enlace ha caducado. Solicita uno nuevo.');
  end if;

  -- Adjuntos: solo se conservan rutas del bucket privado bajo el prefijo del propio token
  select coalesce(jsonb_agg(jsonb_build_object('name', left(f->>'name', 200), 'path', f->>'path')), '[]'::jsonb)
    into v_files
  from jsonb_array_elements(case when jsonb_typeof(p_data->'files') = 'array' then p_data->'files' else '[]'::jsonb end) f
  where (f->>'path') like (p_token::text || '/%') and (f->>'path') !~ '\.\.';
  v_data := (p_data - 'files') || jsonb_build_object('files', v_files);

  insert into public.clientes (empresa_id, name, email, phone, is_test)
  values (v_ci.empresa_id, left(coalesce(nullif(v_data->>'name',''), 'Cliente'), 200), left(nullif(v_data->>'email',''), 200), left(nullif(v_data->>'phone',''), 40), v_ci.is_test)
  returning id into v_cliente;

  update public.client_intake
     set status='completado', submitted=v_data, cliente_id=v_cliente, completed_at=now()
   where id = v_ci.id;

  insert into public.tasks (empresa_id, type, title, detail, priority, related_id, is_test)
  values (
    v_ci.empresa_id, 'nuevo_cliente',
    left(case when v_ci.is_test then '[PRUEBA] ' else '' end || 'Nuevo cliente: ' || coalesce(nullif(v_data->>'name',''), 'Cliente'), 200),
    left(coalesce(nullif(v_data->>'description',''), 'Ha completado el formulario de contacto.'), 2000),
    1, v_cliente, v_ci.is_test
  );
  perform public.audit_log_internal(v_ci.empresa_id, null, 'intake.submitted', 'client_intake', v_ci.id, 'ok',
    jsonb_build_object('channel', v_ci.channel, 'is_test', v_ci.is_test, 'files', jsonb_array_length(v_files)));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.submit_intake_form(uuid, jsonb) from public;
grant execute on function public.submit_intake_form(uuid, jsonb) to anon, authenticated;
revoke all on function public.get_intake_form(uuid) from public;
grant execute on function public.get_intake_form(uuid) to anon, authenticated;

-- ===========================================================================
-- F) intake-files: bucket privado con acceso por token (subida) y por empresa (lectura)
-- ===========================================================================
update storage.buckets set public = false, file_size_limit = 10485760 where id = 'intake-files';

drop policy if exists intake_files_upload on storage.objects;
drop policy if exists intake_files_read on storage.objects;
drop policy if exists intake_files_insert_by_token on storage.objects;
drop policy if exists intake_files_select_owner on storage.objects;
drop policy if exists intake_files_delete_owner on storage.objects;

-- ¿Existe un formulario pendiente y no caducado con este token? (evita exponer client_intake)
create or replace function public.intake_token_is_open(p_prefix text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v uuid;
begin
  begin
    v := p_prefix::uuid;
  exception when others then
    return false;
  end;
  return exists (
    select 1 from public.client_intake ci
     where ci.token = v and ci.status = 'pendiente' and (ci.expires_at is null or ci.expires_at > now())
  );
end $$;
revoke all on function public.intake_token_is_open(text) from public;
grant execute on function public.intake_token_is_open(text) to anon, authenticated;

-- Empresa dueña del formulario al que pertenece la ruta
create or replace function public.intake_prefix_empresa(p_prefix text)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v uuid;
begin
  begin
    v := p_prefix::uuid;
  exception when others then
    return null;
  end;
  return (select empresa_id from public.client_intake where token = v);
end $$;
revoke all on function public.intake_prefix_empresa(text) from public;
grant execute on function public.intake_prefix_empresa(text) to authenticated;

-- Subida anónima: solo bajo "{token}/" de un formulario pendiente y válido, sin subcarpetas extra
create policy intake_files_insert_by_token on storage.objects for insert to anon, authenticated
  with check (
    bucket_id = 'intake-files'
    and array_length(storage.foldername(name), 1) = 1
    and public.intake_token_is_open((storage.foldername(name))[1])
  );

-- Lectura: solo la empresa dueña del formulario (URLs firmadas) o admin
create policy intake_files_select_owner on storage.objects for select to authenticated
  using (
    bucket_id = 'intake-files'
    and (public.is_admin()
         or (public.current_role_name() = 'empresa'
             and public.intake_prefix_empresa((storage.foldername(name))[1]) = public.current_empresa_id()))
  );

create policy intake_files_delete_owner on storage.objects for delete to authenticated
  using (
    bucket_id = 'intake-files'
    and (public.is_admin()
         or (public.current_role_name() = 'empresa'
             and public.intake_prefix_empresa((storage.foldername(name))[1]) = public.current_empresa_id()))
  );

-- ===========================================================================
-- G) profiles: WITH CHECK explícito
-- ===========================================================================
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());
