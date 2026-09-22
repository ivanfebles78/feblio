-- Feblio · 0018 · Catálogo de servicios y precios por empresa (precios versionados por vigencia).
--
-- Idempotente (create table if not exists / create or replace). Aplicar DESPUÉS de 0017.
-- Aditiva: no modifica ni borra datos existentes salvo el backfill único de profiles.company_role.
--
-- Resumen:
--  · profiles.company_role (owner | manager | member) solo para role = 'empresa'; NULL en el resto.
--    Backfill único: is_onboarding_owner → owner; resto de cuentas de empresa existentes → manager.
--    Los perfiles nuevos de empresa se normalizan a 'member' (o 'owner' si son el propietario del alta).
--  · service_categories / services / service_price_versions, todas por empresa y con RLS de solo lectura.
--    Ninguna escritura directa para authenticated: solo las RPC security definer de este archivo.
--  · Vigencia por fechas [valid_from, valid_to): sin solapes (exclusión GIST), a lo sumo una versión
--    aplicable en cada fecha y como mucho una programada a futuro. No hay puntero a la versión vigente.
--  · Versiones inmutables: solo las RPC pueden cerrar la vigencia (valid_to/superseded_at) y solo se
--    puede borrar una versión futura no utilizada o el historial de un servicio jamás usado.
--  · Auditoría en audit_events para categorías, servicios, precios, importaciones, activaciones y borrados.
--  · Paso opcional 'services' del onboarding (no bloquea la activación).
--
-- Nota: los «no encontrado» usan el SQLSTATE 'PT404' para que PostgREST responda 404 (con 'P0002'
-- devolvía 500). El mensaje y el `detail` estable son idénticos para un recurso inexistente y para uno
-- de otra empresa: la respuesta no revela si existe.
--
-- Rollback lógico: drop de las funciones svc_*/service_*/services_* y de las 3 tablas (versiones →
-- servicios → categorías); revertir el check de onboarding_steps.step_key y borrar sus filas 'services';
-- profiles.company_role puede quedarse (es aditiva) o eliminarse junto con su trigger y su check.

-- ===========================================================================
-- 0) Requisitos
-- ===========================================================================
create extension if not exists btree_gist with schema extensions;

-- ===========================================================================
-- 1) Rol interno de empresa
-- ===========================================================================
alter table public.profiles add column if not exists company_role text;

-- Normaliza company_role según el rol de la cuenta y bloquea la auto-asignación desde el cliente.
create or replace function public.normalize_profile_company_role()
returns trigger language plpgsql as $$
begin
  if new.role = 'empresa' then
    if tg_op = 'UPDATE' and old.role = 'empresa' and not (public.feblio_trusted() or public.is_admin())
       and new.company_role is distinct from old.company_role then
      raise exception 'No puedes cambiar tu rol interno de empresa' using errcode = '42501', detail = 'company_role_forbidden';
    end if;
    if new.company_role is null or new.company_role not in ('owner', 'manager', 'member') then
      new.company_role := case when coalesce(new.is_onboarding_owner, false) then 'owner' else 'member' end;
    end if;
  else
    new.company_role := null;
  end if;
  return new;
end $$;
revoke all on function public.normalize_profile_company_role() from public, anon, authenticated;

drop trigger if exists profiles_normalize_company_role on public.profiles;
create trigger profiles_normalize_company_role before insert or update on public.profiles
  for each row execute function public.normalize_profile_company_role();

-- Backfill único: propietario del alta → owner; resto de cuentas de empresa ya existentes → manager
-- (conservan las capacidades que tenían). Marcado en platform_settings para no repetirse.
do $$
declare n int := 0;
begin
  if not exists (select 1 from public.platform_settings where key = 'company_role_backfill_done') then
    update public.profiles set company_role = 'owner'
     where role = 'empresa' and coalesce(is_onboarding_owner, false) and company_role is distinct from 'owner';
    update public.profiles set company_role = 'manager'
     where role = 'empresa' and not coalesce(is_onboarding_owner, false)
       and (company_role is null or company_role not in ('owner', 'manager', 'member'));
    get diagnostics n = row_count;
    update public.profiles set company_role = null where role <> 'empresa' and company_role is not null;
    insert into public.platform_settings (key, value)
    values ('company_role_backfill_done', jsonb_build_object('at', now(), 'managers', n));
  end if;
end $$;

alter table public.profiles drop constraint if exists profiles_company_role_check;
alter table public.profiles add constraint profiles_company_role_check check (
  (role = 'empresa' and company_role in ('owner', 'manager', 'member'))
  or (role <> 'empresa' and company_role is null)
);

-- El perfil tampoco puede cambiar su propio rol interno por la vía del guard existente.
create or replace function public.guard_profile_identity_columns()
returns trigger language plpgsql as $$
begin
  if public.feblio_trusted() or public.is_admin() then return new; end if;
  if new.role is distinct from old.role
     or new.empresa_id is distinct from old.empresa_id
     or new.cliente_id is distinct from old.cliente_id
     or new.company_role is distinct from old.company_role
     or new.is_onboarding_owner is distinct from old.is_onboarding_owner
     or new.email is distinct from old.email then
    raise exception 'No puedes modificar rol, empresa ni email de acceso desde el perfil'
      using errcode = '42501', detail = 'profile_identity_forbidden';
  end if;
  return new;
end $$;

-- Rol interno de la sesión ('owner' | 'manager' | 'member'); NULL si no es cuenta de empresa.
create or replace function public.current_company_role()
returns text language sql stable security definer set search_path = public as $$
  select case when p.role = 'empresa' then p.company_role end from public.profiles p where p.id = auth.uid();
$$;
revoke all on function public.current_company_role() from public, anon;
grant execute on function public.current_company_role() to authenticated;

-- ¿Puede la sesión escribir en el catálogo? (owner/manager de la empresa o admin de plataforma)
create or replace function public.can_manage_catalog()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or coalesce(public.current_company_role() in ('owner', 'manager'), false);
$$;
revoke all on function public.can_manage_catalog() from public, anon;
grant execute on function public.can_manage_catalog() to authenticated;

-- ===========================================================================
-- 2) Tablas
-- ===========================================================================
create table if not exists public.service_categories (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  code        text not null,
  name_es     text not null,
  name_en     text,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_by  uuid references auth.users(id) on delete set null,
  updated_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (empresa_id, code)
);
-- Permite la FK compuesta desde services (la categoría es siempre de la misma empresa)
create unique index if not exists service_categories_id_empresa_key on public.service_categories (id, empresa_id);

create table if not exists public.services (
  id                          uuid primary key default gen_random_uuid(),
  empresa_id                  uuid not null references public.empresas(id) on delete cascade,
  category_id                 uuid,
  code                        text not null,
  name_es                     text not null,
  name_en                     text,
  description_es              text,
  description_en              text,
  is_active                   boolean not null default true,
  activated_at                timestamptz,
  deactivated_at              timestamptz,
  effective_from              date,
  effective_to                date,
  estimated_duration_minutes  int check (estimated_duration_minutes is null or estimated_duration_minutes between 1 and 100000),
  prerequisites               text[] not null default '{}',
  requires_human_review       boolean not null default true,
  min_info                    jsonb not null default '[]'::jsonb,
  required_documents          jsonb not null default '[]'::jsonb,
  client_questions            jsonb not null default '[]'::jsonb,
  included_actions            jsonb not null default '[]'::jsonb,
  excluded_actions            jsonb not null default '[]'::jsonb,
  usage_count                 int not null default 0 check (usage_count >= 0),
  sort_order                  int not null default 0,
  created_by                  uuid references auth.users(id) on delete set null,
  updated_by                  uuid references auth.users(id) on delete set null,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  unique (empresa_id, code),
  constraint services_effective_range_check check (effective_to is null or effective_from is null or effective_to >= effective_from),
  constraint services_prerequisites_check check (prerequisites <@ array['visit', 'meeting', 'assessment']::text[])
);
create unique index if not exists services_id_empresa_key on public.services (id, empresa_id);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'services_category_fkey') then
    alter table public.services add constraint services_category_fkey
      foreign key (category_id, empresa_id) references public.service_categories(id, empresa_id) on delete set null;
  end if;
end $$;
create index if not exists services_empresa_idx on public.services (empresa_id, is_active, sort_order);
create index if not exists services_category_idx on public.services (category_id);

create table if not exists public.service_price_versions (
  id                      uuid primary key default gen_random_uuid(),
  service_id              uuid not null,
  empresa_id              uuid not null,
  version_no              int not null check (version_no > 0),
  pricing_mode            text not null check (pricing_mode in ('fixed', 'hourly', 'per_unit', 'from', 'on_assessment')),
  base_price              numeric(12,2) check (base_price is null or base_price >= 0),
  currency                text not null check (currency ~ '^[A-Z]{3}$'),
  tax_type                text not null check (tax_type in ('IVA', 'IGIC', 'IPSI', 'EXENTO', 'OTRO')),
  tax_rate                numeric(5,2) not null default 0 check (tax_rate between 0 and 100),
  tax_note                text,
  unit                    text,
  min_price               numeric(12,2) check (min_price is null or min_price >= 0),
  max_price               numeric(12,2) check (max_price is null or max_price >= 0),
  urgency_surcharge_type  text not null default 'none' check (urgency_surcharge_type in ('none', 'percent', 'fixed')),
  urgency_surcharge_value numeric(12,2) not null default 0 check (urgency_surcharge_value >= 0),
  external_costs          jsonb not null default '[]'::jsonb,
  valid_from              date not null default current_date,
  valid_to                date,
  superseded_at           timestamptz,
  note                    text,
  created_by              uuid references auth.users(id) on delete set null,
  created_at              timestamptz not null default now(),
  unique (service_id, version_no),
  constraint service_price_versions_service_fkey
    foreign key (service_id, empresa_id) references public.services(id, empresa_id) on delete cascade,
  constraint service_price_versions_dates_check check (valid_to is null or valid_to >= valid_from),
  constraint service_price_versions_amount_check check (
    (pricing_mode = 'on_assessment' and base_price is null)
    or (pricing_mode <> 'on_assessment' and base_price is not null)
  ),
  constraint service_price_versions_unit_check check (
    pricing_mode not in ('hourly', 'per_unit') or (unit is not null and length(btrim(unit)) > 0)
  ),
  constraint service_price_versions_minmax_check check (
    min_price is null or max_price is null or max_price >= min_price
  )
);
-- Sin solapes de vigencia para un mismo servicio (los rangos vacíos —correcciones el mismo día— no solapan)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'service_price_versions_no_overlap') then
    alter table public.service_price_versions add constraint service_price_versions_no_overlap
      exclude using gist (
        service_id extensions.gist_uuid_ops with =,
        daterange(valid_from, valid_to, '[)') with &&
      );
  end if;
end $$;
create index if not exists service_price_versions_service_idx on public.service_price_versions (service_id, version_no desc);
create index if not exists service_price_versions_empresa_idx on public.service_price_versions (empresa_id, valid_from desc);

drop trigger if exists service_categories_set_updated_at on public.service_categories;
create trigger service_categories_set_updated_at before update on public.service_categories
  for each row execute function public.set_updated_at();
drop trigger if exists services_set_updated_at on public.services;
create trigger services_set_updated_at before update on public.services
  for each row execute function public.set_updated_at();

-- Inmutabilidad: solo un contexto confiable (RPC security definer / service_role) puede cerrar la
-- vigencia de una versión; ninguna otra columna cambia nunca y el borrado directo está prohibido.
create or replace function public.guard_service_price_version_immutable()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if not public.feblio_trusted() then
      raise exception 'Las versiones de precio no se pueden borrar' using errcode = '42501', detail = 'price_version_immutable';
    end if;
    return old;
  end if;
  if not public.feblio_trusted() then
    raise exception 'Las versiones de precio son inmutables' using errcode = '42501', detail = 'price_version_immutable';
  end if;
  if new.id is distinct from old.id or new.service_id is distinct from old.service_id
     or new.empresa_id is distinct from old.empresa_id or new.version_no is distinct from old.version_no
     or new.pricing_mode is distinct from old.pricing_mode or new.base_price is distinct from old.base_price
     or new.currency is distinct from old.currency or new.tax_type is distinct from old.tax_type
     or new.tax_rate is distinct from old.tax_rate or new.tax_note is distinct from old.tax_note
     or new.unit is distinct from old.unit or new.min_price is distinct from old.min_price
     or new.max_price is distinct from old.max_price
     or new.urgency_surcharge_type is distinct from old.urgency_surcharge_type
     or new.urgency_surcharge_value is distinct from old.urgency_surcharge_value
     or new.external_costs is distinct from old.external_costs
     or new.valid_from is distinct from old.valid_from or new.note is distinct from old.note
     or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'Solo puede cerrarse la vigencia de una versión de precio'
      using errcode = '42501', detail = 'price_version_immutable';
  end if;
  return new;
end $$;
revoke all on function public.guard_service_price_version_immutable() from public, anon, authenticated;
drop trigger if exists service_price_versions_immutable on public.service_price_versions;
create trigger service_price_versions_immutable before update or delete on public.service_price_versions
  for each row execute function public.guard_service_price_version_immutable();

-- ===========================================================================
-- 3) RLS: lectura por empresa; ninguna escritura directa
-- ===========================================================================
alter table public.service_categories      enable row level security;
alter table public.services                enable row level security;
alter table public.service_price_versions  enable row level security;

drop policy if exists service_categories_select on public.service_categories;
create policy service_categories_select on public.service_categories for select
  using (public.is_admin() or (public.current_role_name() = 'empresa' and empresa_id = public.current_empresa_id()));

drop policy if exists services_select on public.services;
create policy services_select on public.services for select
  using (public.is_admin() or (public.current_role_name() = 'empresa' and empresa_id = public.current_empresa_id()));

drop policy if exists service_price_versions_select on public.service_price_versions;
create policy service_price_versions_select on public.service_price_versions for select
  using (public.is_admin() or (public.current_role_name() = 'empresa' and empresa_id = public.current_empresa_id()));

-- Supabase concede ALL por defecto a anon/authenticated en las tablas nuevas: se retira todo y solo
-- se devuelve SELECT a authenticated (las escrituras pasan exclusivamente por las RPC de este archivo).
revoke all on table public.service_categories, public.services, public.service_price_versions from public, anon;
revoke insert, update, delete, truncate, references, trigger on table
  public.service_categories, public.services, public.service_price_versions from authenticated;
grant select on table public.service_categories, public.services, public.service_price_versions to authenticated;

-- ===========================================================================
-- 4) Resolución de la versión aplicable
-- ===========================================================================
-- Versión aplicable a un servicio en una fecha: [valid_from, valid_to). Respeta RLS (no es definer).
create or replace function public.service_price_at(p_service uuid, p_at date default current_date)
returns uuid language sql stable set search_path = public as $$
  select v.id from public.service_price_versions v
   where v.service_id = p_service
     and v.valid_from <= coalesce(p_at, current_date)
     and (v.valid_to is null or coalesce(p_at, current_date) < v.valid_to)
   order by v.valid_from desc, v.version_no desc
   limit 1;
$$;
revoke all on function public.service_price_at(uuid, date) from public, anon;
grant execute on function public.service_price_at(uuid, date) to authenticated;

-- Catálogo con la versión vigente hoy y, si existe, la próxima programada. Hereda la RLS de las tablas.
drop view if exists public.services_catalog_v;
create view public.services_catalog_v with (security_invoker = true) as
select
  s.id, s.empresa_id, s.code, s.category_id, c.code as category_code, c.name_es as category_name_es,
  c.name_en as category_name_en, s.name_es, s.name_en, s.description_es, s.description_en,
  s.is_active, s.effective_from, s.effective_to, s.estimated_duration_minutes, s.prerequisites,
  s.requires_human_review, s.min_info, s.required_documents, s.client_questions,
  s.included_actions, s.excluded_actions, s.usage_count, s.sort_order, s.created_at, s.updated_at,
  cur.id as price_version_id, cur.version_no, cur.pricing_mode, cur.base_price, cur.currency,
  cur.tax_type, cur.tax_rate, cur.tax_note, cur.unit, cur.min_price, cur.max_price,
  cur.urgency_surcharge_type, cur.urgency_surcharge_value, cur.external_costs,
  cur.valid_from, cur.valid_to,
  nxt.id as next_price_version_id, nxt.valid_from as next_valid_from,
  nxt.pricing_mode as next_pricing_mode, nxt.base_price as next_base_price
from public.services s
left join public.service_categories c on c.id = s.category_id
left join lateral (
  select v.* from public.service_price_versions v
   where v.service_id = s.id and v.valid_from <= current_date
     and (v.valid_to is null or current_date < v.valid_to)
   order by v.valid_from desc, v.version_no desc limit 1
) cur on true
left join lateral (
  select v.* from public.service_price_versions v
   where v.service_id = s.id and v.valid_from > current_date
   order by v.valid_from asc limit 1
) nxt on true;
revoke all on public.services_catalog_v from public, anon;
revoke insert, update, delete, truncate, references, trigger on public.services_catalog_v from authenticated;
grant select on public.services_catalog_v to authenticated;

-- ===========================================================================
-- 5) Validación y utilidades internas (solo servidor)
-- ===========================================================================
-- Empresa de la sesión exigiendo permiso de escritura en el catálogo.
create or replace function public.svc_ctx_manage()
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v_empresa uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '42501', detail = 'unauthenticated';
  end if;
  if not public.can_manage_catalog() then
    raise exception 'Tu cuenta no puede modificar el catálogo' using errcode = '42501', detail = 'catalog_forbidden';
  end if;
  v_empresa := public.current_empresa_id();
  if v_empresa is null then
    raise exception 'Cuenta sin empresa' using errcode = '42501', detail = 'no_company';
  end if;
  return v_empresa;
end $$;
revoke all on function public.svc_ctx_manage() from public, anon, authenticated;

-- Normaliza y valida las listas del servicio. p_kind: items | documents | questions | actions | costs.
create or replace function public.svc_items(p jsonb, p_kind text)
returns jsonb language plpgsql immutable set search_path = public as $$
declare it jsonb; out_items jsonb := '[]'::jsonb; n int := 0; v_key text; v_type text;
begin
  if p is null or p = 'null'::jsonb then return '[]'::jsonb; end if;
  if jsonb_typeof(p) <> 'array' then
    raise exception 'Lista no válida' using errcode = '22023', detail = 'invalid_items';
  end if;
  if jsonb_array_length(p) > 50 then
    raise exception 'Demasiados elementos' using errcode = '22023', detail = 'invalid_items';
  end if;
  for it in select value from jsonb_array_elements(p) loop
    n := n + 1;
    if jsonb_typeof(it) <> 'object' then
      raise exception 'Elemento no válido' using errcode = '22023', detail = 'invalid_items';
    end if;
    if p_kind in ('items', 'documents') then
      v_key := coalesce(nullif(btrim(it->>'key'), ''), 'k' || n);
      if v_key !~ '^[a-z0-9_]{1,40}$' then
        raise exception 'Clave no válida' using errcode = '22023', detail = 'invalid_items';
      end if;
      if coalesce(btrim(it->>'label_es'), '') = '' then
        raise exception 'Falta la etiqueta' using errcode = '22023', detail = 'invalid_items';
      end if;
      out_items := out_items || jsonb_build_object(
        'key', v_key,
        'label_es', left(btrim(it->>'label_es'), 200),
        'label_en', nullif(left(btrim(coalesce(it->>'label_en', '')), 200), ''),
        'required', coalesce((it->>'required')::boolean, true));
    elsif p_kind = 'questions' then
      v_key := coalesce(nullif(btrim(it->>'key'), ''), 'q' || n);
      v_type := coalesce(nullif(btrim(it->>'answer_type'), ''), 'text');
      if v_key !~ '^[a-z0-9_]{1,40}$' or v_type not in ('text', 'yes_no', 'number', 'date', 'choice') then
        raise exception 'Pregunta no válida' using errcode = '22023', detail = 'invalid_items';
      end if;
      if coalesce(btrim(it->>'text_es'), '') = '' then
        raise exception 'Falta el texto de la pregunta' using errcode = '22023', detail = 'invalid_items';
      end if;
      out_items := out_items || jsonb_build_object(
        'key', v_key,
        'text_es', left(btrim(it->>'text_es'), 300),
        'text_en', nullif(left(btrim(coalesce(it->>'text_en', '')), 300), ''),
        'answer_type', v_type,
        'required', coalesce((it->>'required')::boolean, true));
    elsif p_kind = 'actions' then
      if coalesce(btrim(it->>'es'), '') = '' then
        raise exception 'Actuación vacía' using errcode = '22023', detail = 'invalid_items';
      end if;
      out_items := out_items || jsonb_build_object(
        'es', left(btrim(it->>'es'), 300),
        'en', nullif(left(btrim(coalesce(it->>'en', '')), 300), ''));
    elsif p_kind = 'costs' then
      if coalesce(btrim(it->>'label_es'), '') = '' then
        raise exception 'Gasto sin concepto' using errcode = '22023', detail = 'invalid_items';
      end if;
      if (it->>'amount') is not null and (it->>'amount')::numeric < 0 then
        raise exception 'Importe negativo' using errcode = '22023', detail = 'invalid_price';
      end if;
      out_items := out_items || jsonb_build_object(
        'label_es', left(btrim(it->>'label_es'), 200),
        'label_en', nullif(left(btrim(coalesce(it->>'label_en', '')), 200), ''),
        'amount', case when (it->>'amount') is null then null else round((it->>'amount')::numeric, 2) end,
        'estimated', coalesce((it->>'estimated')::boolean, true),
        'included', coalesce((it->>'included')::boolean, false));
    else
      raise exception 'Tipo de lista desconocido' using errcode = '22023', detail = 'invalid_items';
    end if;
  end loop;
  return out_items;
end $$;
revoke all on function public.svc_items(jsonb, text) from public, anon, authenticated;

-- Normaliza los campos de precio de un payload (sin tocar la base de datos).
create or replace function public.svc_price_payload(p jsonb, p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_mode text := coalesce(nullif(btrim(p->>'pricing_mode'), ''), 'fixed');
  v_cur  text := upper(coalesce(nullif(btrim(p->>'currency'), ''), ''));
  v_tax  text := upper(coalesce(nullif(btrim(p->>'tax_type'), ''), ''));
  v_rate numeric; v_base numeric; v_min numeric; v_max numeric; v_unit text;
  v_usurch text := coalesce(nullif(btrim(p->>'urgency_surcharge_type'), ''), 'none');
  v_uval numeric := coalesce(round(nullif(btrim(p->>'urgency_surcharge_value'), '')::numeric, 2), 0);
  v_from date; v_bill record;
begin
  if v_mode not in ('fixed', 'hourly', 'per_unit', 'from', 'on_assessment') then
    raise exception 'Modalidad de precio no válida' using errcode = '22023', detail = 'invalid_mode';
  end if;
  select b.currency, b.tax_type, b.tax_rate into v_bill from public.billing_settings b where b.empresa_id = p_empresa;
  if v_cur = '' then v_cur := coalesce(v_bill.currency, (select e.currency from public.empresas e where e.id = p_empresa), 'EUR'); end if;
  if v_cur !~ '^[A-Z]{3}$' then
    raise exception 'Moneda no válida' using errcode = '22023', detail = 'invalid_currency';
  end if;
  if v_tax = '' then v_tax := coalesce(v_bill.tax_type, 'IVA'); end if;
  if v_tax not in ('IVA', 'IGIC', 'IPSI', 'EXENTO', 'OTRO') then
    raise exception 'Impuesto no válido' using errcode = '22023', detail = 'invalid_tax';
  end if;
  v_rate := nullif(btrim(coalesce(p->>'tax_rate', '')), '')::numeric;
  if v_rate is null then v_rate := case when v_tax = 'EXENTO' then 0 else coalesce(v_bill.tax_rate, 0) end; end if;
  if v_rate < 0 or v_rate > 100 or (v_tax = 'EXENTO' and v_rate <> 0) then
    raise exception 'Tipo impositivo no válido' using errcode = '22023', detail = 'invalid_tax';
  end if;
  v_base := nullif(btrim(coalesce(p->>'base_price', '')), '')::numeric;
  if v_mode = 'on_assessment' then
    v_base := null;
  elsif v_base is null or v_base < 0 then
    raise exception 'Precio base obligatorio' using errcode = '22023', detail = 'invalid_price';
  else
    v_base := round(v_base, 2);
  end if;
  v_min := round(nullif(btrim(coalesce(p->>'min_price', '')), '')::numeric, 2);
  v_max := round(nullif(btrim(coalesce(p->>'max_price', '')), '')::numeric, 2);
  if (v_min is not null and v_min < 0) or (v_max is not null and v_max < 0)
     or (v_min is not null and v_max is not null and v_max < v_min)
     or (v_base is not null and v_min is not null and v_base < v_min)
     or (v_base is not null and v_max is not null and v_base > v_max) then
    raise exception 'Rango de precios no válido' using errcode = '22023', detail = 'invalid_range';
  end if;
  v_unit := nullif(left(btrim(coalesce(p->>'unit', '')), 40), '');
  if v_mode in ('hourly', 'per_unit') and v_unit is null then
    v_unit := case v_mode when 'hourly' then 'hora' else 'unidad' end;
  end if;
  if v_usurch not in ('none', 'percent', 'fixed') then
    raise exception 'Suplemento de urgencia no válido' using errcode = '22023', detail = 'invalid_mode';
  end if;
  if v_usurch = 'none' then v_uval := 0; end if;
  if v_uval < 0 or (v_usurch = 'percent' and v_uval > 100) then
    raise exception 'Suplemento de urgencia no válido' using errcode = '22023', detail = 'invalid_price';
  end if;
  v_from := nullif(btrim(coalesce(p->>'valid_from', '')), '')::date;
  return jsonb_build_object(
    'pricing_mode', v_mode, 'base_price', v_base, 'currency', v_cur, 'tax_type', v_tax, 'tax_rate', v_rate,
    'tax_note', nullif(left(btrim(coalesce(p->>'tax_note', '')), 200), ''),
    'unit', v_unit, 'min_price', v_min, 'max_price', v_max,
    'urgency_surcharge_type', v_usurch, 'urgency_surcharge_value', v_uval,
    'external_costs', public.svc_items(p->'external_costs', 'costs'),
    'valid_from', v_from, 'note', nullif(left(btrim(coalesce(p->>'note', '')), 200), ''));
end $$;
revoke all on function public.svc_price_payload(jsonb, uuid) from public, anon, authenticated;

-- ¿Cambian los campos económicos respecto de la versión indicada?
create or replace function public.svc_price_differs(p_version public.service_price_versions, p jsonb)
returns boolean language sql immutable set search_path = public as $$
  select p_version.pricing_mode is distinct from (p->>'pricing_mode')
      or p_version.base_price is distinct from nullif(p->>'base_price', '')::numeric
      or p_version.currency is distinct from (p->>'currency')
      or p_version.tax_type is distinct from (p->>'tax_type')
      or p_version.tax_rate is distinct from (p->>'tax_rate')::numeric
      or p_version.tax_note is distinct from nullif(p->>'tax_note', '')
      or p_version.unit is distinct from nullif(p->>'unit', '')
      or p_version.min_price is distinct from nullif(p->>'min_price', '')::numeric
      or p_version.max_price is distinct from nullif(p->>'max_price', '')::numeric
      or p_version.urgency_surcharge_type is distinct from (p->>'urgency_surcharge_type')
      or p_version.urgency_surcharge_value is distinct from (p->>'urgency_surcharge_value')::numeric
      or p_version.external_costs is distinct from coalesce(p->'external_costs', '[]'::jsonb);
$$;
revoke all on function public.svc_price_differs(public.service_price_versions, jsonb) from public, anon, authenticated;

-- Inserta una versión nueva cerrando la vigente. Bloquea el servicio (evita versiones simultáneas).
create or replace function public.svc_new_price_version(p_empresa uuid, p_service uuid, p jsonb)
returns public.service_price_versions language plpgsql security definer set search_path = public as $$
declare v_from date; v_max_from date; v_no int; v_row public.service_price_versions;
begin
  perform 1 from public.services s where s.id = p_service and s.empresa_id = p_empresa for update;
  if not found then
    raise exception 'Servicio no encontrado' using errcode = 'PT404', detail = 'service_not_found';
  end if;
  v_from := coalesce((p->>'valid_from')::date, current_date);
  if v_from < current_date then
    raise exception 'La vigencia no puede empezar en el pasado' using errcode = '22023', detail = 'price_past_date';
  end if;
  select max(valid_from) into v_max_from from public.service_price_versions where service_id = p_service;
  if v_max_from is not null and v_from < v_max_from then
    raise exception 'Ya existe una versión posterior' using errcode = '22023', detail = 'price_overlap';
  end if;
  if exists (select 1 from public.service_price_versions where service_id = p_service and valid_from = v_from and valid_from > current_date) then
    raise exception 'Ya hay una versión programada para esa fecha' using errcode = '22023', detail = 'price_overlap';
  end if;
  update public.service_price_versions
     set valid_to = v_from, superseded_at = now()
   where service_id = p_service and valid_to is null and valid_from <= v_from;
  select coalesce(max(version_no), 0) + 1 into v_no from public.service_price_versions where service_id = p_service;
  insert into public.service_price_versions (
    service_id, empresa_id, version_no, pricing_mode, base_price, currency, tax_type, tax_rate, tax_note,
    unit, min_price, max_price, urgency_surcharge_type, urgency_surcharge_value, external_costs,
    valid_from, note, created_by)
  values (
    p_service, p_empresa, v_no, p->>'pricing_mode', nullif(p->>'base_price', '')::numeric, p->>'currency',
    p->>'tax_type', (p->>'tax_rate')::numeric, nullif(p->>'tax_note', ''), nullif(p->>'unit', ''),
    nullif(p->>'min_price', '')::numeric, nullif(p->>'max_price', '')::numeric,
    p->>'urgency_surcharge_type', (p->>'urgency_surcharge_value')::numeric,
    coalesce(p->'external_costs', '[]'::jsonb), v_from, nullif(p->>'note', ''), auth.uid())
  returning * into v_row;
  return v_row;
end $$;
revoke all on function public.svc_new_price_version(uuid, uuid, jsonb) from public, anon, authenticated;

-- ===========================================================================
-- 6) RPC: categorías
-- ===========================================================================
create or replace function public.service_category_upsert(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_empresa uuid := public.svc_ctx_manage(); v_id uuid := nullif(p->>'id', '')::uuid;
        v_code text := upper(btrim(coalesce(p->>'code', ''))); v_name text := btrim(coalesce(p->>'name_es', ''));
begin
  if v_code !~ '^[A-Z0-9][A-Z0-9_-]{1,29}$' then
    raise exception 'Código de categoría no válido' using errcode = '22023', detail = 'invalid_code';
  end if;
  if v_name = '' or length(v_name) > 120 then
    raise exception 'Nombre de categoría no válido' using errcode = '22023', detail = 'invalid_name';
  end if;
  if v_id is not null then
    update public.service_categories
       set code = v_code, name_es = v_name, name_en = nullif(left(btrim(coalesce(p->>'name_en', '')), 120), ''),
           sort_order = coalesce((p->>'sort_order')::int, sort_order),
           is_active = coalesce((p->>'is_active')::boolean, is_active), updated_by = auth.uid()
     where id = v_id and empresa_id = v_empresa
     returning id into v_id;
    if v_id is null then
      raise exception 'Categoría no encontrada' using errcode = 'PT404', detail = 'category_not_found';
    end if;
    perform public.audit_log_internal(v_empresa, auth.uid(), 'catalog.category_updated', 'service_categories', v_id, 'ok',
      jsonb_build_object('code', v_code));
  else
    insert into public.service_categories (empresa_id, code, name_es, name_en, sort_order, is_active, created_by, updated_by)
    values (v_empresa, v_code, v_name, nullif(left(btrim(coalesce(p->>'name_en', '')), 120), ''),
            coalesce((p->>'sort_order')::int, 0), coalesce((p->>'is_active')::boolean, true), auth.uid(), auth.uid())
    returning id into v_id;
    perform public.audit_log_internal(v_empresa, auth.uid(), 'catalog.category_created', 'service_categories', v_id, 'ok',
      jsonb_build_object('code', v_code));
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'Ya existe una categoría con ese código' using errcode = '23505', detail = 'duplicate_code';
end $$;
revoke all on function public.service_category_upsert(jsonb) from public, anon;
grant execute on function public.service_category_upsert(jsonb) to authenticated;

-- p_mode: block (por defecto) | clear (deja los servicios sin categoría) | reassign (a p_reassign_to)
create or replace function public.service_category_delete(p_id uuid, p_mode text default 'block', p_reassign_to uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_empresa uuid := public.svc_ctx_manage(); v_used int; v_code text;
begin
  select code into v_code from public.service_categories where id = p_id and empresa_id = v_empresa;
  if v_code is null then
    raise exception 'Categoría no encontrada' using errcode = 'PT404', detail = 'category_not_found';
  end if;
  if p_mode not in ('block', 'clear', 'reassign') then
    raise exception 'Operación no válida' using errcode = '22023', detail = 'invalid_mode';
  end if;
  select count(*) into v_used from public.services where category_id = p_id and empresa_id = v_empresa;
  if v_used > 0 then
    if p_mode = 'block' then
      raise exception 'La categoría está en uso' using errcode = '22023', detail = 'category_in_use';
    elsif p_mode = 'reassign' then
      if p_reassign_to is null or not exists (select 1 from public.service_categories where id = p_reassign_to and empresa_id = v_empresa) then
        raise exception 'Categoría de destino no válida' using errcode = '22023', detail = 'category_not_found';
      end if;
      update public.services set category_id = p_reassign_to, updated_by = auth.uid()
       where category_id = p_id and empresa_id = v_empresa;
    else
      update public.services set category_id = null, updated_by = auth.uid()
       where category_id = p_id and empresa_id = v_empresa;
    end if;
  end if;
  delete from public.service_categories where id = p_id and empresa_id = v_empresa;
  perform public.audit_log_internal(v_empresa, auth.uid(), 'catalog.category_deleted', 'service_categories', p_id, 'ok',
    jsonb_build_object('code', v_code, 'mode', p_mode, 'services', v_used));
  return jsonb_build_object('ok', true, 'services_updated', v_used);
end $$;
revoke all on function public.service_category_delete(uuid, text, uuid) from public, anon;
grant execute on function public.service_category_delete(uuid, text, uuid) to authenticated;

-- ===========================================================================
-- 7) RPC: servicios
-- ===========================================================================
-- Alta/edición. Al crear exige precio (versión 1). Al editar, el precio solo cambia si se envía `price`
-- y difiere de la versión vigente → nueva versión.
create or replace function public.svc_upsert_internal(p_empresa uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_code text := upper(btrim(coalesce(p->>'code', '')));
  v_name text := btrim(coalesce(p->>'name_es', ''));
  v_cat uuid := nullif(p->>'category_id', '')::uuid;
  v_cat_code text := upper(nullif(btrim(coalesce(p->>'category_code', '')), ''));
  v_pre text[] := coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p->'prerequisites', '[]'::jsonb)) t(x)), '{}');
  v_price jsonb; v_cur public.service_price_versions; v_action text; v_new_version boolean := false; v_row public.services;
begin
  if v_code !~ '^[A-Z0-9][A-Z0-9_-]{1,29}$' then
    raise exception 'Código de servicio no válido' using errcode = '22023', detail = 'invalid_code';
  end if;
  if v_name = '' or length(v_name) > 200 then
    raise exception 'Nombre de servicio no válido' using errcode = '22023', detail = 'invalid_name';
  end if;
  if not (v_pre <@ array['visit', 'meeting', 'assessment']::text[]) then
    raise exception 'Requisito previo no válido' using errcode = '22023', detail = 'invalid_items';
  end if;
  if v_cat_code is not null and v_cat is null then
    select id into v_cat from public.service_categories where empresa_id = p_empresa and code = v_cat_code;
    if v_cat is null then
      raise exception 'Categoría no encontrada' using errcode = 'PT404', detail = 'category_not_found';
    end if;
  end if;
  if v_cat is not null and not exists (select 1 from public.service_categories where id = v_cat and empresa_id = p_empresa) then
    raise exception 'Categoría no encontrada' using errcode = 'PT404', detail = 'category_not_found';
  end if;

  if v_id is null then
    select id into v_id from public.services where empresa_id = p_empresa and code = v_code;
  end if;

  if v_id is null then
    if p->'price' is null or jsonb_typeof(p->'price') <> 'object' then
      raise exception 'Falta el precio' using errcode = '22023', detail = 'invalid_price';
    end if;
    v_price := public.svc_price_payload(p->'price', p_empresa);
    insert into public.services (
      empresa_id, category_id, code, name_es, name_en, description_es, description_en, is_active, activated_at,
      effective_from, effective_to, estimated_duration_minutes, prerequisites, requires_human_review,
      min_info, required_documents, client_questions, included_actions, excluded_actions, sort_order,
      created_by, updated_by)
    values (
      p_empresa, v_cat, v_code, v_name, nullif(left(btrim(coalesce(p->>'name_en', '')), 200), ''),
      nullif(left(btrim(coalesce(p->>'description_es', '')), 4000), ''),
      nullif(left(btrim(coalesce(p->>'description_en', '')), 4000), ''),
      coalesce((p->>'is_active')::boolean, true),
      case when coalesce((p->>'is_active')::boolean, true) then now() end,
      nullif(btrim(coalesce(p->>'effective_from', '')), '')::date,
      nullif(btrim(coalesce(p->>'effective_to', '')), '')::date,
      nullif(btrim(coalesce(p->>'estimated_duration_minutes', '')), '')::int,
      v_pre, coalesce((p->>'requires_human_review')::boolean, true),
      public.svc_items(p->'min_info', 'items'), public.svc_items(p->'required_documents', 'documents'),
      public.svc_items(p->'client_questions', 'questions'), public.svc_items(p->'included_actions', 'actions'),
      public.svc_items(p->'excluded_actions', 'actions'), coalesce((p->>'sort_order')::int, 0),
      auth.uid(), auth.uid())
    returning * into v_row;
    v_id := v_row.id;
    perform public.svc_new_price_version(p_empresa, v_id, v_price);
    v_action := 'created'; v_new_version := true;
    perform public.audit_log_internal(p_empresa, auth.uid(), 'catalog.service_created', 'services', v_id, 'ok',
      jsonb_build_object('code', v_code, 'pricing_mode', v_price->>'pricing_mode'));
  else
    update public.services s
       set category_id = case when p ? 'category_id' or v_cat_code is not null then v_cat else s.category_id end,
           name_es = v_name,
           name_en = case when p ? 'name_en' then nullif(left(btrim(coalesce(p->>'name_en', '')), 200), '') else s.name_en end,
           description_es = case when p ? 'description_es' then nullif(left(btrim(coalesce(p->>'description_es', '')), 4000), '') else s.description_es end,
           description_en = case when p ? 'description_en' then nullif(left(btrim(coalesce(p->>'description_en', '')), 4000), '') else s.description_en end,
           effective_from = case when p ? 'effective_from' then nullif(btrim(coalesce(p->>'effective_from', '')), '')::date else s.effective_from end,
           effective_to = case when p ? 'effective_to' then nullif(btrim(coalesce(p->>'effective_to', '')), '')::date else s.effective_to end,
           estimated_duration_minutes = case when p ? 'estimated_duration_minutes' then nullif(btrim(coalesce(p->>'estimated_duration_minutes', '')), '')::int else s.estimated_duration_minutes end,
           prerequisites = case when p ? 'prerequisites' then v_pre else s.prerequisites end,
           requires_human_review = coalesce((p->>'requires_human_review')::boolean, s.requires_human_review),
           min_info = case when p ? 'min_info' then public.svc_items(p->'min_info', 'items') else s.min_info end,
           required_documents = case when p ? 'required_documents' then public.svc_items(p->'required_documents', 'documents') else s.required_documents end,
           client_questions = case when p ? 'client_questions' then public.svc_items(p->'client_questions', 'questions') else s.client_questions end,
           included_actions = case when p ? 'included_actions' then public.svc_items(p->'included_actions', 'actions') else s.included_actions end,
           excluded_actions = case when p ? 'excluded_actions' then public.svc_items(p->'excluded_actions', 'actions') else s.excluded_actions end,
           sort_order = coalesce((p->>'sort_order')::int, s.sort_order),
           updated_by = auth.uid()
     where s.id = v_id and s.empresa_id = p_empresa
     returning * into v_row;
    if v_row.id is null then
      raise exception 'Servicio no encontrado' using errcode = 'PT404', detail = 'service_not_found';
    end if;
    v_action := 'updated';
    if p->'price' is not null and jsonb_typeof(p->'price') = 'object' then
      v_price := public.svc_price_payload(p->'price', p_empresa);
      select * into v_cur from public.service_price_versions
       where service_id = v_id and valid_from <= current_date and (valid_to is null or current_date < valid_to)
       order by valid_from desc, version_no desc limit 1;
      if v_cur.id is null or public.svc_price_differs(v_cur, v_price)
         or (v_price->>'valid_from') is not null then
        if v_cur.id is null or public.svc_price_differs(v_cur, v_price) then
          perform public.svc_new_price_version(p_empresa, v_id, v_price);
          v_new_version := true;
          perform public.audit_log_internal(p_empresa, auth.uid(), 'catalog.price_changed', 'services', v_id, 'ok',
            jsonb_build_object('code', v_code, 'pricing_mode', v_price->>'pricing_mode', 'valid_from', coalesce(v_price->>'valid_from', current_date::text)));
        end if;
      end if;
    end if;
    perform public.audit_log_internal(p_empresa, auth.uid(), 'catalog.service_updated', 'services', v_id, 'ok',
      jsonb_build_object('code', v_code));
  end if;
  return jsonb_build_object('id', v_id, 'code', v_code, 'action', v_action, 'new_price_version', v_new_version);
exception when unique_violation then
  raise exception 'Ya existe un servicio con ese código' using errcode = '23505', detail = 'duplicate_code';
end $$;
revoke all on function public.svc_upsert_internal(uuid, jsonb) from public, anon, authenticated;

create or replace function public.service_upsert(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_empresa uuid := public.svc_ctx_manage();
begin
  if p is null or jsonb_typeof(p) <> 'object' or pg_column_size(p) > 100000 then
    raise exception 'Datos no válidos' using errcode = '22023', detail = 'invalid_payload';
  end if;
  return public.svc_upsert_internal(v_empresa, p - 'empresa_id');
end $$;
revoke all on function public.service_upsert(jsonb) from public, anon;
grant execute on function public.service_upsert(jsonb) to authenticated;

create or replace function public.service_set_price(p_service uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_empresa uuid := public.svc_ctx_manage(); v_price jsonb; v_row public.service_price_versions; v_code text;
begin
  select code into v_code from public.services where id = p_service and empresa_id = v_empresa;
  if v_code is null then
    raise exception 'Servicio no encontrado' using errcode = 'PT404', detail = 'service_not_found';
  end if;
  v_price := public.svc_price_payload(coalesce(p, '{}'::jsonb), v_empresa);
  v_row := public.svc_new_price_version(v_empresa, p_service, v_price);
  perform public.audit_log_internal(v_empresa, auth.uid(), 'catalog.price_changed', 'services', p_service, 'ok',
    jsonb_build_object('code', v_code, 'version_no', v_row.version_no, 'pricing_mode', v_row.pricing_mode, 'valid_from', v_row.valid_from));
  return jsonb_build_object('id', v_row.id, 'version_no', v_row.version_no, 'valid_from', v_row.valid_from);
end $$;
revoke all on function public.service_set_price(uuid, jsonb) from public, anon;
grant execute on function public.service_set_price(uuid, jsonb) to authenticated;

-- Cancela una versión programada a futuro (nunca vigente) y reabre la anterior.
create or replace function public.service_cancel_scheduled_price(p_service uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_empresa uuid := public.svc_ctx_manage(); v_next public.service_price_versions; v_code text;
begin
  select code into v_code from public.services where id = p_service and empresa_id = v_empresa for update;
  if v_code is null then
    raise exception 'Servicio no encontrado' using errcode = 'PT404', detail = 'service_not_found';
  end if;
  select * into v_next from public.service_price_versions
   where service_id = p_service and valid_from > current_date order by valid_from asc limit 1;
  if v_next.id is null then
    raise exception 'No hay ninguna versión programada' using errcode = 'PT404', detail = 'price_version_not_found';
  end if;
  delete from public.service_price_versions where id = v_next.id;
  update public.service_price_versions set valid_to = null, superseded_at = null
   where service_id = p_service and valid_to = v_next.valid_from;
  perform public.audit_log_internal(v_empresa, auth.uid(), 'catalog.price_schedule_cancelled', 'services', p_service, 'ok',
    jsonb_build_object('code', v_code, 'version_no', v_next.version_no, 'valid_from', v_next.valid_from));
  return jsonb_build_object('ok', true, 'version_no', v_next.version_no);
end $$;
revoke all on function public.service_cancel_scheduled_price(uuid) from public, anon;
grant execute on function public.service_cancel_scheduled_price(uuid) to authenticated;

create or replace function public.service_set_active(p_service uuid, p_active boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_empresa uuid := public.svc_ctx_manage(); v_code text;
begin
  update public.services
     set is_active = coalesce(p_active, true),
         activated_at = case when coalesce(p_active, true) then now() else activated_at end,
         deactivated_at = case when coalesce(p_active, true) then deactivated_at else now() end,
         updated_by = auth.uid()
   where id = p_service and empresa_id = v_empresa
   returning code into v_code;
  if v_code is null then
    raise exception 'Servicio no encontrado' using errcode = 'PT404', detail = 'service_not_found';
  end if;
  perform public.audit_log_internal(v_empresa, auth.uid(),
    case when coalesce(p_active, true) then 'catalog.service_activated' else 'catalog.service_deactivated' end,
    'services', p_service, 'ok', jsonb_build_object('code', v_code));
  return jsonb_build_object('ok', true, 'is_active', coalesce(p_active, true));
end $$;
revoke all on function public.service_set_active(uuid, boolean) from public, anon;
grant execute on function public.service_set_active(uuid, boolean) to authenticated;

-- Borrado físico solo si el servicio nunca se usó; si se usó, únicamente puede desactivarse.
create or replace function public.service_delete(p_service uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_empresa uuid := public.svc_ctx_manage(); v_row public.services;
begin
  select * into v_row from public.services where id = p_service and empresa_id = v_empresa for update;
  if v_row.id is null then
    raise exception 'Servicio no encontrado' using errcode = 'PT404', detail = 'service_not_found';
  end if;
  if v_row.usage_count > 0 then
    raise exception 'El servicio ya se ha utilizado: solo puede desactivarse' using errcode = '22023', detail = 'service_in_use';
  end if;
  delete from public.services where id = p_service and empresa_id = v_empresa;
  perform public.audit_log_internal(v_empresa, auth.uid(), 'catalog.service_deleted', 'services', p_service, 'ok',
    jsonb_build_object('code', v_row.code));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.service_delete(uuid) from public, anon;
grant execute on function public.service_delete(uuid) to authenticated;

-- Reservada para el futuro módulo de presupuestos (marca una versión como utilizada). Solo service_role.
create or replace function public.service_register_usage(p_version uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_service uuid;
begin
  select service_id into v_service from public.service_price_versions where id = p_version;
  if v_service is null then
    raise exception 'Versión no encontrada' using errcode = 'PT404', detail = 'price_version_not_found';
  end if;
  update public.services set usage_count = usage_count + 1 where id = v_service;
  return jsonb_build_object('ok', true, 'service_id', v_service);
end $$;
revoke all on function public.service_register_usage(uuid) from public, anon, authenticated;
grant execute on function public.service_register_usage(uuid) to service_role;

-- ===========================================================================
-- 8) RPC: importación (previsualización y confirmación atómica)
-- ===========================================================================
create or replace function public.services_import(p_rows jsonb, p_commit boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_empresa uuid := public.svc_ctx_manage();
  v_row jsonb; v_i int := 0; v_results jsonb := '[]'::jsonb; v_errors int := 0;
  v_code text; v_existing public.services; v_price jsonb; v_cur public.service_price_versions;
  v_action text; v_detail text; v_created int := 0; v_updated int := 0; v_priced int := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Datos no válidos' using errcode = '22023', detail = 'invalid_payload';
  end if;
  if jsonb_array_length(p_rows) > 500 then
    raise exception 'Máximo 500 filas por importación' using errcode = '22023', detail = 'import_too_large';
  end if;
  if pg_column_size(p_rows) > 2000000 then
    raise exception 'Importación demasiado grande' using errcode = '22023', detail = 'import_too_large';
  end if;

  -- Pasada de validación (nunca escribe): calcula acción y errores por fila
  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_i := v_i + 1;
    v_action := null; v_detail := null;
    begin
      v_code := upper(btrim(coalesce(v_row->>'code', '')));
      if v_code !~ '^[A-Z0-9][A-Z0-9_-]{1,29}$' then
        raise exception 'Código no válido' using errcode = '22023', detail = 'invalid_code';
      end if;
      if btrim(coalesce(v_row->>'name_es', '')) = '' then
        raise exception 'Falta el nombre' using errcode = '22023', detail = 'invalid_name';
      end if;
      perform public.svc_items(v_row->'min_info', 'items');
      perform public.svc_items(v_row->'required_documents', 'documents');
      perform public.svc_items(v_row->'client_questions', 'questions');
      perform public.svc_items(v_row->'included_actions', 'actions');
      perform public.svc_items(v_row->'excluded_actions', 'actions');
      if (v_row->>'category_code') is not null and btrim(v_row->>'category_code') <> ''
         and not exists (select 1 from public.service_categories where empresa_id = v_empresa and code = upper(btrim(v_row->>'category_code'))) then
        raise exception 'Categoría inexistente' using errcode = '22023', detail = 'category_not_found';
      end if;
      select * into v_existing from public.services where empresa_id = v_empresa and code = v_code;
      if v_existing.id is null then
        v_price := public.svc_price_payload(coalesce(v_row->'price', '{}'::jsonb), v_empresa);
        v_action := 'create';
      else
        v_action := 'update';
        if v_row->'price' is not null and jsonb_typeof(v_row->'price') = 'object' then
          v_price := public.svc_price_payload(v_row->'price', v_empresa);
          select * into v_cur from public.service_price_versions
           where service_id = v_existing.id and valid_from <= current_date and (valid_to is null or current_date < valid_to)
           order by valid_from desc, version_no desc limit 1;
          if v_cur.id is null or public.svc_price_differs(v_cur, v_price) then v_action := 'new_price_version'; end if;
        end if;
      end if;
    exception when others then
      get stacked diagnostics v_detail = pg_exception_detail;
      v_action := 'error'; v_errors := v_errors + 1;
      if coalesce(v_detail, '') = '' then v_detail := 'import_failed'; end if;
    end;
    v_results := v_results || jsonb_build_object('index', v_i, 'code', v_code, 'action', v_action,
      'error', case when v_action = 'error' then v_detail end);
  end loop;

  if v_errors > 0 or not coalesce(p_commit, false) then
    return jsonb_build_object('ok', v_errors = 0, 'committed', false, 'total', v_i, 'errors', v_errors, 'rows', v_results);
  end if;

  -- Confirmación: todo o nada (cualquier excepción revierte la transacción de la función)
  v_i := 0;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_i := v_i + 1;
    v_price := public.svc_upsert_internal(v_empresa, v_row - 'id' - 'empresa_id');
    if v_price->>'action' = 'created' then v_created := v_created + 1; else v_updated := v_updated + 1; end if;
    if coalesce((v_price->>'new_price_version')::boolean, false) and v_price->>'action' <> 'created' then
      v_priced := v_priced + 1;
    end if;
  end loop;
  perform public.audit_log_internal(v_empresa, auth.uid(), 'catalog.imported', 'services', null, 'ok',
    jsonb_build_object('rows', v_i, 'created', v_created, 'updated', v_updated, 'new_price_versions', v_priced));
  return jsonb_build_object('ok', true, 'committed', true, 'total', v_i, 'errors', 0,
    'created', v_created, 'updated', v_updated, 'new_price_versions', v_priced, 'rows', v_results);
end $$;
revoke all on function public.services_import(jsonb, boolean) from public, anon;
grant execute on function public.services_import(jsonb, boolean) to authenticated;

-- ===========================================================================
-- 9) Onboarding: paso opcional 'services'
-- ===========================================================================
alter table public.onboarding_steps drop constraint if exists onboarding_steps_key_check;
alter table public.onboarding_steps add constraint onboarding_steps_key_check
  check (step_key in ('company', 'repository', 'email', 'whatsapp', 'sms', 'voice', 'forms', 'services', 'automation', 'billing', 'review'));

-- Se reemplaza la función de 0009 añadiendo únicamente el paso 'services' a la lista de pasos; el resto
-- del cuerpo (integraciones, automatización, facturación, plantillas y reglas de canal) es idéntico.
create or replace function public.ensure_onboarding_defaults(p_empresa uuid)
returns void language plpgsql security definer set search_path = public as $$
declare k text; v_form uuid;
begin
  foreach k in array array['company', 'repository', 'email', 'whatsapp', 'sms', 'voice', 'forms', 'services', 'automation', 'billing', 'review'] loop
    insert into public.onboarding_steps (empresa_id, step_key) values (p_empresa, k)
    on conflict (empresa_id, step_key) do nothing;
  end loop;

  foreach k in array array['document_repository', 'email', 'whatsapp', 'sms', 'voice', 'payments'] loop
    insert into public.integration_connections (empresa_id, kind, status) values (p_empresa, k, 'not_configured')
    on conflict (empresa_id, kind) do nothing;
  end loop;

  insert into public.automation_settings (empresa_id) values (p_empresa) on conflict do nothing;
  -- Impuesto por defecto: IGIC 7 % solo si la empresa parece canaria (provincia o CP 35/38); si no, IVA 21 %.
  -- Es una sugerencia inicial editable en el paso de facturación.
  insert into public.billing_settings (empresa_id, currency, tax_type, tax_rate)
  select p_empresa, coalesce(e.currency, 'EUR'),
         case when e.province in ('Las Palmas', 'Santa Cruz de Tenerife') or e.postal_code ~ '^(35|38)\d{3}$' then 'IGIC' else 'IVA' end,
         case when e.province in ('Las Palmas', 'Santa Cruz de Tenerife') or e.postal_code ~ '^(35|38)\d{3}$' then 7 else 21 end
  from public.empresas e where e.id = p_empresa
  on conflict do nothing;

  if not exists (select 1 from public.folder_templates where empresa_id = p_empresa) then
    insert into public.folder_templates (empresa_id, name, folders, is_default)
    values (p_empresa, 'Estructura estándar Feblio',
      '["01_Requerimiento","02_Datos_cliente","03_Documentacion_recibida","04_Trabajo_en_curso","05_Entregables","06_Facturacion","07_Presentacion_oficial","08_Justificantes"]'::jsonb,
      true);
  end if;

  if not exists (select 1 from public.intake_form_templates where empresa_id = p_empresa) then
    insert into public.intake_form_templates (empresa_id, key, name, description, fields, required_documents, consents, is_default)
    values
      (p_empresa, 'solicitud_general', 'Solicitud general', 'Alta de cliente y descripción de la necesidad.',
       '[{"key":"name","label":"Nombre o razón social","type":"text","required":true},{"key":"email","label":"Email","type":"email","required":true},{"key":"phone","label":"Teléfono","type":"tel","required":false},{"key":"cif","label":"NIF fiscal","type":"text","required":false},{"key":"address","label":"Dirección","type":"text","required":false},{"key":"project_type","label":"Tipo de proyecto","type":"select","required":false},{"key":"description","label":"Describe lo que necesitas","type":"textarea","required":true}]'::jsonb,
       '[]'::jsonb,
       '[{"key":"privacy","label":"He leído la política de privacidad y acepto el tratamiento de mis datos.","required":true}]'::jsonb,
       true),
      (p_empresa, 'respuesta_requerimiento', 'Respuesta a requerimiento', 'Recogida de datos y documentos para contestar un requerimiento.',
       '[{"key":"name","label":"Nombre o razón social","type":"text","required":true},{"key":"email","label":"Email","type":"email","required":true},{"key":"phone","label":"Teléfono","type":"tel","required":true},{"key":"expediente","label":"Número de expediente","type":"text","required":true},{"key":"organismo","label":"Organismo","type":"text","required":true},{"key":"plazo","label":"Fecha límite","type":"date","required":true},{"key":"description","label":"Resumen del requerimiento","type":"textarea","required":true}]'::jsonb,
       '[{"key":"requerimiento","label":"Copia del requerimiento recibido","required":true},{"key":"dni","label":"Documento de identidad","required":true}]'::jsonb,
       '[{"key":"privacy","label":"He leído la política de privacidad y acepto el tratamiento de mis datos.","required":true}]'::jsonb,
       false),
      (p_empresa, 'solicitud_presupuesto', 'Solicitud de presupuesto', 'Datos mínimos para preparar un presupuesto.',
       '[{"key":"name","label":"Nombre o razón social","type":"text","required":true},{"key":"email","label":"Email","type":"email","required":true},{"key":"phone","label":"Teléfono","type":"tel","required":false},{"key":"project_type","label":"Tipo de proyecto","type":"select","required":true},{"key":"budget_range","label":"Presupuesto orientativo","type":"select","required":false,"options":["< 5.000 €","5.000 – 20.000 €","20.000 – 60.000 €","> 60.000 €"]},{"key":"description","label":"Describe el proyecto","type":"textarea","required":true}]'::jsonb,
       '[]'::jsonb,
       '[{"key":"privacy","label":"He leído la política de privacidad y acepto el tratamiento de mis datos.","required":true}]'::jsonb,
       false),
      (p_empresa, 'subsanacion_documental', 'Subsanación documental', 'Solicitud de documentos pendientes.',
       '[{"key":"name","label":"Nombre o razón social","type":"text","required":true},{"key":"email","label":"Email","type":"email","required":true},{"key":"description","label":"Comentarios","type":"textarea","required":false}]'::jsonb,
       '[{"key":"documento_pendiente","label":"Documento solicitado","required":true}]'::jsonb,
       '[{"key":"privacy","label":"He leído la política de privacidad y acepto el tratamiento de mis datos.","required":true}]'::jsonb,
       false),
      (p_empresa, 'visita_tecnica', 'Visita o inspección técnica', 'Programación de visita y datos del emplazamiento.',
       '[{"key":"name","label":"Nombre o razón social","type":"text","required":true},{"key":"phone","label":"Teléfono","type":"tel","required":true},{"key":"email","label":"Email","type":"email","required":false},{"key":"address","label":"Dirección del emplazamiento","type":"text","required":true},{"key":"preferred_date","label":"Fecha preferida","type":"date","required":false},{"key":"access_notes","label":"Instrucciones de acceso","type":"textarea","required":false}]'::jsonb,
       '[]'::jsonb,
       '[{"key":"privacy","label":"He leído la política de privacidad y acepto el tratamiento de mis datos.","required":true}]'::jsonb,
       false);
  end if;

  select id into v_form from public.intake_form_templates where empresa_id = p_empresa and is_default limit 1;
  foreach k in array array['email', 'whatsapp', 'sms', 'voice', 'public_form', 'manual'] loop
    insert into public.channel_rules (empresa_id, channel, default_form_template_id, send_message_template)
    values (p_empresa, k, v_form,
      'Hola {nombre}, soy {empresa}. Para atender tu solicitud necesitamos algunos datos. Complétalos aquí: {url}')
    on conflict (empresa_id, channel) do nothing;
  end loop;
end $$;


-- Las empresas ya existentes reciben el paso nuevo como pendiente (es opcional: no bloquea nada ni
-- reabre el onboarding, que se controla con empresas.onboarding_status).
insert into public.onboarding_steps (empresa_id, step_key)
select e.id, 'services' from public.empresas e
on conflict (empresa_id, step_key) do nothing;

-- ===========================================================================
-- 10) Comprobaciones finales
-- ===========================================================================
do $$
begin
  if exists (select 1 from public.profiles where role = 'empresa' and company_role is null)
     or exists (select 1 from public.profiles where role <> 'empresa' and company_role is not null) then
    raise exception '0018: company_role inconsistente con role';
  end if;
  if not has_function_privilege('authenticated', 'public.service_upsert(jsonb)', 'execute')
     or not has_function_privilege('authenticated', 'public.services_import(jsonb, boolean)', 'execute') then
    raise exception '0018: authenticated debe poder ejecutar las RPC del catálogo';
  end if;
  if has_function_privilege('anon', 'public.service_upsert(jsonb)', 'execute')
     or has_function_privilege('anon', 'public.services_import(jsonb, boolean)', 'execute')
     or has_table_privilege('anon', 'public.services', 'select')
     or has_table_privilege('anon', 'public.service_price_versions', 'select') then
    raise exception '0018: anon no debe tener acceso al catálogo';
  end if;
  if has_table_privilege('authenticated', 'public.services', 'insert')
     or has_table_privilege('authenticated', 'public.service_price_versions', 'update')
     or has_table_privilege('authenticated', 'public.service_categories', 'delete') then
    raise exception '0018: authenticated no debe escribir directamente en el catálogo';
  end if;
  raise notice 'Catálogo de servicios 0018: aplicado';
end $$;
