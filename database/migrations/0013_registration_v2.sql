-- Feblio · 0013 · Registro simplificado y primera entrada (bienvenida única)
--
-- Idempotente y compatible con Supabase alojado (sin GUC personalizados ni set_config).
-- Aplicar DESPUÉS de 0012. No modifica correos, roles, IDs ni relaciones existentes.
--
-- Qué cambia:
--   A) empresas.onboarding_welcome_seen_at: cuándo la cuenta vio la pantalla de bienvenida de
--      primera entrada (null = todavía no). Backfill: las empresas que ya habían entrado en
--      Feblio (onboarding_status <> 'not_started', incluidas las 'completed') quedan marcadas
--      para que NUNCA vean la nueva bienvenida.
--   B) La columna se protege con la misma guarda que el resto de columnas onboarding_*:
--      solo cambia mediante RPC (no por UPDATE directo desde el cliente).
--   C) RPC mark_onboarding_welcome_seen(): marca la bienvenida como vista para la empresa de la
--      sesión (una sola vez; reintentos devuelven la misma marca). Solo cuentas de empresa;
--      admin y clientes no la usan.
--
--   D) Corrección de 0011: feblio_trusted() quedó revocada a anon/authenticated, pero las guardas
--      (triggers BEFORE UPDATE sin SECURITY DEFINER) la invocan con el rol del usuario. Desde 0011
--      ninguna cuenta de empresa podía actualizar su propia fila de empresas ("permission denied
--      for function feblio_trusted"): datos de empresa, paso 1 del wizard y Configuración fallaban.
--      Se restaura EXECUTE (la función solo informa de si la sesión es de confianza; no es sensible).
--
-- El acceso al dashboard con onboarding incompleto lo decide el frontend (ya no hay
-- redirección obligatoria al wizard); en base de datos no existía ningún bloqueo que revertir.
--
-- Rollback lógico (si hiciera falta volver atrás):
--   drop function if exists public.mark_onboarding_welcome_seen();
--   -- (NO revocar de nuevo feblio_trusted(): rompería las actualizaciones de empresas)
--   -- volver a la guarda de 0009 (sin la columna nueva) y, opcionalmente:
--   alter table public.empresas drop column if exists onboarding_welcome_seen_at;
--   El frontend anterior ignora la columna, así que puede dejarse sin efecto secundario.

-- ===========================================================================
-- A) Columna + backfill
-- ===========================================================================
alter table public.empresas
  add column if not exists onboarding_welcome_seen_at timestamptz;

comment on column public.empresas.onboarding_welcome_seen_at is
  'Momento en que la cuenta vio la bienvenida de primera entrada (null = pendiente de mostrar). Solo vía RPC.';

-- Empresas que ya operaban antes de esta versión: nunca deben ver la bienvenida nueva.
update public.empresas
   set onboarding_welcome_seen_at = coalesce(onboarding_completed_at, onboarding_started_at, created_at, now())
 where onboarding_welcome_seen_at is null
   and onboarding_status <> 'not_started';

-- ===========================================================================
-- B) Guarda: la columna solo se modifica desde funciones del sistema
-- ===========================================================================
create or replace function public.guard_empresa_onboarding_columns()
returns trigger language plpgsql as $$
begin
  if public.feblio_trusted() or public.is_admin() then return new; end if;
  if new.onboarding_status is distinct from old.onboarding_status
     or new.onboarding_current_step is distinct from old.onboarding_current_step
     or new.onboarding_started_at is distinct from old.onboarding_started_at
     or new.onboarding_completed_at is distinct from old.onboarding_completed_at
     or new.onboarding_version is distinct from old.onboarding_version
     or new.onboarding_welcome_seen_at is distinct from old.onboarding_welcome_seen_at
     or new.email_verified is distinct from old.email_verified
     or new.subscription_status is distinct from old.subscription_status
     or new.trial_ends_at is distinct from old.trial_ends_at then
    raise exception 'Las columnas de estado de la empresa solo se modifican mediante funciones del sistema'
      using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.guard_empresa_onboarding_columns() from public, anon, authenticated;
drop trigger if exists empresas_guard_onboarding on public.empresas;
create trigger empresas_guard_onboarding before update on public.empresas
  for each row execute function public.guard_empresa_onboarding_columns();

-- ===========================================================================
-- D) feblio_trusted() debe poder evaluarse dentro de las guardas ejecutadas como el usuario
-- ===========================================================================
grant execute on function public.feblio_trusted() to anon, authenticated;

-- ===========================================================================
-- C) RPC: marcar la bienvenida como vista (idempotente, solo la propia empresa)
-- ===========================================================================
create or replace function public.mark_onboarding_welcome_seen()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_empresa uuid; v_seen timestamptz; v_status text;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if public.current_role_name() <> 'empresa' then
    raise exception 'Solo las cuentas de empresa tienen bienvenida de primera entrada' using errcode = '42501';
  end if;
  v_empresa := public.current_empresa_id();
  if v_empresa is null then raise exception 'Cuenta sin empresa' using errcode = '42501'; end if;

  -- Una sola vez: si ya estaba marcada, no se toca (reintentos devuelven la misma marca).
  update public.empresas
     set onboarding_welcome_seen_at = now()
   where id = v_empresa and onboarding_welcome_seen_at is null;

  select onboarding_welcome_seen_at, onboarding_status into v_seen, v_status
    from public.empresas where id = v_empresa;

  perform public.audit_log_internal(v_empresa, auth.uid(), 'onboarding.welcome_seen', 'empresas', v_empresa, 'ok',
    jsonb_build_object('onboarding_status', v_status));

  return jsonb_build_object('ok', true, 'seen_at', v_seen, 'onboarding_status', v_status);
end $$;
revoke all on function public.mark_onboarding_welcome_seen() from public, anon;
grant execute on function public.mark_onboarding_welcome_seen() to authenticated;

-- ===========================================================================
-- Comprobaciones (no fallan la migración; sirven para revisar el resultado)
-- ===========================================================================
do $$
declare n_col int; n_pending int; n_fn int;
begin
  select count(*) into n_col from information_schema.columns
   where table_schema = 'public' and table_name = 'empresas' and column_name = 'onboarding_welcome_seen_at';
  select count(*) into n_pending from public.empresas
   where onboarding_status <> 'not_started' and onboarding_welcome_seen_at is null;
  select count(*) into n_fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'mark_onboarding_welcome_seen';
  if not has_function_privilege('authenticated', 'public.feblio_trusted()', 'execute') then
    raise exception '0013: authenticated debe poder ejecutar feblio_trusted() (guardas de empresas/profiles)';
  end if;
  if n_col <> 1 or n_fn <> 1 or n_pending <> 0 then
    raise exception '0013: comprobación fallida (columna=%, funcion=%, empresas operativas sin marca=%)', n_col, n_fn, n_pending;
  end if;
end $$;
