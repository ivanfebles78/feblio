-- Feblio · 0022 · Tipos de proyecto por defecto en el desplegable del formulario de cliente
--
-- Idempotente. El desplegable "tipo de proyecto" del formulario de intake toma sus opciones de
-- empresas.intake_config.project_types. Hasta ahora una empresa nueva lo tenía vacío ('{}'::jsonb).
-- Esta migración hace que, POR DEFECTO, aparezcan tres opciones editables/eliminables:
--   «Proyecto», «Dirección de obra», «Certificación técnica».
--
-- No se fuerza en lectura: si una empresa las elimina y guarda (project_types = []), quedan eliminadas.
-- El backfill solo toca empresas que nunca configuraron la clave (null o sin 'project_types').

-- 1) Valor por defecto para empresas nuevas (handle_new_user no fija intake_config → usa este default).
alter table public.empresas
  alter column intake_config set default
    '{"project_types": ["Proyecto", "Dirección de obra", "Certificación técnica"]}'::jsonb;

-- 2) Backfill de las empresas existentes que aún no tienen la clave (respeta a quien ya la configuró,
--    incluso si la dejó vacía a propósito).
update public.empresas
   set intake_config = jsonb_set(coalesce(intake_config, '{}'::jsonb), '{project_types}',
         '["Proyecto", "Dirección de obra", "Certificación técnica"]'::jsonb)
 where intake_config is null
    or not (intake_config ? 'project_types');

-- 3) Comprobación
do $$
begin
  if exists (select 1 from public.empresas where not (coalesce(intake_config, '{}'::jsonb) ? 'project_types')) then
    raise exception '0022: quedan empresas sin la clave project_types';
  end if;
  raise notice 'Tipos de proyecto 0022: default aplicado y backfill completado';
end $$;
