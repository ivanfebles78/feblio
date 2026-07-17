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
