-- Feblio · 0021 · Facturación con Stripe (suscripción 29,99 €/mes tras prueba de 14 días)
--
-- Idempotente. Aplicar DESPUÉS de 0020.
--
-- Qué crea:
--   A) empresas += stripe_customer_id, stripe_subscription_id, current_period_end.
--   B) Extiende la guarda de columnas de estado (0013) para que las tres nuevas también sean
--      solo-servidor: `authenticated` nunca las escribe directamente.
--   C) RPC solo service_role para el webhook y el checkout:
--        billing_set_customer(empresa, customer_id)
--        billing_apply_subscription(empresa, status, subscription_id, current_period_end)
--      Ambas escriben en contexto de confianza (service_role) y auditan sin secretos.
--
-- Qué NO hace: no guarda tarjetas ni datos de pago (viven en Stripe), no cobra por sí misma y no
-- cambia el flujo si estas estructuras no existen (el frontend lee subscription_status/trial_ends_at,
-- que ya existen desde 0008, y trata current_period_end como opcional).
--
-- subscription_status (0008): trial | active | past_due | canceled. Semántica de acceso:
--   trial + trial_ends_at futuro → acceso con aviso;   trial vencido → bloqueo (debe suscribirse);
--   active → acceso;   past_due → bloqueo (pago pendiente);   canceled → bloqueo.

-- ===========================================================================
-- 1) Columnas de Stripe en la empresa
-- ===========================================================================

alter table public.empresas
  add column if not exists stripe_customer_id     text,
  add column if not exists stripe_subscription_id text,
  add column if not exists current_period_end     timestamptz;

comment on column public.empresas.stripe_customer_id is 'ID de cliente en Stripe (cus_…). No es secreto; el pago vive en Stripe.';
comment on column public.empresas.stripe_subscription_id is 'ID de suscripción en Stripe (sub_…).';
comment on column public.empresas.current_period_end is 'Fin del periodo pagado actual, según Stripe.';

create index if not exists empresas_stripe_customer_idx on public.empresas (stripe_customer_id);
create unique index if not exists empresas_stripe_subscription_key on public.empresas (stripe_subscription_id)
  where stripe_subscription_id is not null;

-- ===========================================================================
-- 2) La guarda de estado protege también las columnas de Stripe
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
     or new.trial_ends_at is distinct from old.trial_ends_at
     or new.stripe_customer_id is distinct from old.stripe_customer_id
     or new.stripe_subscription_id is distinct from old.stripe_subscription_id
     or new.current_period_end is distinct from old.current_period_end then
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
-- 3) RPC de facturación (solo service_role: las llaman las Edge Functions)
-- ===========================================================================

-- Fija el customer de Stripe la primera vez (checkout). Idempotente.
create or replace function public.billing_set_customer(p_empresa uuid, p_customer text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_empresa is null or coalesce(p_customer, '') = '' then
    raise exception 'Parámetros inválidos' using errcode = '22023', detail = 'invalid_params';
  end if;
  update public.empresas set stripe_customer_id = p_customer
   where id = p_empresa and (stripe_customer_id is null or stripe_customer_id = p_customer);
  perform public.audit_log_internal(p_empresa, null, 'billing.customer_set', 'empresas', p_empresa, 'ok',
    jsonb_build_object('has_customer', true));
end $$;
revoke all on function public.billing_set_customer(uuid, text) from public, anon, authenticated;
grant execute on function public.billing_set_customer(uuid, text) to service_role;

-- Aplica el estado de la suscripción tal y como lo reporta Stripe (webhook). Nunca cambia
-- trial_ends_at (historial de la prueba) ni cobra: solo refleja el estado real.
create or replace function public.billing_apply_subscription(
  p_empresa uuid, p_status text, p_subscription text, p_period_end timestamptz)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_empresa is null then
    raise exception 'Empresa requerida' using errcode = '22023', detail = 'invalid_params';
  end if;
  if p_status not in ('trial', 'active', 'past_due', 'canceled') then
    raise exception 'Estado de suscripción no válido' using errcode = '22023', detail = 'invalid_subscription_status';
  end if;
  update public.empresas
     set subscription_status = p_status,
         stripe_subscription_id = coalesce(nullif(p_subscription, ''), stripe_subscription_id),
         current_period_end = coalesce(p_period_end, current_period_end)
   where id = p_empresa;
  if not found then
    raise exception 'Empresa no encontrada' using errcode = 'PT404', detail = 'company_not_found';
  end if;
  -- Auditoría sin datos de pago: solo el estado y el fin de periodo.
  perform public.audit_log_internal(p_empresa, null, 'billing.subscription_updated', 'empresas', p_empresa,
    case when p_status = 'past_due' then 'error' else 'ok' end,
    jsonb_build_object('status', p_status, 'period_end', p_period_end));
end $$;
revoke all on function public.billing_apply_subscription(uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.billing_apply_subscription(uuid, text, text, timestamptz) to service_role;

-- ===========================================================================
-- 4) Comprobaciones
-- ===========================================================================

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'empresas' and column_name = 'stripe_customer_id') then
    raise exception '0021: falta empresas.stripe_customer_id';
  end if;
  if not has_function_privilege('service_role', 'public.billing_apply_subscription(uuid, text, text, timestamptz)', 'execute') then
    raise exception '0021: service_role debe poder ejecutar billing_apply_subscription';
  end if;
  if has_function_privilege('authenticated', 'public.billing_apply_subscription(uuid, text, text, timestamptz)', 'execute') then
    raise exception '0021: authenticated no debe ejecutar billing_apply_subscription';
  end if;
  raise notice 'Facturación 0021: estructuras y permisos verificados';
end $$;
