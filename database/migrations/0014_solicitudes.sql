-- Feblio · 0014 · Solicitudes: contacto → formulario seguro → recepción → análisis de suficiencia →
-- información pendiente → conversación y notificaciones internas.
--
-- Idempotente (if not exists / or replace) y compatible con Supabase alojado (sin GUC personalizados).
-- Aplicar DESPUÉS de 0013. No modifica correos, roles, IDs ni relaciones existentes.
--
-- Auditoría de estructuras existentes (se reutilizan, no se duplican):
--   · clientes                → contacto/cliente de la solicitud (cliente_id, opcional)
--   · intake_form_templates   → preguntas y documentos obligatorios del formulario (form_template_id)
--   · audit_events            → cronología/eventos (audit_log_internal)
--   · bucket intake-files     → archivos (privado; nuevos prefijos sol/{acceso}/ y emp/{empresa}/)
--   · client_intake           → formulario público heredado por plantilla (token en claro); se mantiene
--                               intacto para no romper el flujo actual. Las solicitudes nuevas usan
--                               solicitud_accesos con hash del token, caducidad y revocación.
--
-- Tablas nuevas: solicitudes, solicitud_accesos, solicitud_mensajes, solicitud_documentos,
-- solicitud_requisitos, solicitud_analisis, notificaciones y rate_limits (contador para la
-- descarga por token; ver solicitud_acceso_documento, solo service_role vía Edge Function).
--
-- Rollback lógico: drop de las funciones solicitud_* / notificaciones_* / sol_* y de las 7 tablas
-- (en orden inverso de dependencias); las políticas de storage sol_*/emp_* se eliminan con
-- drop policy. No afecta a tablas existentes.

-- ===========================================================================
-- 1) Tablas
-- ===========================================================================
create table if not exists public.solicitudes (
  id                 uuid primary key default gen_random_uuid(),
  empresa_id         uuid not null references public.empresas(id) on delete cascade,
  cliente_id         uuid references public.clientes(id) on delete set null,
  contact_name       text not null,
  contact_email      text,
  contact_phone      text,
  source_channel     text not null default 'otro' check (source_channel in ('llamada', 'email', 'sms', 'whatsapp', 'portal', 'otro')),
  title              text not null,
  service_type       text,
  description        text,
  deadline           date,
  status             text not null default 'draft'
                     check (status in ('draft', 'awaiting_client', 'submitted', 'under_review', 'missing_information', 'ready_for_scope', 'closed')),
  closed_reason      text,
  form_template_id   uuid references public.intake_form_templates(id) on delete set null,
  form_data          jsonb not null default '{}'::jsonb,
  form_submitted_at  timestamptz,
  completeness       int not null default 0 check (completeness between 0 and 100),
  last_activity_at   timestamptz not null default now(),
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  is_test            boolean not null default false
);
create index if not exists solicitudes_empresa_idx on public.solicitudes (empresa_id, last_activity_at desc);
create index if not exists solicitudes_cliente_idx on public.solicitudes (cliente_id);

create table if not exists public.solicitud_accesos (
  id            uuid primary key default gen_random_uuid(),
  solicitud_id  uuid not null references public.solicitudes(id) on delete cascade,
  empresa_id    uuid not null references public.empresas(id) on delete cascade,
  token_hash    text not null unique,            -- sha256 hex del token; el token nunca se guarda
  expires_at    timestamptz not null,
  revoked_at    timestamptz,
  last_used_at  timestamptz,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists solicitud_accesos_solicitud_idx on public.solicitud_accesos (solicitud_id);

create table if not exists public.solicitud_mensajes (
  id                   uuid primary key default gen_random_uuid(),
  solicitud_id         uuid not null references public.solicitudes(id) on delete cascade,
  empresa_id           uuid not null references public.empresas(id) on delete cascade,
  author_kind          text not null check (author_kind in ('empresa', 'cliente', 'sistema')),
  author_user_id       uuid references auth.users(id) on delete set null,
  author_name          text not null,
  kind                 text not null default 'message' check (kind in ('message', 'info_request', 'system')),
  body                 text not null,
  requisito_ids        uuid[] not null default '{}',
  read_by_empresa_at   timestamptz,
  read_by_cliente_at   timestamptz,
  created_at           timestamptz not null default now()
);
create index if not exists solicitud_mensajes_solicitud_idx on public.solicitud_mensajes (solicitud_id, created_at);

create table if not exists public.solicitud_documentos (
  id                   uuid primary key default gen_random_uuid(),
  solicitud_id         uuid not null references public.solicitudes(id) on delete cascade,
  empresa_id           uuid not null references public.empresas(id) on delete cascade,
  uploaded_by_kind     text not null check (uploaded_by_kind in ('empresa', 'cliente')),
  uploaded_by_user_id  uuid references auth.users(id) on delete set null,
  original_name        text not null,
  storage_path         text not null unique,      -- nombre físico aleatorio; el original solo como metadato
  mime_type            text not null,
  size_bytes           bigint not null check (size_bytes > 0),
  requisito_id         uuid,
  created_at           timestamptz not null default now()
);
create index if not exists solicitud_documentos_solicitud_idx on public.solicitud_documentos (solicitud_id, created_at);

create table if not exists public.solicitud_requisitos (
  id            uuid primary key default gen_random_uuid(),
  solicitud_id  uuid not null references public.solicitudes(id) on delete cascade,
  empresa_id    uuid not null references public.empresas(id) on delete cascade,
  kind          text not null check (kind in ('field', 'document')),
  key           text not null,
  label         text not null,
  required      boolean not null default true,
  status        text not null default 'pending' check (status in ('pending', 'received', 'resolved', 'waived')),
  requested_at  timestamptz not null default now(),
  resolved_at   timestamptz,
  resolved_by   uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (solicitud_id, key)
);

create table if not exists public.solicitud_analisis (
  id                 uuid primary key default gen_random_uuid(),
  solicitud_id       uuid not null references public.solicitudes(id) on delete cascade,
  empresa_id         uuid not null references public.empresas(id) on delete cascade,
  version            int not null,
  provider           text not null default 'rules',   -- 'rules' = comprobación determinista; futuros: 'ai:<modelo>'
  completeness       int not null check (completeness between 0 and 100),
  received           jsonb not null default '[]'::jsonb,
  missing            jsonb not null default '[]'::jsonb,
  missing_documents  jsonb not null default '[]'::jsonb,
  summary            text,
  triggered_by       text not null default 'system',  -- system | empresa | cliente
  created_at         timestamptz not null default now(),
  unique (solicitud_id, version)
);

create table if not exists public.notificaciones (
  id                    uuid primary key default gen_random_uuid(),
  empresa_id            uuid not null references public.empresas(id) on delete cascade,
  recipient_kind        text not null check (recipient_kind in ('empresa', 'cliente')),
  recipient_cliente_id  uuid references public.clientes(id) on delete cascade,
  solicitud_id          uuid references public.solicitudes(id) on delete cascade,
  type                  text not null,
  title                 text not null,
  body                  text,
  link_path             text,
  dedupe_key            text not null unique,     -- evita duplicados por reintentos
  read_at               timestamptz,
  created_at            timestamptz not null default now()
);
create index if not exists notificaciones_empresa_idx on public.notificaciones (empresa_id, recipient_kind, created_at desc);
create index if not exists notificaciones_cliente_idx on public.notificaciones (recipient_cliente_id, created_at desc);

-- Visibilidad para el cliente y borrado lógico (idempotente; documentos previos: visibles y activos)
alter table public.solicitud_documentos add column if not exists visible_to_client boolean not null default true;
alter table public.solicitud_documentos add column if not exists deleted_at timestamptz;

-- Limitación de frecuencia para accesos públicos (descargas por token): contador por clave y ventana.
-- Sin grants a usuarios: solo la usan funciones security definer.
create table if not exists public.rate_limits (
  key          text primary key,
  window_start timestamptz not null default now(),
  hits         integer not null default 0
);
alter table public.rate_limits enable row level security;
revoke all on table public.rate_limits from public, anon, authenticated;

-- FK diferida de documentos → requisitos (ambas tablas ya existen)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'solicitud_documentos_requisito_fkey') then
    alter table public.solicitud_documentos
      add constraint solicitud_documentos_requisito_fkey foreign key (requisito_id) references public.solicitud_requisitos(id) on delete set null;
  end if;
end $$;

-- updated_at
drop trigger if exists solicitudes_set_updated_at on public.solicitudes;
create trigger solicitudes_set_updated_at before update on public.solicitudes
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- 2) RLS: empresa (su tenant), cliente autenticado (sus solicitudes), admin (lectura). anon: nada.
--    Todas las escrituras van por RPC; el cliente anónimo solo accede por token vía RPC.
-- ===========================================================================
alter table public.solicitudes           enable row level security;
alter table public.solicitud_accesos     enable row level security;
alter table public.solicitud_mensajes    enable row level security;
alter table public.solicitud_documentos  enable row level security;
alter table public.solicitud_requisitos  enable row level security;
alter table public.solicitud_analisis    enable row level security;
alter table public.notificaciones        enable row level security;

create or replace function public.sol_cliente_ve(p_solicitud uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_role_name() = 'cliente'
     and exists (select 1 from public.solicitudes s where s.id = p_solicitud and s.cliente_id is not null and s.cliente_id = public.current_cliente_id());
$$;
revoke all on function public.sol_cliente_ve(uuid) from public, anon;
grant execute on function public.sol_cliente_ve(uuid) to authenticated;

drop policy if exists solicitudes_select on public.solicitudes;
create policy solicitudes_select on public.solicitudes for select to authenticated
  using (public.is_admin()
         or (public.current_role_name() = 'empresa' and empresa_id = public.current_empresa_id())
         or (public.current_role_name() = 'cliente' and cliente_id is not null and cliente_id = public.current_cliente_id()));

drop policy if exists solicitud_accesos_select on public.solicitud_accesos;
create policy solicitud_accesos_select on public.solicitud_accesos for select to authenticated
  using (public.is_admin() or (public.current_role_name() = 'empresa' and empresa_id = public.current_empresa_id()));

drop policy if exists solicitud_mensajes_select on public.solicitud_mensajes;
create policy solicitud_mensajes_select on public.solicitud_mensajes for select to authenticated
  using (public.is_admin()
         or (public.current_role_name() = 'empresa' and empresa_id = public.current_empresa_id())
         or public.sol_cliente_ve(solicitud_id));

drop policy if exists solicitud_documentos_select on public.solicitud_documentos;
create policy solicitud_documentos_select on public.solicitud_documentos for select to authenticated
  using (public.is_admin()
         or (public.current_role_name() = 'empresa' and empresa_id = public.current_empresa_id())
         or public.sol_cliente_ve(solicitud_id));

drop policy if exists solicitud_requisitos_select on public.solicitud_requisitos;
create policy solicitud_requisitos_select on public.solicitud_requisitos for select to authenticated
  using (public.is_admin()
         or (public.current_role_name() = 'empresa' and empresa_id = public.current_empresa_id())
         or public.sol_cliente_ve(solicitud_id));

drop policy if exists solicitud_analisis_select on public.solicitud_analisis;
create policy solicitud_analisis_select on public.solicitud_analisis for select to authenticated
  using (public.is_admin() or (public.current_role_name() = 'empresa' and empresa_id = public.current_empresa_id()));

drop policy if exists notificaciones_select on public.notificaciones;
create policy notificaciones_select on public.notificaciones for select to authenticated
  using (public.is_admin()
         or (recipient_kind = 'empresa' and public.current_role_name() = 'empresa' and empresa_id = public.current_empresa_id())
         or (recipient_kind = 'cliente' and public.current_role_name() = 'cliente' and recipient_cliente_id is not null and recipient_cliente_id = public.current_cliente_id()));

revoke all on table public.solicitudes, public.solicitud_accesos, public.solicitud_mensajes, public.solicitud_documentos,
              public.solicitud_requisitos, public.solicitud_analisis, public.notificaciones from anon;
grant select on table public.solicitudes, public.solicitud_accesos, public.solicitud_mensajes, public.solicitud_documentos,
                public.solicitud_requisitos, public.solicitud_analisis, public.notificaciones to authenticated;
revoke insert, update, delete on table public.solicitudes, public.solicitud_accesos, public.solicitud_mensajes, public.solicitud_documentos,
                public.solicitud_requisitos, public.solicitud_analisis, public.notificaciones from authenticated;

-- ===========================================================================
-- 3) Helpers internos (no invocables por usuarios)
-- ===========================================================================
-- pgcrypto vive en el esquema extensions en Supabase alojado (y en public en instalaciones locales)
create schema if not exists extensions;
create or replace function public.sol_hash(p_token text)
returns text language sql immutable set search_path = public, extensions as $$
  select encode(digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex');
$$;
revoke all on function public.sol_hash(text) from public, anon, authenticated;

-- Empresa de la sesión, exigiendo rol empresa
create or replace function public.sol_empresa_actual()
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if public.current_role_name() <> 'empresa' then raise exception 'Solo las cuentas de empresa gestionan solicitudes' using errcode = '42501'; end if;
  v := public.current_empresa_id();
  if v is null then raise exception 'Cuenta sin empresa' using errcode = '42501'; end if;
  return v;
end $$;
revoke all on function public.sol_empresa_actual() from public, anon, authenticated;

-- Solicitud de la empresa de la sesión (o error)
create or replace function public.sol_propia(p_solicitud uuid)
returns public.solicitudes language plpgsql stable security definer set search_path = public as $$
declare s public.solicitudes;
begin
  select * into s from public.solicitudes where id = p_solicitud and empresa_id = public.sol_empresa_actual();
  if s.id is null then raise exception 'Solicitud no encontrada' using errcode = 'P0002'; end if;
  return s;
end $$;
revoke all on function public.sol_propia(uuid) from public, anon, authenticated;

-- Acceso por token: devuelve el acceso válido (hash, caducidad, revocación) o error neutro
create or replace function public.sol_acceso_valido(p_token text)
returns public.solicitud_accesos language plpgsql security definer set search_path = public as $$
declare a public.solicitud_accesos;
begin
  if p_token is null or length(p_token) < 32 then raise exception 'Enlace no válido' using errcode = '42501'; end if;
  select * into a from public.solicitud_accesos where token_hash = public.sol_hash(p_token);
  if a.id is null or a.revoked_at is not null or a.expires_at < now() then
    raise exception 'Enlace no válido' using errcode = '42501';
  end if;
  update public.solicitud_accesos set last_used_at = now() where id = a.id;
  return a;
end $$;
revoke all on function public.sol_acceso_valido(text) from public, anon, authenticated;

-- Notificación idempotente (dedupe_key)
create or replace function public.sol_notificar(p_empresa uuid, p_kind text, p_cliente uuid, p_solicitud uuid, p_type text, p_title text, p_body text, p_link text, p_dedupe text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.notificaciones (empresa_id, recipient_kind, recipient_cliente_id, solicitud_id, type, title, body, link_path, dedupe_key)
  values (p_empresa, p_kind, p_cliente, p_solicitud, p_type, left(p_title, 200), left(p_body, 500), p_link, p_dedupe)
  on conflict (dedupe_key) do nothing;
end $$;
revoke all on function public.sol_notificar(uuid, text, uuid, uuid, text, text, text, text, text) from public, anon, authenticated;

-- Análisis determinista de suficiencia (AnalysisProvider 'rules'): campos base + campos y documentos
-- obligatorios de la plantilla + requisitos pendientes. Guarda una versión nueva y actualiza completeness.
create or replace function public.sol_analizar(p_solicitud uuid, p_trigger text)
returns public.solicitud_analisis language plpgsql security definer set search_path = public as $$
declare
  s public.solicitudes; t public.intake_form_templates; r record;
  v_received jsonb := '[]'; v_missing jsonb := '[]'; v_missing_docs jsonb := '[]';
  v_total int := 0; v_ok int := 0; v_val text; v_version int; a public.solicitud_analisis; f jsonb;
begin
  select * into s from public.solicitudes where id = p_solicitud;
  if s.id is null then raise exception 'Solicitud no encontrada' using errcode = 'P0002'; end if;
  if s.form_template_id is not null then select * into t from public.intake_form_templates where id = s.form_template_id; end if;

  -- Campos base del formulario (obligatorios para preparar un alcance)
  for r in select * from (values
      ('contact_name', 'Nombre de contacto'), ('contact_email', 'Correo electrónico'),
      ('needs', 'Qué necesita'), ('objectives', 'Objetivos'), ('scope', 'Alcance'), ('timeline', 'Plazos'))
    as b(key, label) loop
    v_total := v_total + 1;
    v_val := nullif(trim(coalesce(s.form_data->>r.key, case r.key when 'contact_name' then s.contact_name when 'contact_email' then s.contact_email else null end, '')), '');
    if v_val is not null then v_ok := v_ok + 1; v_received := v_received || jsonb_build_object('key', r.key, 'label', r.label);
    else v_missing := v_missing || jsonb_build_object('key', r.key, 'label', r.label); end if;
  end loop;

  -- Campos obligatorios de la plantilla
  if t.id is not null then
    for f in select * from jsonb_array_elements(coalesce(t.fields, '[]'::jsonb)) loop
      if coalesce((f->>'required')::boolean, false) then
        v_total := v_total + 1;
        if nullif(trim(coalesce(s.form_data->>(f->>'key'), '')), '') is not null then
          v_ok := v_ok + 1; v_received := v_received || jsonb_build_object('key', f->>'key', 'label', f->>'label');
        else v_missing := v_missing || jsonb_build_object('key', f->>'key', 'label', f->>'label'); end if;
      end if;
    end loop;
    for f in select * from jsonb_array_elements(coalesce(t.required_documents, '[]'::jsonb)) loop
      if coalesce((f->>'required')::boolean, true) then
        v_total := v_total + 1;
        if exists (select 1 from public.solicitud_documentos d join public.solicitud_requisitos q on q.id = d.requisito_id
                   where d.solicitud_id = s.id and q.key = f->>'key' and d.deleted_at is null)
           or exists (select 1 from public.solicitud_requisitos q where q.solicitud_id = s.id and q.key = f->>'key' and q.status in ('resolved', 'waived', 'received')) then
          v_ok := v_ok + 1; v_received := v_received || jsonb_build_object('key', f->>'key', 'label', f->>'label', 'kind', 'document');
        else v_missing_docs := v_missing_docs || jsonb_build_object('key', f->>'key', 'label', f->>'label'); end if;
      end if;
    end loop;
  end if;

  -- Requisitos solicitados manualmente por la empresa que sigan pendientes
  for r in select * from public.solicitud_requisitos q where q.solicitud_id = s.id and q.required
           and q.key not in (select coalesce(x->>'key', '') from jsonb_array_elements(coalesce(t.fields, '[]'::jsonb)) x)
           and q.key not in (select coalesce(x->>'key', '') from jsonb_array_elements(coalesce(t.required_documents, '[]'::jsonb)) x)
           and q.key not in ('contact_name', 'contact_email', 'needs', 'objectives', 'scope', 'timeline') loop
    v_total := v_total + 1;
    if r.status in ('received', 'resolved', 'waived') then v_ok := v_ok + 1; v_received := v_received || jsonb_build_object('key', r.key, 'label', r.label, 'kind', r.kind);
    elsif r.kind = 'document' then v_missing_docs := v_missing_docs || jsonb_build_object('key', r.key, 'label', r.label);
    else v_missing := v_missing || jsonb_build_object('key', r.key, 'label', r.label); end if;
  end loop;

  select coalesce(max(version), 0) + 1 into v_version from public.solicitud_analisis where solicitud_id = s.id;
  insert into public.solicitud_analisis (solicitud_id, empresa_id, version, provider, completeness, received, missing, missing_documents, summary, triggered_by)
  values (s.id, s.empresa_id, v_version, 'rules',
          case when v_total = 0 then 100 else round(100.0 * v_ok / v_total)::int end,
          v_received, v_missing, v_missing_docs,
          format('%s de %s elementos recibidos', v_ok, v_total), p_trigger)
  returning * into a;
  update public.solicitudes set completeness = a.completeness where id = s.id;
  return a;
end $$;
revoke all on function public.sol_analizar(uuid, text) from public, anon, authenticated;

-- ===========================================================================
-- 4) RPCs de empresa
-- ===========================================================================
create or replace function public.solicitud_crear(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_e uuid := public.sol_empresa_actual(); v_id uuid; v_cli uuid; v_tpl uuid; f jsonb;
begin
  if nullif(trim(coalesce(p->>'contact_name', '')), '') is null then raise exception 'Indica el nombre de contacto' using errcode = '22023'; end if;
  if nullif(trim(coalesce(p->>'title', '')), '') is null then raise exception 'Indica el asunto' using errcode = '22023'; end if;
  if p->>'cliente_id' is not null then
    select id into v_cli from public.clientes where id = (p->>'cliente_id')::uuid and empresa_id = v_e;
    if v_cli is null then raise exception 'Cliente no válido' using errcode = '22023'; end if;
  end if;
  if p->>'form_template_id' is not null then
    select id into v_tpl from public.intake_form_templates where id = (p->>'form_template_id')::uuid and empresa_id = v_e and is_active;
  else
    select id into v_tpl from public.intake_form_templates where empresa_id = v_e and is_active order by is_default desc, created_at limit 1;
  end if;
  insert into public.solicitudes (empresa_id, cliente_id, contact_name, contact_email, contact_phone, source_channel, title, service_type, description, deadline, form_template_id, created_by, form_data, is_test)
  values (v_e, v_cli, left(trim(p->>'contact_name'), 200), nullif(lower(trim(p->>'contact_email')), ''), nullif(trim(p->>'contact_phone'), ''),
          coalesce(nullif(p->>'source_channel', ''), 'otro'), left(trim(p->>'title'), 200), nullif(trim(p->>'service_type'), ''),
          nullif(trim(p->>'description'), ''), nullif(p->>'deadline', '')::date, v_tpl, auth.uid(),
          jsonb_strip_nulls(jsonb_build_object('contact_name', trim(p->>'contact_name'), 'contact_email', nullif(lower(trim(p->>'contact_email')), ''), 'contact_phone', nullif(trim(p->>'contact_phone'), ''))),
          coalesce((p->>'is_test')::boolean, false))
  returning id into v_id;
  -- Requisitos iniciales: documentos obligatorios de la plantilla
  if v_tpl is not null then
    for f in select * from jsonb_array_elements((select required_documents from public.intake_form_templates where id = v_tpl)) loop
      insert into public.solicitud_requisitos (solicitud_id, empresa_id, kind, key, label, required)
      values (v_id, v_e, 'document', f->>'key', coalesce(f->>'label', f->>'key'), coalesce((f->>'required')::boolean, true))
      on conflict (solicitud_id, key) do nothing;
    end loop;
  end if;
  perform public.sol_analizar(v_id, 'system');
  perform public.audit_log_internal(v_e, auth.uid(), 'solicitud.created', 'solicitudes', v_id, 'ok', jsonb_build_object('source_channel', coalesce(p->>'source_channel', 'otro')));
  return v_id;
end $$;
revoke all on function public.solicitud_crear(jsonb) from public, anon;
grant execute on function public.solicitud_crear(jsonb) to authenticated;

-- Genera un enlace nuevo (revoca los anteriores). Devuelve el token UNA sola vez; solo se guarda su hash.
create or replace function public.solicitud_generar_enlace(p_solicitud uuid, p_days int default 30)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare s public.solicitudes := public.sol_propia(p_solicitud); v_token text; v_exp timestamptz; v_id uuid;
begin
  if s.status = 'closed' then raise exception 'La solicitud está cerrada' using errcode = '22023'; end if;
  v_token := translate(encode(gen_random_bytes(32), 'base64'), '+/=', '-_');   -- 43 chars url-safe, 256 bits
  v_exp := now() + make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)));
  update public.solicitud_accesos set revoked_at = now() where solicitud_id = s.id and revoked_at is null;
  insert into public.solicitud_accesos (solicitud_id, empresa_id, token_hash, expires_at, created_by)
  values (s.id, s.empresa_id, public.sol_hash(v_token), v_exp, auth.uid()) returning id into v_id;
  if s.status = 'draft' then update public.solicitudes set status = 'awaiting_client', last_activity_at = now() where id = s.id; end if;
  perform public.audit_log_internal(s.empresa_id, auth.uid(), 'solicitud.link_created', 'solicitudes', s.id, 'ok', jsonb_build_object('expires_at', v_exp, 'access_id', v_id));
  return jsonb_build_object('token', v_token, 'expires_at', v_exp, 'access_id', v_id);
end $$;
revoke all on function public.solicitud_generar_enlace(uuid, int) from public, anon;
grant execute on function public.solicitud_generar_enlace(uuid, int) to authenticated;

create or replace function public.solicitud_revocar_enlaces(p_solicitud uuid)
returns int language plpgsql security definer set search_path = public as $$
declare s public.solicitudes := public.sol_propia(p_solicitud); n int;
begin
  update public.solicitud_accesos set revoked_at = now() where solicitud_id = s.id and revoked_at is null;
  get diagnostics n = row_count;
  perform public.audit_log_internal(s.empresa_id, auth.uid(), 'solicitud.links_revoked', 'solicitudes', s.id, 'ok', jsonb_build_object('count', n));
  return n;
end $$;
revoke all on function public.solicitud_revocar_enlaces(uuid) from public, anon;
grant execute on function public.solicitud_revocar_enlaces(uuid) to authenticated;

-- Transiciones de estado validadas en servidor
create or replace function public.sol_transicion_valida(p_from text, p_to text)
returns boolean language sql immutable as $$
  select (p_from, p_to) in (
    ('draft', 'awaiting_client'), ('draft', 'closed'),
    ('awaiting_client', 'submitted'), ('awaiting_client', 'closed'),
    ('submitted', 'under_review'), ('submitted', 'missing_information'), ('submitted', 'ready_for_scope'), ('submitted', 'closed'),
    ('under_review', 'missing_information'), ('under_review', 'ready_for_scope'), ('under_review', 'closed'),
    ('missing_information', 'under_review'), ('missing_information', 'ready_for_scope'), ('missing_information', 'closed'),
    ('ready_for_scope', 'under_review'), ('ready_for_scope', 'closed'),
    ('closed', 'under_review'));
$$;
revoke all on function public.sol_transicion_valida(text, text) from public, anon, authenticated;

create or replace function public.solicitud_cambiar_estado(p_solicitud uuid, p_estado text, p_motivo text default null)
returns public.solicitudes language plpgsql security definer set search_path = public as $$
declare s public.solicitudes := public.sol_propia(p_solicitud); v_cli uuid; v_title text;
begin
  if not public.sol_transicion_valida(s.status, p_estado) then
    raise exception 'Transición no permitida: % → %', s.status, p_estado using errcode = '22023';
  end if;
  if p_estado = 'closed' and nullif(trim(coalesce(p_motivo, '')), '') is null then
    raise exception 'Indica el motivo de cierre' using errcode = '22023';
  end if;
  if s.status = 'closed' and p_estado <> 'closed' and exists (select 1 from public.documents d where d.type = 'presupuesto' and d.empresa_id = s.empresa_id and d.project_id in (select id from public.projects where cliente_id = s.cliente_id and s.cliente_id is not null)) then
    raise exception 'No se puede reabrir: ya existe un presupuesto' using errcode = '22023';
  end if;
  update public.solicitudes set status = p_estado, closed_reason = case when p_estado = 'closed' then left(p_motivo, 500) else null end, last_activity_at = now()
   where id = s.id returning * into s;
  v_title := case p_estado when 'ready_for_scope' then 'Solicitud lista para preparar alcance' when 'closed' then 'Solicitud cerrada' when 'under_review' then 'Solicitud en revisión' else 'Solicitud actualizada' end;
  if p_estado in ('ready_for_scope', 'closed') or (p_estado = 'under_review' and p_motivo = 'reopen') then
    perform public.sol_notificar(s.empresa_id, 'cliente', s.cliente_id, s.id, 'solicitud.' || p_estado, v_title, s.title, null,
      'sol:' || s.id || ':status:' || p_estado || ':' || to_char(now(), 'YYYYMMDDHH24MI'));
  end if;
  perform public.audit_log_internal(s.empresa_id, auth.uid(), 'solicitud.status.' || p_estado, 'solicitudes', s.id, 'ok', jsonb_build_object('reason', p_motivo));
  return s;
end $$;
revoke all on function public.solicitud_cambiar_estado(uuid, text, text) from public, anon;
grant execute on function public.solicitud_cambiar_estado(uuid, text, text) to authenticated;

-- Solicitar información concreta: crea requisitos + mensaje de petición + notificación al cliente
create or replace function public.solicitud_solicitar_informacion(p_solicitud uuid, p_items jsonb, p_mensaje text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare s public.solicitudes := public.sol_propia(p_solicitud); it jsonb; v_ids uuid[] := '{}'; v_id uuid; v_msg uuid; v_name text; v_body text;
begin
  if s.status not in ('submitted', 'under_review', 'missing_information', 'ready_for_scope') then
    raise exception 'La solicitud no admite peticiones de información en su estado actual' using errcode = '22023';
  end if;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    insert into public.solicitud_requisitos (solicitud_id, empresa_id, kind, key, label, required, status, requested_at)
    values (s.id, s.empresa_id, coalesce(it->>'kind', 'field'), coalesce(nullif(it->>'key', ''), 'req_' || substr(gen_random_uuid()::text, 1, 8)), left(coalesce(it->>'label', it->>'key', 'Información'), 200), true, 'pending', now())
    on conflict (solicitud_id, key) do update set status = 'pending', requested_at = now(), resolved_at = null, label = excluded.label
    returning id into v_id;
    v_ids := v_ids || v_id;
  end loop;
  select coalesce(full_name, email) into v_name from public.profiles where id = auth.uid();
  v_body := coalesce(nullif(trim(p_mensaje), ''), 'Necesitamos algo más de información para continuar.');
  insert into public.solicitud_mensajes (solicitud_id, empresa_id, author_kind, author_user_id, author_name, kind, body, requisito_ids, read_by_empresa_at)
  values (s.id, s.empresa_id, 'empresa', auth.uid(), coalesce(v_name, 'Empresa'), 'info_request', v_body, v_ids, now()) returning id into v_msg;
  if s.status <> 'missing_information' then update public.solicitudes set status = 'missing_information' where id = s.id; end if;
  update public.solicitudes set last_activity_at = now() where id = s.id;
  if array_length(v_ids, 1) > 0 then perform public.sol_analizar(s.id, 'empresa'); end if;  -- la completitud refleja los nuevos pendientes
  perform public.sol_notificar(s.empresa_id, 'cliente', s.cliente_id, s.id, 'solicitud.info_requested', 'Te han pedido información', v_body, null, 'msg:' || v_msg);
  perform public.audit_log_internal(s.empresa_id, auth.uid(), 'solicitud.info_requested', 'solicitudes', s.id, 'ok', jsonb_build_object('items', coalesce(jsonb_array_length(p_items), 0)));
  return v_msg;
end $$;
revoke all on function public.solicitud_solicitar_informacion(uuid, jsonb, text) from public, anon;
grant execute on function public.solicitud_solicitar_informacion(uuid, jsonb, text) to authenticated;

create or replace function public.solicitud_resolver_requisito(p_requisito uuid, p_estado text default 'resolved')
returns void language plpgsql security definer set search_path = public as $$
declare q public.solicitud_requisitos; s public.solicitudes;
begin
  select * into q from public.solicitud_requisitos where id = p_requisito;
  if q.id is null then raise exception 'Requisito no encontrado' using errcode = 'P0002'; end if;
  s := public.sol_propia(q.solicitud_id);
  if p_estado not in ('resolved', 'waived', 'pending') then raise exception 'Estado no válido' using errcode = '22023'; end if;
  update public.solicitud_requisitos set status = p_estado, resolved_at = case when p_estado = 'pending' then null else now() end, resolved_by = auth.uid() where id = q.id;
  perform public.sol_analizar(s.id, 'empresa');
  update public.solicitudes set last_activity_at = now() where id = s.id;
  perform public.audit_log_internal(s.empresa_id, auth.uid(), 'solicitud.requirement.' || p_estado, 'solicitud_requisitos', q.id, 'ok', jsonb_build_object('key', q.key, 'solicitud_id', s.id));
end $$;
revoke all on function public.solicitud_resolver_requisito(uuid, text) from public, anon;
grant execute on function public.solicitud_resolver_requisito(uuid, text) to authenticated;

create or replace function public.solicitud_analizar(p_solicitud uuid)
returns public.solicitud_analisis language plpgsql security definer set search_path = public as $$
declare s public.solicitudes := public.sol_propia(p_solicitud); a public.solicitud_analisis;
begin
  a := public.sol_analizar(s.id, 'empresa');
  perform public.audit_log_internal(s.empresa_id, auth.uid(), 'solicitud.analyzed', 'solicitud_analisis', a.id, 'ok', jsonb_build_object('version', a.version, 'completeness', a.completeness, 'solicitud_id', s.id));
  return a;
end $$;
revoke all on function public.solicitud_analizar(uuid) from public, anon;
grant execute on function public.solicitud_analizar(uuid) to authenticated;

create or replace function public.solicitud_enviar_mensaje(p_solicitud uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare s public.solicitudes := public.sol_propia(p_solicitud); v_msg uuid; v_name text;
begin
  if nullif(trim(coalesce(p_body, '')), '') is null then raise exception 'Escribe un mensaje' using errcode = '22023'; end if;
  select coalesce(full_name, email) into v_name from public.profiles where id = auth.uid();
  insert into public.solicitud_mensajes (solicitud_id, empresa_id, author_kind, author_user_id, author_name, kind, body, read_by_empresa_at)
  values (s.id, s.empresa_id, 'empresa', auth.uid(), coalesce(v_name, 'Empresa'), 'message', left(p_body, 4000), now()) returning id into v_msg;
  update public.solicitudes set last_activity_at = now() where id = s.id;
  perform public.sol_notificar(s.empresa_id, 'cliente', s.cliente_id, s.id, 'solicitud.message', 'Nuevo mensaje sobre tu solicitud', left(p_body, 200), null, 'msg:' || v_msg);
  perform public.audit_log_internal(s.empresa_id, auth.uid(), 'solicitud.message', 'solicitud_mensajes', v_msg, 'ok', jsonb_build_object('solicitud_id', s.id));
  return v_msg;
end $$;
revoke all on function public.solicitud_enviar_mensaje(uuid, text) from public, anon;
grant execute on function public.solicitud_enviar_mensaje(uuid, text) to authenticated;

create or replace function public.solicitud_marcar_leida(p_solicitud uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s public.solicitudes := public.sol_propia(p_solicitud);
begin
  update public.solicitud_mensajes set read_by_empresa_at = now() where solicitud_id = s.id and author_kind <> 'empresa' and read_by_empresa_at is null;
  update public.notificaciones set read_at = now() where solicitud_id = s.id and recipient_kind = 'empresa' and empresa_id = s.empresa_id and read_at is null;
end $$;
revoke all on function public.solicitud_marcar_leida(uuid) from public, anon;
grant execute on function public.solicitud_marcar_leida(uuid) to authenticated;

-- Registro de un archivo subido por la empresa (ruta emp/{empresa}/{solicitud}/{nombre_aleatorio})
create or replace function public.sol_validar_archivo(p_name text, p_mime text, p_size bigint)
returns void language plpgsql immutable as $$
declare ext text := lower(substring(p_name from '\.([A-Za-z0-9]+)$'));
begin
  if p_size is null or p_size <= 0 or p_size > 10485760 then raise exception 'El archivo supera el tamaño máximo (10 MB)' using errcode = '22023'; end if;
  if ext is null or ext not in ('pdf', 'doc', 'docx', 'xls', 'xlsx', 'png', 'jpg', 'jpeg') then raise exception 'Tipo de archivo no permitido' using errcode = '22023'; end if;
  if lower(coalesce(p_mime, '')) not in ('application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
       'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'image/png', 'image/jpeg') then
    raise exception 'Tipo de archivo no permitido' using errcode = '22023';
  end if;
end $$;
revoke all on function public.sol_validar_archivo(text, text, bigint) from public, anon, authenticated;

create or replace function public.solicitud_registrar_documento(p_solicitud uuid, p_path text, p_name text, p_mime text, p_size bigint, p_requisito uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare s public.solicitudes := public.sol_propia(p_solicitud); v_id uuid;
begin
  perform public.sol_validar_archivo(p_name, p_mime, p_size);
  if p_path not like 'emp/' || s.empresa_id || '/' || s.id || '/%' then raise exception 'Ruta no válida' using errcode = '22023'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'intake-files' and o.name = p_path) then raise exception 'Archivo no encontrado' using errcode = '22023'; end if;
  insert into public.solicitud_documentos (solicitud_id, empresa_id, uploaded_by_kind, uploaded_by_user_id, original_name, storage_path, mime_type, size_bytes, requisito_id)
  values (s.id, s.empresa_id, 'empresa', auth.uid(), left(p_name, 255), p_path, lower(p_mime), p_size, p_requisito) returning id into v_id;
  update public.solicitudes set last_activity_at = now() where id = s.id;
  perform public.sol_notificar(s.empresa_id, 'cliente', s.cliente_id, s.id, 'solicitud.document', 'Nuevo archivo en tu solicitud', left(p_name, 200), null, 'doc:' || v_id);
  perform public.audit_log_internal(s.empresa_id, auth.uid(), 'solicitud.document.added', 'solicitud_documentos', v_id, 'ok', jsonb_build_object('by', 'empresa', 'size', p_size, 'solicitud_id', s.id));
  return v_id;
end $$;
revoke all on function public.solicitud_registrar_documento(uuid, text, text, text, bigint, uuid) from public, anon;
grant execute on function public.solicitud_registrar_documento(uuid, text, text, text, bigint, uuid) to authenticated;

-- ===========================================================================
-- 5) RPCs del cliente por token (anon o autenticado). Nunca devuelven identificadores internos innecesarios.
-- ===========================================================================
create or replace function public.sol_vista_cliente(s public.solicitudes, a public.solicitud_accesos)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'access_id', a.id,
    'expires_at', a.expires_at,
    'empresa', (select jsonb_build_object('name', coalesce(e.trade_name, e.name), 'logo_url', e.logo_url) from public.empresas e where e.id = s.empresa_id),
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

create or replace function public.solicitud_acceso_obtener(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.solicitud_accesos := public.sol_acceso_valido(p_token); s public.solicitudes;
begin
  select * into s from public.solicitudes where id = a.solicitud_id;
  return public.sol_vista_cliente(s, a);
end $$;
revoke all on function public.solicitud_acceso_obtener(text) from public;
grant execute on function public.solicitud_acceso_obtener(text) to anon, authenticated;

-- Borrador: solo mientras el cliente aún no ha enviado (draft / awaiting_client)
create or replace function public.solicitud_acceso_guardar(p_token text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.solicitud_accesos := public.sol_acceso_valido(p_token); s public.solicitudes;
begin
  select * into s from public.solicitudes where id = a.solicitud_id;
  if s.status not in ('draft', 'awaiting_client', 'missing_information') then raise exception 'El formulario ya se ha enviado' using errcode = '22023'; end if;
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
declare a public.solicitud_accesos := public.sol_acceso_valido(p_token); s public.solicitudes; an public.solicitud_analisis; v_msg uuid;
begin
  select * into s from public.solicitudes where id = a.solicitud_id;
  if s.status not in ('draft', 'awaiting_client', 'missing_information') then raise exception 'El formulario ya se ha enviado' using errcode = '22023'; end if;
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
  select * into s from public.solicitudes where id = s.id;   -- completeness actualizada
  insert into public.solicitud_mensajes (solicitud_id, empresa_id, author_kind, author_name, kind, body, read_by_cliente_at)
  values (s.id, s.empresa_id, 'sistema', 'Feblio', 'system', 'El cliente ha enviado el formulario (' || an.completeness || '% de la información necesaria).', now()) returning id into v_msg;
  perform public.sol_notificar(s.empresa_id, 'empresa', null, s.id, 'solicitud.submitted', 'Formulario recibido: ' || s.title, s.contact_name || ' ha enviado el formulario (' || an.completeness || '% completo).', '/empresa/solicitudes/' || s.id, 'sol:' || s.id || ':submitted:' || to_char(s.form_submitted_at, 'YYYYMMDDHH24MISS'));
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
  if s.status = 'closed' then raise exception 'La solicitud está cerrada' using errcode = '22023'; end if;
  if nullif(trim(coalesce(p_body, '')), '') is null then raise exception 'Escribe un mensaje' using errcode = '22023'; end if;
  insert into public.solicitud_mensajes (solicitud_id, empresa_id, author_kind, author_name, kind, body, read_by_cliente_at)
  values (s.id, s.empresa_id, 'cliente', s.contact_name, 'message', left(p_body, 4000), now()) returning id into v_msg;
  update public.solicitudes set last_activity_at = now(), status = case when status = 'missing_information' then 'under_review' else status end where id = s.id;
  perform public.sol_notificar(s.empresa_id, 'empresa', null, s.id, 'solicitud.client_reply', 'Respuesta del cliente: ' || s.title, left(p_body, 200), '/empresa/solicitudes/' || s.id, 'msg:' || v_msg);
  perform public.audit_log_internal(s.empresa_id, null, 'solicitud.client_message', 'solicitud_mensajes', v_msg, 'ok', jsonb_build_object('solicitud_id', s.id));
  select * into s from public.solicitudes where id = s.id;
  return public.sol_vista_cliente(s, a);
end $$;
revoke all on function public.solicitud_acceso_mensaje(text, text) from public;
grant execute on function public.solicitud_acceso_mensaje(text, text) to anon, authenticated;

-- Registro de un archivo subido por el cliente (ruta sol/{access_id}/{nombre_aleatorio})
create or replace function public.solicitud_acceso_registrar_documento(p_token text, p_path text, p_name text, p_mime text, p_size bigint, p_requisito uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.solicitud_accesos := public.sol_acceso_valido(p_token); s public.solicitudes; v_id uuid;
begin
  select * into s from public.solicitudes where id = a.solicitud_id;
  if s.status = 'closed' then raise exception 'La solicitud está cerrada' using errcode = '22023'; end if;
  perform public.sol_validar_archivo(p_name, p_mime, p_size);
  if p_path not like 'sol/' || a.id || '/%' or p_path like '%/../%' then raise exception 'Ruta no válida' using errcode = '22023'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'intake-files' and o.name = p_path) then raise exception 'Archivo no encontrado' using errcode = '22023'; end if;
  if p_requisito is not null and not exists (select 1 from public.solicitud_requisitos q where q.id = p_requisito and q.solicitud_id = s.id) then
    raise exception 'Requisito no válido' using errcode = '22023';
  end if;
  insert into public.solicitud_documentos (solicitud_id, empresa_id, uploaded_by_kind, original_name, storage_path, mime_type, size_bytes, requisito_id)
  values (s.id, s.empresa_id, 'cliente', left(p_name, 255), p_path, lower(p_mime), p_size, p_requisito) returning id into v_id;
  if p_requisito is not null then update public.solicitud_requisitos set status = 'received' where id = p_requisito and status = 'pending'; end if;
  update public.solicitudes set last_activity_at = now() where id = s.id;
  if s.status in ('submitted', 'under_review', 'missing_information', 'ready_for_scope') then perform public.sol_analizar(s.id, 'cliente'); end if;
  perform public.sol_notificar(s.empresa_id, 'empresa', null, s.id, 'solicitud.client_document', 'Nuevo archivo del cliente: ' || s.title, left(p_name, 200), '/empresa/solicitudes/' || s.id, 'doc:' || v_id);
  perform public.audit_log_internal(s.empresa_id, null, 'solicitud.document.added', 'solicitud_documentos', v_id, 'ok', jsonb_build_object('by', 'cliente', 'size', p_size, 'solicitud_id', s.id));
  select * into s from public.solicitudes where id = s.id;
  return public.sol_vista_cliente(s, a);
end $$;
revoke all on function public.solicitud_acceso_registrar_documento(text, text, text, text, bigint, uuid) from public;
grant execute on function public.solicitud_acceso_registrar_documento(text, text, text, text, bigint, uuid) to anon, authenticated;

create or replace function public.solicitud_acceso_marcar_leido(p_token text)
returns void language plpgsql security definer set search_path = public as $$
declare a public.solicitud_accesos := public.sol_acceso_valido(p_token);
begin
  update public.solicitud_mensajes set read_by_cliente_at = now() where solicitud_id = a.solicitud_id and author_kind = 'empresa' and read_by_cliente_at is null;
end $$;
revoke all on function public.solicitud_acceso_marcar_leido(text) from public;
grant execute on function public.solicitud_acceso_marcar_leido(text) to anon, authenticated;

-- Comprobación de ruta de subida para las políticas de Storage: el acceso existe, no está revocado ni caducado
create or replace function public.sol_acceso_abierto(p_access_id text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v uuid;
begin
  begin v := p_access_id::uuid; exception when others then return false; end;
  return exists (select 1 from public.solicitud_accesos a join public.solicitudes s on s.id = a.solicitud_id
                 where a.id = v and a.revoked_at is null and a.expires_at > now() and s.status <> 'closed');
end $$;
revoke all on function public.sol_acceso_abierto(text) from public;
grant execute on function public.sol_acceso_abierto(text) to anon, authenticated;

-- ===========================================================================
-- 6) Notificaciones (empresa / cliente autenticado)
-- ===========================================================================
create or replace function public.notificaciones_marcar(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  update public.notificaciones set read_at = now()
   where id = p_id and read_at is null
     and ((recipient_kind = 'empresa' and public.current_role_name() = 'empresa' and empresa_id = public.current_empresa_id())
       or (recipient_kind = 'cliente' and public.current_role_name() = 'cliente' and recipient_cliente_id = public.current_cliente_id()));
end $$;
revoke all on function public.notificaciones_marcar(uuid) from public, anon;
grant execute on function public.notificaciones_marcar(uuid) to authenticated;

create or replace function public.notificaciones_marcar_todas()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  update public.notificaciones set read_at = now()
   where read_at is null
     and ((recipient_kind = 'empresa' and public.current_role_name() = 'empresa' and empresa_id = public.current_empresa_id())
       or (recipient_kind = 'cliente' and public.current_role_name() = 'cliente' and recipient_cliente_id = public.current_cliente_id()));
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.notificaciones_marcar_todas() from public, anon;
grant execute on function public.notificaciones_marcar_todas() to authenticated;

-- Realtime: la campana se suscribe a cambios en notificaciones (RLS aplica). Idempotente.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notificaciones') then
    alter publication supabase_realtime add table public.notificaciones;
  end if;
exception when others then
  raise notice 'Realtime no configurado para notificaciones: %', sqlerrm;
end $$;

-- ===========================================================================
-- 7) Storage: bucket privado intake-files con prefijos sol/{access_id}/ (cliente por token) y emp/{empresa}/{solicitud}/ (empresa)
-- ===========================================================================
drop policy if exists sol_files_insert_by_access on storage.objects;
create policy sol_files_insert_by_access on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'intake-files'
              and (storage.foldername(name))[1] = 'sol'
              and array_length(storage.foldername(name), 1) = 2
              and public.sol_acceso_abierto((storage.foldername(name))[2]));

drop policy if exists emp_files_insert_owner on storage.objects;
create policy emp_files_insert_owner on storage.objects for insert to authenticated
  with check (bucket_id = 'intake-files'
              and (storage.foldername(name))[1] = 'emp'
              and array_length(storage.foldername(name), 1) = 3
              and public.current_role_name() = 'empresa'
              and (storage.foldername(name))[2] = public.current_empresa_id()::text);

-- Lectura (URLs firmadas): empresa dueña, admin o cliente autenticado vinculado a la solicitud
drop policy if exists sol_files_select_owner on storage.objects;
create policy sol_files_select_owner on storage.objects for select to authenticated
  using (bucket_id = 'intake-files'
         and (storage.foldername(name))[1] in ('sol', 'emp')
         and exists (select 1 from public.solicitud_documentos d where d.storage_path = name and d.deleted_at is null
                     and (public.is_admin()
                          or (public.current_role_name() = 'empresa' and d.empresa_id = public.current_empresa_id())
                          or (d.visible_to_client and public.sol_cliente_ve(d.solicitud_id)))));

drop policy if exists sol_files_delete_owner on storage.objects;
create policy sol_files_delete_owner on storage.objects for delete to authenticated
  using (bucket_id = 'intake-files'
         and (storage.foldername(name))[1] in ('sol', 'emp')
         and exists (select 1 from public.solicitud_documentos d where d.storage_path = name
                     and (public.is_admin() or (public.current_role_name() = 'empresa' and d.empresa_id = public.current_empresa_id()))));

-- ---------------------------------------------------------------------------
-- Descarga segura del cliente anónimo (Edge Function `solicitud-descarga`)
-- ---------------------------------------------------------------------------
-- Limita `p_max` accesos por clave en ventanas de `p_window`. Devuelve true si se permite.
create or replace function public.sol_rate_limit(p_key text, p_max integer, p_window interval)
returns boolean language plpgsql security definer set search_path = public as $$
declare r public.rate_limits;
begin
  if p_key is null or p_key = '' then return true; end if;
  insert into public.rate_limits (key, window_start, hits) values (left(p_key, 200), now(), 1)
  on conflict (key) do update
    set hits = case when public.rate_limits.window_start < now() - p_window then 1 else public.rate_limits.hits + 1 end,
        window_start = case when public.rate_limits.window_start < now() - p_window then now() else public.rate_limits.window_start end
  returning * into r;
  -- Limpieza oportunista de claves antiguas (barata: la tabla es pequeña)
  delete from public.rate_limits where window_start < now() - interval '1 day';
  return r.hits <= p_max;
end $$;
revoke all on function public.sol_rate_limit(text, integer, interval) from public, anon, authenticated;

-- Resuelve un documento descargable por el cliente que presenta el token: hash, caducidad y revocación
-- del acceso; el documento debe pertenecer EXACTAMENTE a la solicitud del acceso, estar activo y ser
-- visible para el cliente. Devuelve la ruta física para que el servidor firme la URL (nunca el navegador).
-- Cualquier fallo → 'Enlace no válido' (mensaje único, sin distinguir causa). Solo service_role.
create or replace function public.solicitud_acceso_documento(p_token text, p_documento uuid, p_rate_key text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.solicitud_accesos; d public.solicitud_documentos;
begin
  if not public.sol_rate_limit('dl:ip:' || coalesce(p_rate_key, 'none'), 60, interval '5 minutes') then
    raise exception 'Demasiadas solicitudes. Inténtalo en unos minutos.' using errcode = '53400';
  end if;
  a := public.sol_acceso_valido(p_token);
  if not public.sol_rate_limit('dl:acc:' || a.id::text, 30, interval '5 minutes') then
    raise exception 'Demasiadas solicitudes. Inténtalo en unos minutos.' using errcode = '53400';
  end if;
  select * into d from public.solicitud_documentos
   where id = p_documento and solicitud_id = a.solicitud_id and empresa_id = a.empresa_id
     and deleted_at is null and visible_to_client;
  if not found then raise exception 'Enlace no válido' using errcode = '42501'; end if;
  perform public.audit_log_internal(d.empresa_id, null, 'solicitud.client_download', 'solicitud_documentos', d.id, 'ok',
                                    jsonb_build_object('solicitud_id', d.solicitud_id, 'access_id', a.id));
  return jsonb_build_object('storage_path', d.storage_path, 'original_name', d.original_name, 'mime_type', d.mime_type, 'size_bytes', d.size_bytes);
end $$;
revoke all on function public.solicitud_acceso_documento(text, uuid, text) from public, anon, authenticated;
grant execute on function public.solicitud_acceso_documento(text, uuid, text) to service_role;

-- ===========================================================================
-- Comprobaciones
-- ===========================================================================
do $$
declare n int;
begin
  select count(*) into n from information_schema.tables where table_schema = 'public'
   and table_name in ('solicitudes', 'solicitud_accesos', 'solicitud_mensajes', 'solicitud_documentos', 'solicitud_requisitos', 'solicitud_analisis', 'notificaciones');
  if n <> 7 then raise exception '0014: faltan tablas (%/7)', n; end if;
  if has_table_privilege('anon', 'public.solicitudes', 'select') then raise exception '0014: anon no debe leer solicitudes'; end if;
  if has_function_privilege('anon', 'public.solicitud_crear(jsonb)', 'execute') then raise exception '0014: anon no debe crear solicitudes'; end if;
  if not has_function_privilege('anon', 'public.solicitud_acceso_obtener(text)', 'execute') then raise exception '0014: el acceso por token debe estar disponible'; end if;
end $$;
