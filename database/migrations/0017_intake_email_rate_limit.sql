-- Feblio · 0017 · Límite de frecuencia persistente y atómico para la Edge Function `send-intake-email`.
--
-- Idempotente (create or replace). Aplicar DESPUÉS de 0016. No crea tablas ni columnas; no modifica datos.
-- Reutiliza public.rate_limits (0014: key pk, window_start, hits; RLS activo; sin acceso para anon/authenticated).
--
-- Límites (ventana fija de 60 minutos):
--   · 5 intentos por usuario + formulario   (clave 'ie:u:<user_id>:i:<intake_id>')
--   · 30 intentos por empresa               (clave 'ie:e:<empresa_id>')
-- Comprobación CONJUNTA: se bloquean ambas filas (orden determinista por clave, evita deadlocks), se
-- evalúan los dos límites y solo si ambos permiten se incrementan los dos contadores exactamente una vez.
-- Un intento rechazado no consume ninguna cuota ni prolonga la ventana. Solo se almacenan UUID y contadores.
-- Devuelve jsonb {allowed:boolean, retry_after:int (1..3600, solo si bloqueado)}. Solo service_role.
-- Limpieza: al inicio se borran exclusivamente claves 'ie:%' con ventana vencida hace más de 1 día.

create or replace function public.intake_email_rate_check(p_user uuid, p_empresa uuid, p_intake uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c_user_max constant integer  := 5;
  c_user_win constant interval := interval '60 minutes';
  c_emp_max  constant integer  := 30;
  c_emp_win  constant interval := interval '60 minutes';
  k_user text;
  k_emp  text;
  ru public.rate_limits;
  re public.rate_limits;
  u_hits integer;
  e_hits integer;
  v_retry integer;
begin
  -- Cerrado por defecto ante entradas inválidas
  if p_user is null or p_empresa is null or p_intake is null then
    return jsonb_build_object('allowed', false, 'retry_after', 60);
  end if;

  k_user := 'ie:u:' || p_user::text || ':i:' || p_intake::text;
  k_emp  := 'ie:e:' || p_empresa::text;

  -- Limpieza oportunista (solo claves de este ámbito y ya vencidas; nunca las filas activas de nadie)
  delete from public.rate_limits where key like 'ie:%' and window_start < now() - interval '1 day';

  -- Garantiza la existencia de ambas filas sin contar nada (hits = 0), en orden determinista
  insert into public.rate_limits (key, window_start, hits)
  select k, now(), 0 from unnest(array[least(k_user, k_emp), greatest(k_user, k_emp)]) as k
  on conflict (key) do nothing;

  -- Bloqueo de las dos filas en orden determinista por clave (mismo orden en todas las llamadas → sin deadlocks)
  perform 1 from public.rate_limits where key in (k_user, k_emp) order by key for update;

  select * into ru from public.rate_limits where key = k_user;
  select * into re from public.rate_limits where key = k_emp;

  -- Ventana vencida → contador efectivo 0
  u_hits := case when ru.window_start < now() - c_user_win then 0 else ru.hits end;
  e_hits := case when re.window_start < now() - c_emp_win then 0 else re.hits end;

  if u_hits >= c_user_max then
    v_retry := least(3600, greatest(1, ceil(extract(epoch from (ru.window_start + c_user_win - now())))::integer));
    return jsonb_build_object('allowed', false, 'retry_after', v_retry);
  end if;
  if e_hits >= c_emp_max then
    v_retry := least(3600, greatest(1, ceil(extract(epoch from (re.window_start + c_emp_win - now())))::integer));
    return jsonb_build_object('allowed', false, 'retry_after', v_retry);
  end if;

  -- Permitido: ambos contadores +1 exactamente una vez; una ventana nueva empieza ahora
  update public.rate_limits
     set hits = u_hits + 1,
         window_start = case when u_hits = 0 then now() else window_start end
   where key = k_user;
  update public.rate_limits
     set hits = e_hits + 1,
         window_start = case when e_hits = 0 then now() else window_start end
   where key = k_emp;

  return jsonb_build_object('allowed', true);
end $$;

revoke all on function public.intake_email_rate_check(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.intake_email_rate_check(uuid, uuid, uuid) to service_role;

-- Comprobación final de permisos (falla la migración si no se cumplen)
do $$
begin
  if not has_function_privilege('service_role', 'public.intake_email_rate_check(uuid, uuid, uuid)', 'execute') then
    raise exception '0017: service_role debe poder ejecutar intake_email_rate_check';
  end if;
  if has_function_privilege('anon', 'public.intake_email_rate_check(uuid, uuid, uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.intake_email_rate_check(uuid, uuid, uuid)', 'execute') then
    raise exception '0017: anon/authenticated no deben poder ejecutar intake_email_rate_check';
  end if;
end $$;
