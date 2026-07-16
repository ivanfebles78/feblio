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
