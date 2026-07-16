-- Feblio · Setup completo (pegar en Supabase SQL Editor y ejecutar)
-- Esquema + datos demo + hardening + registro CIF/NIF + plantillas, en orden.


-- ============================================================
-- database/migrations/0001_init_schema.sql
-- ============================================================
-- Feblio · Esquema inicial multi-tenant
-- Roles: admin (dueño plataforma) · empresa (tenant) · cliente (cliente final)

-- ---------------------------------------------------------------------------
-- Extensiones
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type user_role as enum ('admin', 'empresa', 'cliente');
exception when duplicate_object then null; end $$;

do $$ begin
  create type project_status as enum ('borrador', 'en_progreso', 'completado', 'cancelado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type document_type as enum ('presupuesto', 'provision', 'factura', 'contrato', 'otro');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Empresas (tenants)
-- ---------------------------------------------------------------------------
create table if not exists public.empresas (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  cif         text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Perfiles (1:1 con auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  role        user_role not null default 'cliente',
  empresa_id  uuid references public.empresas(id) on delete set null,
  cliente_id  uuid,  -- FK a clientes (se añade abajo tras crear la tabla)
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Clientes finales (pertenecen a una empresa)
-- ---------------------------------------------------------------------------
create table if not exists public.clientes (
  id                uuid primary key default gen_random_uuid(),
  empresa_id        uuid not null references public.empresas(id) on delete cascade,
  name              text not null,
  email             text,
  phone             text,
  linked_profile_id uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now()
);

alter table public.profiles
  drop constraint if exists profiles_cliente_id_fkey;
alter table public.profiles
  add constraint profiles_cliente_id_fkey
  foreign key (cliente_id) references public.clientes(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Proyectos
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id                uuid primary key default gen_random_uuid(),
  empresa_id        uuid not null references public.empresas(id) on delete cascade,
  cliente_id        uuid references public.clientes(id) on delete set null,
  name              text not null,
  status            project_status not null default 'borrador',
  budget_total      numeric(12,2) not null default 0,
  invoiced          numeric(12,2) not null default 0,
  provision_funds   numeric(12,2) not null default 0,
  pending_payments  numeric(12,2) not null default 0,
  progress          int not null default 0 check (progress between 0 and 100),
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Documentos del proyecto
-- ---------------------------------------------------------------------------
create table if not exists public.documents (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.empresas(id) on delete cascade,
  project_id    uuid references public.projects(id) on delete cascade,
  type          document_type not null default 'otro',
  name          text not null,
  amount        numeric(12,2),
  status        text,
  storage_path  text,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Plantillas de documentos (por empresa)
-- ---------------------------------------------------------------------------
create table if not exists public.document_templates (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  type        document_type not null,
  name        text not null,
  content     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helpers SECURITY DEFINER (evitan recursión de RLS al leer profiles)
-- ---------------------------------------------------------------------------
create or replace function public.current_role_name()
returns user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_empresa_id()
returns uuid language sql stable security definer set search_path = public as $$
  select empresa_id from public.profiles where id = auth.uid();
$$;

create or replace function public.current_cliente_id()
returns uuid language sql stable security definer set search_path = public as $$
  select cliente_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false);
$$;

-- ---------------------------------------------------------------------------
-- Trigger: crear profile automáticamente al registrarse
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'cliente')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.empresas            enable row level security;
alter table public.profiles            enable row level security;
alter table public.clientes            enable row level security;
alter table public.projects            enable row level security;
alter table public.documents           enable row level security;
alter table public.document_templates  enable row level security;

-- profiles: cada uno ve su perfil; admin ve todos
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select
  using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update
  using (id = auth.uid() or public.is_admin());

-- empresas: admin todo; empresa/cliente ven su empresa
drop policy if exists empresas_select on public.empresas;
create policy empresas_select on public.empresas for select
  using (public.is_admin() or id = public.current_empresa_id());

-- clientes: admin todo; empresa ve los suyos; cliente se ve a sí mismo
drop policy if exists clientes_select on public.clientes;
create policy clientes_select on public.clientes for select
  using (
    public.is_admin()
    or (public.current_role_name() = 'empresa' and empresa_id = public.current_empresa_id())
    or (public.current_role_name() = 'cliente' and id = public.current_cliente_id())
  );

drop policy if exists clientes_write on public.clientes;
create policy clientes_write on public.clientes for all
  using (public.is_admin() or (public.current_role_name() = 'empresa' and empresa_id = public.current_empresa_id()))
  with check (public.is_admin() or (public.current_role_name() = 'empresa' and empresa_id = public.current_empresa_id()));

-- projects: admin todo; empresa gestiona los suyos; cliente ve los suyos
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select
  using (
    public.is_admin()
    or (public.current_role_name() = 'empresa' and empresa_id = public.current_empresa_id())
    or (public.current_role_name() = 'cliente' and cliente_id = public.current_cliente_id())
  );

drop policy if exists projects_write on public.projects;
create policy projects_write on public.projects for all
  using (public.is_admin() or (public.current_role_name() = 'empresa' and empresa_id = public.current_empresa_id()))
  with check (public.is_admin() or (public.current_role_name() = 'empresa' and empresa_id = public.current_empresa_id()));

-- documents: mismo patrón, cliente solo lectura de sus proyectos
drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents for select
  using (
    public.is_admin()
    or (public.current_role_name() = 'empresa' and empresa_id = public.current_empresa_id())
    or (public.current_role_name() = 'cliente' and project_id in (
          select id from public.projects where cliente_id = public.current_cliente_id()))
  );

drop policy if exists documents_write on public.documents;
create policy documents_write on public.documents for all
  using (public.is_admin() or (public.current_role_name() = 'empresa' and empresa_id = public.current_empresa_id()))
  with check (public.is_admin() or (public.current_role_name() = 'empresa' and empresa_id = public.current_empresa_id()));

-- templates: admin + empresa dueña
drop policy if exists templates_all on public.document_templates;
create policy templates_all on public.document_templates for all
  using (public.is_admin() or (public.current_role_name() = 'empresa' and empresa_id = public.current_empresa_id()))
  with check (public.is_admin() or (public.current_role_name() = 'empresa' and empresa_id = public.current_empresa_id()));

-- ============================================================
-- database/seed/0002_seed_users.sql
-- ============================================================
-- Feblio · Seed de usuarios de prueba y datos demo
-- Credenciales (todas con la misma contraseña de prueba): Feblio2026!
--   admin    -> ivan@feblio.app
--   empresa  -> ralm@feblio.app
--   cliente  -> casachona@feblio.app

do $$
declare
  v_ivan    uuid := gen_random_uuid();
  v_ralm    uuid := gen_random_uuid();
  v_casa    uuid := gen_random_uuid();
  v_empresa uuid := gen_random_uuid();
  v_cliente uuid := gen_random_uuid();
  v_proj1   uuid := gen_random_uuid();
  v_proj2   uuid := gen_random_uuid();
begin
  -- Empresa (tenant)
  insert into public.empresas(id, name, cif) values (v_empresa, 'Ralm', 'B00000000');

  -- Usuarios de Auth
  -- IMPORTANTE: las columnas de token deben ir a '' (no NULL) o GoTrue falla
  -- al hacer login con "Database error querying schema".
  insert into auth.users
    (instance_id, id, aud, role, email, encrypted_password,
     email_confirmed_at, created_at, updated_at,
     raw_app_meta_data, raw_user_meta_data,
     confirmation_token, recovery_token, email_change_token_new, email_change,
     email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  values
    ('00000000-0000-0000-0000-000000000000', v_ivan, 'authenticated', 'authenticated',
     'ivan@feblio.app', crypt('Feblio2026!', gen_salt('bf')),
     now(), now(), now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     jsonb_build_object('full_name','Ivan','role','admin'),
     '', '', '', '', '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_ralm, 'authenticated', 'authenticated',
     'ralm@feblio.app', crypt('Feblio2026!', gen_salt('bf')),
     now(), now(), now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     jsonb_build_object('full_name','Ralm','role','empresa'),
     '', '', '', '', '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_casa, 'authenticated', 'authenticated',
     'casachona@feblio.app', crypt('Feblio2026!', gen_salt('bf')),
     now(), now(), now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     jsonb_build_object('full_name','Casa Chona','role','cliente'),
     '', '', '', '', '', '', '', '');

  -- Identities (necesario para login por email/password)
  insert into auth.identities
    (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values
    (gen_random_uuid(), v_ivan, v_ivan::text,
     jsonb_build_object('sub', v_ivan::text, 'email','ivan@feblio.app'), 'email', now(), now(), now()),
    (gen_random_uuid(), v_ralm, v_ralm::text,
     jsonb_build_object('sub', v_ralm::text, 'email','ralm@feblio.app'), 'email', now(), now(), now()),
    (gen_random_uuid(), v_casa, v_casa::text,
     jsonb_build_object('sub', v_casa::text, 'email','casachona@feblio.app'), 'email', now(), now(), now());

  -- Cliente final (pertenece a la empresa Ralm)
  insert into public.clientes(id, empresa_id, name, email, linked_profile_id)
  values (v_cliente, v_empresa, 'Casa Chona', 'casachona@feblio.app', v_casa);

  -- Vincular perfiles (creados por el trigger handle_new_user)
  update public.profiles set empresa_id = v_empresa                       where id = v_ralm;
  update public.profiles set empresa_id = v_empresa, cliente_id = v_cliente where id = v_casa;

  -- Proyectos demo
  insert into public.projects(id, empresa_id, cliente_id, name, status, budget_total, invoiced, provision_funds, pending_payments, progress)
  values
    (v_proj1, v_empresa, v_cliente, 'Reforma Integral Edificio Central', 'en_progreso', 120000, 75250, 15000, 29750, 65),
    (v_proj2, v_empresa, null,      'Rehabilitación Fachada Norte',       'borrador',    45000,     0,  5000,     0, 10);

  -- Documentos demo
  insert into public.documents(empresa_id, project_id, type, name, amount, status)
  values
    (v_empresa, v_proj1, 'presupuesto', 'Presupuesto.pdf',          120000, 'aprobado'),
    (v_empresa, v_proj1, 'contrato',    'Contrato.pdf',                  0, 'firmado'),
    (v_empresa, v_proj1, 'factura',     'Factura_F-2024-015.pdf',    12500, 'enviada'),
    (v_empresa, v_proj1, 'otro',        'Certificado_Obra.pdf',          0, 'archivado');

  -- Plantillas demo
  insert into public.document_templates(empresa_id, type, name, content)
  values
    (v_empresa, 'presupuesto', 'Plantilla presupuesto estándar', '{"iva":21,"moneda":"EUR"}'::jsonb),
    (v_empresa, 'provision',   'Plantilla provisión de fondos',  '{"moneda":"EUR"}'::jsonb),
    (v_empresa, 'factura',     'Plantilla factura estándar',     '{"iva":21,"moneda":"EUR"}'::jsonb);
end $$;

-- ============================================================
-- database/migrations/0003_harden_functions.sql
-- ============================================================
-- Feblio · Endurecer helpers SECURITY DEFINER
-- Quita EXECUTE público/anon; RLS los usa internamente como definer.
revoke all on function public.current_role_name()  from public, anon;
revoke all on function public.current_empresa_id()  from public, anon;
revoke all on function public.current_cliente_id()  from public, anon;
revoke all on function public.is_admin()            from public, anon;
grant execute on function public.current_role_name() to authenticated;
grant execute on function public.current_empresa_id() to authenticated;
grant execute on function public.current_cliente_id() to authenticated;
grant execute on function public.is_admin()          to authenticated;

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- ============================================================
-- database/migrations/0004_registro_cif_nif.sql
-- ============================================================
-- Feblio · Registro con identificación fiscal (CIF empresa / NIF autónomo)
alter table public.empresas add column if not exists tax_type text; -- 'CIF' | 'NIF'

-- Al registrarse un tenant (role='empresa') se crea su empresa con la
-- identificación fiscal tomada de los metadatos del signup y se vincula el perfil.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role     user_role := coalesce((new.raw_user_meta_data->>'role')::user_role, 'cliente');
  v_empresa  uuid;
begin
  if v_role = 'empresa' then
    insert into public.empresas (name, cif, tax_type)
    values (
      coalesce(nullif(new.raw_user_meta_data->>'company_name',''),
               new.raw_user_meta_data->>'full_name',
               new.email),
      nullif(new.raw_user_meta_data->>'tax_id',''),
      nullif(new.raw_user_meta_data->>'tax_type','')
    )
    returning id into v_empresa;
  end if;

  insert into public.profiles (id, email, full_name, role, empresa_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    v_role,
    v_empresa
  )
  on conflict (id) do nothing;

  return new;
end $$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

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
