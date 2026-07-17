-- Feblio · Migraciones pendientes (0005 + 0006 + 0007) EN ORDEN.
-- Pegar TODO en el SQL Editor de tu proyecto y ejecutar una sola vez.
-- Es seguro: usa if-not-exists / create-or-replace, no borra datos.


-- ============================================================
-- database/migrations/0005_plantillas_datos_empresa.sql
-- ============================================================
-- Feblio · Datos de empresa reutilizables + plantillas + formulario de clientes

-- ---------------------------------------------------------------------------
-- 1) Datos de empresa (se rellenan una vez, se replican en cada documento)
-- ---------------------------------------------------------------------------
alter table public.empresas
  add column if not exists logo_url    text,
  add column if not exists address     text,
  add column if not exists phone       text,
  add column if not exists email       text,
  add column if not exists website     text,
  add column if not exists iban        text,
  add column if not exists disclosures text;   -- textos legales / avisos

-- La empresa puede editar su propia ficha
drop policy if exists empresas_update on public.empresas;
create policy empresas_update on public.empresas for update
  using (public.is_admin() or id = public.current_empresa_id())
  with check (public.is_admin() or id = public.current_empresa_id());

-- ---------------------------------------------------------------------------
-- 2) Plantillas: ya existe public.document_templates (type, name, content jsonb).
--    content guarda campos por tipo: {iva, moneda, validez_dias, condiciones, notas...}
-- ---------------------------------------------------------------------------
alter table public.document_templates
  add column if not exists is_default boolean not null default false;

-- ---------------------------------------------------------------------------
-- 3) Formulario de contacto para clientes (genera enlace público por token)
-- ---------------------------------------------------------------------------
create table if not exists public.client_intake (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references public.empresas(id) on delete cascade,
  token        uuid not null unique default gen_random_uuid(),
  status       text not null default 'pendiente',   -- pendiente | completado
  client_email text,
  submitted    jsonb,
  cliente_id   uuid references public.clientes(id) on delete set null,
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.client_intake enable row level security;

drop policy if exists client_intake_all on public.client_intake;
create policy client_intake_all on public.client_intake for all
  using (
    public.is_admin()
    or (public.current_role_name() = 'empresa' and empresa_id = public.current_empresa_id())
  )
  with check (
    public.is_admin()
    or (public.current_role_name() = 'empresa' and empresa_id = public.current_empresa_id())
  );

-- Acceso público al formulario mediante funciones SECURITY DEFINER (sin exponer tablas)
create or replace function public.get_intake_form(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v record;
begin
  select ci.status, e.name as empresa, e.logo_url
    into v
  from public.client_intake ci
  join public.empresas e on e.id = ci.empresa_id
  where ci.token = p_token;
  if not found then return null; end if;
  return jsonb_build_object('status', v.status, 'empresa', v.empresa, 'logo_url', v.logo_url);
end $$;

create or replace function public.submit_intake_form(p_token uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ci public.client_intake; v_cliente uuid;
begin
  select * into v_ci from public.client_intake where token = p_token;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Formulario no válido');
  end if;
  if v_ci.status = 'completado' then
    return jsonb_build_object('ok', false, 'error', 'Este formulario ya fue completado');
  end if;

  insert into public.clientes (empresa_id, name, email, phone)
  values (
    v_ci.empresa_id,
    coalesce(nullif(p_data->>'name',''), 'Cliente'),
    nullif(p_data->>'email',''),
    nullif(p_data->>'phone','')
  )
  returning id into v_cliente;

  update public.client_intake
     set status = 'completado', submitted = p_data, cliente_id = v_cliente, completed_at = now()
   where id = v_ci.id;

  return jsonb_build_object('ok', true);
end $$;

-- anon puede leer/enviar el formulario público; el resto queda protegido
revoke all on function public.get_intake_form(uuid) from public;
revoke all on function public.submit_intake_form(uuid, jsonb) from public;
grant execute on function public.get_intake_form(uuid) to anon, authenticated;
grant execute on function public.submit_intake_form(uuid, jsonb) to anon, authenticated;

-- ============================================================
-- database/migrations/0006_formulario_adjuntos_tipos.sql
-- ============================================================
-- Feblio · Formulario de clientes: tipos de proyecto (definidos por la empresa),
-- descripción y adjuntos múltiples.

-- 1) Configuración del formulario en la empresa (opciones del desplegable)
alter table public.empresas
  add column if not exists intake_config jsonb not null default '{}'::jsonb;
-- intake_config = { "project_types": ["Reforma integral", "Baño", ...] }

-- 2) get_intake_form ahora devuelve también los tipos de proyecto
create or replace function public.get_intake_form(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v record;
begin
  select ci.status,
         e.name as empresa,
         e.logo_url,
         coalesce(e.intake_config->'project_types', '[]'::jsonb) as project_types
    into v
  from public.client_intake ci
  join public.empresas e on e.id = ci.empresa_id
  where ci.token = p_token;
  if not found then return null; end if;
  return jsonb_build_object(
    'status', v.status,
    'empresa', v.empresa,
    'logo_url', v.logo_url,
    'project_types', v.project_types
  );
end $$;
grant execute on function public.get_intake_form(uuid) to anon, authenticated;

-- 3) Almacenamiento de adjuntos (bucket público con límite de tamaño)
insert into storage.buckets (id, name, public, file_size_limit)
values ('intake-files', 'intake-files', true, 10485760)   -- 10 MB por archivo
on conflict (id) do update set public = true, file_size_limit = 10485760;

-- El formulario es público: se permite subir y leer en este bucket
drop policy if exists intake_files_upload on storage.objects;
create policy intake_files_upload on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'intake-files');

drop policy if exists intake_files_read on storage.objects;
create policy intake_files_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'intake-files');

-- ============================================================
-- database/migrations/0007_tareas_pendientes.sql
-- ============================================================
-- Feblio · Bandeja de tareas/pendientes de la empresa (con creación automática)

create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  type        text not null default 'manual',   -- nuevo_cliente | pago_pendiente | revision | manual
  title       text not null,
  detail      text,
  priority    int  not null default 2,          -- 1 alta · 2 media · 3 baja
  status      text not null default 'pendiente',-- pendiente | resuelto
  related_id  uuid,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.tasks enable row level security;

drop policy if exists tasks_all on public.tasks;
create policy tasks_all on public.tasks for all
  using (public.is_admin() or (public.current_role_name() = 'empresa' and empresa_id = public.current_empresa_id()))
  with check (public.is_admin() or (public.current_role_name() = 'empresa' and empresa_id = public.current_empresa_id()));

-- Al completarse el formulario de un cliente, se crea una tarea automática.
create or replace function public.submit_intake_form(p_token uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ci public.client_intake; v_cliente uuid;
begin
  select * into v_ci from public.client_intake where token = p_token;
  if not found then return jsonb_build_object('ok', false, 'error', 'Formulario no válido'); end if;
  if v_ci.status = 'completado' then return jsonb_build_object('ok', false, 'error', 'Este formulario ya fue completado'); end if;

  insert into public.clientes (empresa_id, name, email, phone)
  values (v_ci.empresa_id, coalesce(nullif(p_data->>'name',''), 'Cliente'), nullif(p_data->>'email',''), nullif(p_data->>'phone',''))
  returning id into v_cliente;

  update public.client_intake
     set status='completado', submitted=p_data, cliente_id=v_cliente, completed_at=now()
   where id = v_ci.id;

  insert into public.tasks (empresa_id, type, title, detail, priority, related_id)
  values (
    v_ci.empresa_id,
    'nuevo_cliente',
    'Nuevo cliente: ' || coalesce(nullif(p_data->>'name',''), 'Cliente'),
    coalesce(nullif(p_data->>'description',''), 'Ha completado el formulario de contacto.'),
    1,
    v_cliente
  );

  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.submit_intake_form(uuid, jsonb) to anon, authenticated;

-- Tareas demo para la empresa Ralm (solo si no tiene tareas)
insert into public.tasks (empresa_id, type, title, detail, priority)
select e.id, x.type, x.title, x.detail, x.priority
from public.empresas e
cross join (values
  ('pago_pendiente', 'Cobro pendiente: Reforma Integral Edificio Central', 'Quedan 29.750 € por cobrar.', 1),
  ('revision',       'Revisar presupuesto de Rehabilitación Fachada Norte', 'El presupuesto sigue en borrador.', 2),
  ('manual',         'Preparar provisión de fondos del próximo proyecto', 'Recordatorio interno.', 3)
) as x(type, title, detail, priority)
where e.name = 'Ralm'
  and not exists (select 1 from public.tasks t where t.empresa_id = e.id);

-- ============================================================
-- Arreglo de acentos del seed antiguo
-- ============================================================
update public.projects set name='Rehabilitación Fachada Norte' where name like 'Rehabilitaci%Fachada Norte';
update public.document_templates set name='Plantilla presupuesto estándar' where type='presupuesto';
update public.document_templates set name='Plantilla provisión de fondos'  where type='provision';
update public.document_templates set name='Plantilla factura estándar'     where type='factura';
