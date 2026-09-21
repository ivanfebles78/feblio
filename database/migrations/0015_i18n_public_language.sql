-- Feblio · 0015 · Idioma de la empresa en los contextos públicos (formulario público y enlace de solicitud).
--
-- Idempotente (create or replace). Aplicar DESPUÉS de 0014. No crea tablas ni columnas: reutiliza
-- empresas.language (0009). Solo añade el campo `language` ('es' | 'en'; cualquier otro valor → 'es')
-- a las respuestas públicas ya existentes, sin exponer ningún otro dato de la empresa:
--   · get_intake_form(p_token uuid)          → formulario público heredado (client_intake)
--   · sol_vista_cliente(solicitud, acceso)   → vista del cliente por token (0014); sigue sin grants
--                                              a usuarios: solo la llaman las RPC solicitud_acceso_*.
-- Los controles de seguridad de ambas funciones se conservan literalmente (security definer,
-- search_path fijo, mismos filtros por token, mismos grants). Rollback lógico: volver a las
-- definiciones de 0009 / 0014.

-- ---------------------------------------------------------------------------
-- get_intake_form: misma definición de 0009 + 'language'
-- ---------------------------------------------------------------------------
create or replace function public.get_intake_form(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v record;
begin
  select ci.status, ci.expires_at, ci.is_test,
         e.name as empresa, e.logo_url, e.primary_color, e.language,
         coalesce(e.intake_config->'project_types', '[]'::jsonb) as project_types,
         t.name as form_name, t.fields, t.required_documents, t.consents
    into v
  from public.client_intake ci
  join public.empresas e on e.id = ci.empresa_id
  left join public.intake_form_templates t on t.id = ci.form_template_id
  where ci.token = p_token;
  if not found then return null; end if;
  return jsonb_build_object(
    'status', case when v.status = 'pendiente' and v.expires_at is not null and v.expires_at < now() then 'caducado' else v.status end,
    'empresa', v.empresa,
    'logo_url', v.logo_url,
    'primary_color', v.primary_color,
    'language', case when v.language in ('es', 'en') then v.language else 'es' end,
    'project_types', v.project_types,
    'is_test', v.is_test,
    'form', case when v.fields is null then null else jsonb_build_object(
      'name', v.form_name, 'fields', v.fields, 'required_documents', v.required_documents, 'consents', v.consents) end
  );
end $$;

revoke all on function public.get_intake_form(uuid) from public;
grant execute on function public.get_intake_form(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- sol_vista_cliente: misma definición de 0014 + empresa.language
-- ---------------------------------------------------------------------------
create or replace function public.sol_vista_cliente(s public.solicitudes, a public.solicitud_accesos)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'access_id', a.id,
    'expires_at', a.expires_at,
    'empresa', (select jsonb_build_object('name', coalesce(e.trade_name, e.name), 'logo_url', e.logo_url, 'language', case when e.language in ('es', 'en') then e.language else 'es' end)
                from public.empresas e where e.id = s.empresa_id),
    'solicitud', jsonb_build_object('title', s.title, 'service_type', s.service_type, 'description', s.description, 'status', s.status,
                                    'contact_name', s.contact_name, 'contact_email', s.contact_email, 'contact_phone', s.contact_phone,
                                    'form_data', s.form_data, 'form_submitted_at', s.form_submitted_at, 'completeness', s.completeness),
    'template', (select jsonb_build_object('fields', t.fields, 'required_documents', t.required_documents, 'consents', t.consents)
                 from public.intake_form_templates t where t.id = s.form_template_id),
    'requisitos', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'kind', q.kind, 'key', q.key, 'label', q.label, 'status', q.status, 'requested_at', q.requested_at) order by q.requested_at), '[]'::jsonb)
                   from public.solicitud_requisitos q where q.solicitud_id = s.id and q.status in ('pending', 'received')),
    'documentos', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'name', d.original_name, 'size_bytes', d.size_bytes, 'by', d.uploaded_by_kind, 'created_at', d.created_at, 'requisito_id', d.requisito_id) order by d.created_at), '[]'::jsonb)
                   from public.solicitud_documentos d where d.solicitud_id = s.id and d.deleted_at is null and d.visible_to_client),
    'mensajes', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'author_kind', m.author_kind, 'author_name', case when m.author_kind = 'empresa' then m.author_name else m.author_name end, 'kind', m.kind, 'body', m.body, 'created_at', m.created_at, 'read', m.read_by_cliente_at is not null) order by m.created_at), '[]'::jsonb)
                 from public.solicitud_mensajes m where m.solicitud_id = s.id)
  );
$$;
revoke all on function public.sol_vista_cliente(public.solicitudes, public.solicitud_accesos) from public, anon, authenticated;

-- Comprobaciones
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'get_intake_form') then raise exception 'falta get_intake_form'; end if;
  if not exists (select 1 from pg_proc where proname = 'sol_vista_cliente') then raise exception 'falta sol_vista_cliente'; end if;
  if has_function_privilege('anon', 'public.sol_vista_cliente(public.solicitudes, public.solicitud_accesos)', 'execute') then
    raise exception 'sol_vista_cliente no debe ser ejecutable por anon';
  end if;
  if not has_function_privilege('anon', 'public.get_intake_form(uuid)', 'execute') then
    raise exception 'get_intake_form debe seguir siendo ejecutable por anon';
  end if;
end $$;
