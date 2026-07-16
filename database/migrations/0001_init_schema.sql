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
