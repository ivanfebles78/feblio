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
