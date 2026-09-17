-- Feblio · 0009 · Wizard de configuración inicial, consentimientos, integraciones,
-- automatizaciones, facturación, prueba guiada y auditoría.
--
-- Idempotente: usa if-not-exists / create-or-replace. No borra datos.
-- Aplicar DESPUÉS de 0008_verificacion_y_prueba.sql.
-- No contiene credenciales. Los secretos de integraciones se cifran en Edge
-- Functions con APP_ENCRYPTION_KEY y se guardan en integration_credentials
-- (sin políticas RLS para clientes: solo service_role).

-- ===========================================================================
-- 0) Utilidades
-- ===========================================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Marca "confiable" para escrituras que solo deben venir de RPCs SECURITY DEFINER.
-- Los RPCs la activan con `set feblio.trusted = 'on'` en su cabecera, de modo que
-- Postgres la restaura al salir de la función (no queda activa en la transacción).
-- Los triggers de guarda la consultan.
create or replace function public.feblio_trusted()
returns boolean language sql stable as $$
  select coalesce(current_setting('feblio.trusted', true), '') = 'on'
      or coalesce(auth.role(), '') = 'service_role'
      -- Sesiones sin JWT (SQL Editor, migraciones, seeds) son privilegiadas por definición
      or auth.uid() is null;
$$;

-- IP / user-agent de la petición actual (PostgREST expone request.headers)
create or replace function public.request_ip()
returns inet language plpgsql stable as $$
declare v text;
begin
  v := split_part(coalesce(current_setting('request.headers', true)::jsonb->>'x-forwarded-for', ''), ',', 1);
  if v = '' then return null; end if;
  return trim(v)::inet;
exception when others then
  return null;
end $$;

create or replace function public.request_user_agent()
returns text language plpgsql stable as $$
begin
  return left(coalesce(current_setting('request.headers', true)::jsonb->>'user-agent', ''), 512);
exception when others then
  return null;
end $$;

-- ===========================================================================
-- 1) Configuración de plataforma (solo admin)
-- ===========================================================================
create table if not exists public.platform_settings (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
alter table public.platform_settings enable row level security;
drop policy if exists platform_settings_admin on public.platform_settings;
create policy platform_settings_admin on public.platform_settings for all
  using (public.is_admin()) with check (public.is_admin());

-- Modo de verificación de email: 'otp' (código de Feblio, por defecto) o
-- 'native' (confirmación por enlace de Supabase Auth). Ver docs/onboarding.md.
insert into public.platform_settings (key, value)
values ('email_verification_mode', '"otp"'::jsonb)
on conflict (key) do nothing;

-- ===========================================================================
-- 2) Empresas: datos de organización + estado del onboarding
-- ===========================================================================
alter table public.empresas
  add column if not exists entity_type              text,
  add column if not exists trade_name               text,
  add column if not exists country                  text not null default 'ES',
  add column if not exists province                 text,
  add column if not exists city                     text,
  add column if not exists postal_code              text,
  add column if not exists timezone                 text not null default 'Europe/Madrid',
  add column if not exists language                 text not null default 'es',
  add column if not exists currency                 text not null default 'EUR',
  add column if not exists primary_color            text,
  add column if not exists onboarding_status        text not null default 'not_started',
  add column if not exists onboarding_current_step  text,
  add column if not exists onboarding_started_at    timestamptz,
  add column if not exists onboarding_completed_at  timestamptz,
  add column if not exists onboarding_version       int not null default 1,
  add column if not exists updated_at               timestamptz not null default now();

alter table public.empresas drop constraint if exists empresas_entity_type_check;
alter table public.empresas add constraint empresas_entity_type_check
  check (entity_type is null or entity_type in ('company', 'self_employed'));

alter table public.empresas drop constraint if exists empresas_onboarding_status_check;
alter table public.empresas add constraint empresas_onboarding_status_check
  check (onboarding_status in ('not_started', 'in_progress', 'completed', 'requires_attention'));

alter table public.empresas drop constraint if exists empresas_currency_check;
alter table public.empresas add constraint empresas_currency_check
  check (currency ~ '^[A-Z]{3}$');

-- Rellena entity_type desde tax_type para filas existentes
update public.empresas set entity_type = case tax_type when 'CIF' then 'company' when 'NIF' then 'self_employed' end
where entity_type is null and tax_type in ('CIF', 'NIF');

drop trigger if exists empresas_set_updated_at on public.empresas;
create trigger empresas_set_updated_at before update on public.empresas
  for each row execute function public.set_updated_at();

-- Guarda: las columnas onboarding_* solo cambian a través de los RPCs.
create or replace function public.guard_empresa_onboarding_columns()
returns trigger language plpgsql as $$
begin
  if public.feblio_trusted() or public.is_admin() then return new; end if;
  if new.onboarding_status is distinct from old.onboarding_status
     or new.onboarding_current_step is distinct from old.onboarding_current_step
     or new.onboarding_started_at is distinct from old.onboarding_started_at
     or new.onboarding_completed_at is distinct from old.onboarding_completed_at
     or new.onboarding_version is distinct from old.onboarding_version
     or new.email_verified is distinct from old.email_verified
     or new.subscription_status is distinct from old.subscription_status
     or new.trial_ends_at is distinct from old.trial_ends_at then
    raise exception 'Las columnas de estado de la empresa solo se modifican mediante funciones del sistema'
      using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists empresas_guard_onboarding on public.empresas;
create trigger empresas_guard_onboarding before update on public.empresas
  for each row execute function public.guard_empresa_onboarding_columns();

-- ===========================================================================
-- 3) Perfiles: datos del propietario / contacto
-- ===========================================================================
alter table public.profiles
  add column if not exists contact_email        text,
  add column if not exists phone                text,
  add column if not exists job_title            text,
  add column if not exists is_onboarding_owner  boolean not null default false,
  add column if not exists updated_at           timestamptz not null default now();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- El perfil no puede cambiar su rol/empresa/email de acceso por sí mismo
create or replace function public.guard_profile_identity_columns()
returns trigger language plpgsql as $$
begin
  if public.feblio_trusted() or public.is_admin() then return new; end if;
  if new.role is distinct from old.role
     or new.empresa_id is distinct from old.empresa_id
     or new.cliente_id is distinct from old.cliente_id
     or new.email is distinct from old.email then
    raise exception 'No puedes modificar rol, empresa ni email de acceso desde el perfil'
      using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard_identity on public.profiles;
create trigger profiles_guard_identity before update on public.profiles
  for each row execute function public.guard_profile_identity_columns();

-- ===========================================================================
-- 4) Consentimientos (registro permanente, independiente de raw_user_meta_data)
-- ===========================================================================
create table if not exists public.consent_records (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete set null,
  empresa_id    uuid references public.empresas(id) on delete cascade,
  consent_type  text not null check (consent_type in ('terms_of_service', 'privacy_policy', 'marketing')),
  version       text not null,
  accepted      boolean not null,
  ip            inet,
  user_agent    text,
  source        text not null default 'signup',
  created_at    timestamptz not null default now()
);
create index if not exists consent_records_empresa_idx on public.consent_records (empresa_id, consent_type, created_at desc);
create index if not exists consent_records_user_idx on public.consent_records (user_id, consent_type);

alter table public.consent_records enable row level security;
drop policy if exists consent_records_select on public.consent_records;
create policy consent_records_select on public.consent_records for select
  using (public.is_admin() or user_id = auth.uid()
         or (public.current_role_name() = 'empresa' and empresa_id = public.current_empresa_id()));
-- Inserciones solo vía RPC record_consent()/trigger de registro.

-- ===========================================================================
-- 5) Pasos del onboarding
-- ===========================================================================
create table if not exists public.onboarding_steps (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references public.empresas(id) on delete cascade,
  step_key        text not null,
  status          text not null default 'pending',
  data            jsonb not null default '{}'::jsonb,
  errors          jsonb not null default '[]'::jsonb,
  started_at      timestamptz,
  completed_at    timestamptz,
  skipped_at      timestamptz,
  skipped_reason  text,
  updated_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (empresa_id, step_key)
);
alter table public.onboarding_steps drop constraint if exists onboarding_steps_status_check;
alter table public.onboarding_steps add constraint onboarding_steps_status_check
  check (status in ('pending', 'in_progress', 'completed', 'skipped', 'error', 'requires_attention'));
alter table public.onboarding_steps drop constraint if exists onboarding_steps_key_check;
alter table public.onboarding_steps add constraint onboarding_steps_key_check
  check (step_key in ('company', 'repository', 'email', 'whatsapp', 'sms', 'voice', 'forms', 'automation', 'billing', 'review'));
create index if not exists onboarding_steps_empresa_idx on public.onboarding_steps (empresa_id);

drop trigger if exists onboarding_steps_set_updated_at on public.onboarding_steps;
create trigger onboarding_steps_set_updated_at before update on public.onboarding_steps
  for each row execute function public.set_updated_at();

alter table public.onboarding_steps enable row level security;
drop policy if exists onboarding_steps_select on public.onboarding_steps;
create policy onboarding_steps_select on public.onboarding_steps for select
  using (public.is_admin() or (public.current_role_name() = 'empresa' and empresa_id = public.current_empresa_id()));
-- Escrituras solo vía RPC (save/complete/skip/reopen) → aíslan tenant y validan.

-- ===========================================================================
-- 6) Conexiones de integraciones / canales (sin secretos)
-- ===========================================================================
create table if not exists public.integration_connections (
  id                  uuid primary key default gen_random_uuid(),
  empresa_id          uuid not null references public.empresas(id) on delete cascade,
  kind                text not null,
  provider            text,
  status              text not null default 'not_configured',
  display_name        text,
  account_identifier  text,
  settings            jsonb not null default '{}'::jsonb,
  last_activity_at    timestamptz,
  last_test_at        timestamptz,
  last_test_ok        boolean,
  last_error          text,
  last_sync_at        timestamptz,
  token_expires_at    timestamptz,
  connected_at        timestamptz,
  disconnected_at     timestamptz,
  created_by          uuid references auth.users(id) on delete set null,
  updated_by          uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (empresa_id, kind)
);
alter table public.integration_connections drop constraint if exists integration_connections_kind_check;
alter table public.integration_connections add constraint integration_connections_kind_check
  check (kind in ('document_repository', 'email', 'whatsapp', 'sms', 'voice', 'payments'));
alter table public.integration_connections drop constraint if exists integration_connections_status_check;
alter table public.integration_connections add constraint integration_connections_status_check
  check (status in ('not_configured', 'pending_credentials', 'connecting', 'connected', 'degraded', 'expired', 'error', 'disconnected'));
create index if not exists integration_connections_empresa_idx on public.integration_connections (empresa_id);

drop trigger if exists integration_connections_set_updated_at on public.integration_connections;
create trigger integration_connections_set_updated_at before update on public.integration_connections
  for each row execute function public.set_updated_at();

alter table public.integration_connections enable row level security;
drop policy if exists integration_connections_select on public.integration_connections;
create policy integration_connections_select on public.integration_connections for select
  using (public.is_admin() or (public.current_role_name() = 'empresa' and empresa_id = public.current_empresa_id()));
-- Escrituras solo vía RPC upsert_integration_connection() o Edge Function (service_role).

-- Guarda: nadie marca 'connected' sin verificación real salvo proveedores internos
create or replace function public.guard_integration_status()
returns trigger language plpgsql as $$
declare internal_providers text[] := array['feblio_storage', 'feblio_inbox', 'manual', 'manual_log'];
begin
  if coalesce(auth.role(), '') = 'service_role' then return new; end if;
  if new.status in ('connected', 'connecting', 'degraded', 'expired')
     and not (new.provider = any(internal_providers)) then
    raise exception 'El estado % requiere una prueba de conexión real (Edge Function)', new.status
      using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists integration_connections_guard_status on public.integration_connections;
create trigger integration_connections_guard_status before insert or update on public.integration_connections
  for each row execute function public.guard_integration_status();

-- ===========================================================================
-- 7) Credenciales cifradas (solo service_role; sin políticas → ningún cliente)
-- ===========================================================================
create table if not exists public.integration_credentials (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas(id) on delete cascade,
  connection_id  uuid references public.integration_connections(id) on delete cascade,
  provider       text not null,
  ciphertext     text not null,      -- AES-GCM base64 (cifrado en Edge Function)
  iv             text not null,
  key_version    int not null default 1,
  expires_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists integration_credentials_conn_idx on public.integration_credentials (connection_id);
alter table public.integration_credentials enable row level security;
-- Sin políticas: authenticated/anon no pueden leer ni escribir.
revoke all on public.integration_credentials from anon, authenticated;

drop trigger if exists integration_credentials_set_updated_at on public.integration_credentials;
create trigger integration_credentials_set_updated_at before update on public.integration_credentials
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- 8) Reglas por canal + asignación de formulario
-- ===========================================================================
create table if not exists public.channel_rules (
  id                        uuid primary key default gen_random_uuid(),
  empresa_id                uuid not null references public.empresas(id) on delete cascade,
  channel                   text not null,
  default_form_template_id  uuid,
  form_selection_rule       jsonb not null default '{}'::jsonb,
  send_message_template     text,
  rules                     jsonb not null default '{}'::jsonb,
  created_by                uuid references auth.users(id) on delete set null,
  updated_by                uuid references auth.users(id) on delete set null,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (empresa_id, channel)
);
alter table public.channel_rules drop constraint if exists channel_rules_channel_check;
alter table public.channel_rules add constraint channel_rules_channel_check
  check (channel in ('email', 'whatsapp', 'sms', 'voice', 'public_form', 'manual'));
drop trigger if exists channel_rules_set_updated_at on public.channel_rules;
create trigger channel_rules_set_updated_at before update on public.channel_rules
  for each row execute function public.set_updated_at();
alter table public.channel_rules enable row level security;
drop policy if exists channel_rules_all on public.channel_rules;
create policy channel_rules_all on public.channel_rules for all
  using (public.is_admin() or (public.current_role_name() = 'empresa' and empresa_id = public.current_empresa_id()))
  with check (public.is_admin() or (public.current_role_name() = 'empresa' and empresa_id = public.current_empresa_id()));

-- ===========================================================================
-- 9) Plantillas de carpetas
-- ===========================================================================
create table if not exists public.folder_templates (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.empresas(id) on delete cascade,
  name          text not null,
  root_pattern  text not null default '/Proyectos/{codigo_proyecto}_{nombre_cliente}/',
  folders       jsonb not null default '[]'::jsonb,   -- ["01_Requerimiento", ...]
  is_default    boolean not null default false,
  created_by    uuid references auth.users(id) on delete set null,
  updated_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists folder_templates_empresa_idx on public.folder_templates (empresa_id);
drop trigger if exists folder_templates_set_updated_at on public.folder_templates;
create trigger folder_templates_set_updated_at before update on public.folder_templates
  for each row execute function public.set_updated_at();
alter table public.folder_templates enable row level security;
drop policy if exists folder_templates_all on public.folder_templates;
create policy folder_templates_all on public.folder_templates for all
  using (public.is_admin() or (public.current_role_name() = 'empresa' and empresa_id = public.current_empresa_id()))
  with check (public.is_admin() or (public.current_role_name() = 'empresa' and empresa_id = public.current_empresa_id()));

-- ===========================================================================
-- 10) Plantillas de formulario (amplía client_intake, no lo sustituye)
-- ===========================================================================
create table if not exists public.intake_form_templates (
  id                  uuid primary key default gen_random_uuid(),
  empresa_id          uuid not null references public.empresas(id) on delete cascade,
  key                 text not null,
  name                text not null,
  description         text,
  fields              jsonb not null default '[]'::jsonb,   -- [{key,label,type,required,options?,condition?}]
  required_documents  jsonb not null default '[]'::jsonb,   -- [{key,label,required}]
  consents            jsonb not null default '[]'::jsonb,   -- [{key,label,required}]
  link_expiry_days    int not null default 30 check (link_expiry_days between 1 and 365),
  reminders           jsonb not null default '{"enabled": true, "after_days": [3, 7]}'::jsonb,
  is_default          boolean not null default false,
  is_active           boolean not null default true,
  created_by          uuid references auth.users(id) on delete set null,
  updated_by          uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (empresa_id, key)
);
drop trigger if exists intake_form_templates_set_updated_at on public.intake_form_templates;
create trigger intake_form_templates_set_updated_at before update on public.intake_form_templates
  for each row execute function public.set_updated_at();
alter table public.intake_form_templates enable row level security;
drop policy if exists intake_form_templates_all on public.intake_form_templates;
create policy intake_form_templates_all on public.intake_form_templates for all
  using (public.is_admin() or (public.current_role_name() = 'empresa' and empresa_id = public.current_empresa_id()))
  with check (public.is_admin() or (public.current_role_name() = 'empresa' and empresa_id = public.current_empresa_id()));

alter table public.channel_rules drop constraint if exists channel_rules_form_fkey;
alter table public.channel_rules add constraint channel_rules_form_fkey
  foreign key (default_form_template_id) references public.intake_form_templates(id) on delete set null;

alter table public.client_intake
  add column if not exists form_template_id  uuid references public.intake_form_templates(id) on delete set null,
  add column if not exists channel           text,
  add column if not exists expires_at        timestamptz,
  add column if not exists is_test           boolean not null default false;

-- ===========================================================================
-- 11) Automatizaciones
-- ===========================================================================
create table if not exists public.automation_settings (
  empresa_id                   uuid primary key references public.empresas(id) on delete cascade,
  level                        int not null default 1 check (level between 1 and 3),
  auto_create_request          boolean not null default true,
  auto_create_project          boolean not null default false,
  auto_send_form               boolean not null default false,
  auto_request_missing_docs    boolean not null default false,
  auto_schedule_call           boolean not null default false,
  auto_draft_quote             boolean not null default true,
  auto_send_quote              boolean not null default false,
  auto_reminders               boolean not null default false,
  pause_outside_hours          boolean not null default true,
  require_human_approval       boolean not null default true,
  level3_scopes                jsonb not null default '[]'::jsonb,
  updated_by                   uuid references auth.users(id) on delete set null,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);
-- Coherencia: nivel 1 nunca envía nada automáticamente; nivel <3 exige aprobación.
alter table public.automation_settings drop constraint if exists automation_settings_level_coherence;
alter table public.automation_settings add constraint automation_settings_level_coherence
  check (
    (level = 1 and auto_send_form = false and auto_send_quote = false and require_human_approval = true)
    or (level = 2 and require_human_approval = true)
    or (level = 3)
  );
drop trigger if exists automation_settings_set_updated_at on public.automation_settings;
create trigger automation_settings_set_updated_at before update on public.automation_settings
  for each row execute function public.set_updated_at();
alter table public.automation_settings enable row level security;
drop policy if exists automation_settings_all on public.automation_settings;
create policy automation_settings_all on public.automation_settings for all
  using (public.is_admin() or (public.current_role_name() = 'empresa' and empresa_id = public.current_empresa_id()))
  with check (public.is_admin() or (public.current_role_name() = 'empresa' and empresa_id = public.current_empresa_id()));

-- ===========================================================================
-- 12) Facturación y pagos
-- ===========================================================================
create table if not exists public.billing_settings (
  empresa_id                uuid primary key references public.empresas(id) on delete cascade,
  quote_series              text not null default 'P',
  quote_next_number         int not null default 1 check (quote_next_number >= 1),
  invoice_series            text not null default 'F',
  invoice_next_number       int not null default 1 check (invoice_next_number >= 1),
  advance_invoice_series    text not null default 'A',
  advance_invoice_next      int not null default 1 check (advance_invoice_next >= 1),
  quote_validity_days       int not null default 30 check (quote_validity_days between 1 and 365),
  advance_percentage        numeric(5,2) not null default 50 check (advance_percentage between 0 and 100),
  payment_terms_days        int not null default 30 check (payment_terms_days between 0 and 365),
  currency                  text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  tax_type                  text not null default 'IGIC' check (tax_type in ('IGIC', 'IVA', 'IPSI', 'EXENTO', 'OTRO')),
  tax_rate                  numeric(5,2) not null default 7 check (tax_rate between 0 and 100),
  tax_exempt_reason         text,
  payment_methods           jsonb not null default '["transferencia"]'::jsonb,
  payment_gateway           text,                       -- stripe | null
  reminders                 jsonb not null default '{"enabled": true, "days_before_due": [3], "days_after_due": [1, 7]}'::jsonb,
  document_release_policy   text not null default 'on_confirmed_payment'
                            check (document_release_policy in ('on_confirmed_payment', 'on_proof_uploaded', 'manual')),
  review_before_issue       boolean not null default true,
  updated_by                uuid references auth.users(id) on delete set null,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
alter table public.billing_settings drop constraint if exists billing_settings_series_distinct;
alter table public.billing_settings add constraint billing_settings_series_distinct
  check (quote_series <> invoice_series and invoice_series <> advance_invoice_series and quote_series <> advance_invoice_series);
alter table public.billing_settings drop constraint if exists billing_settings_exempt_rate;
alter table public.billing_settings add constraint billing_settings_exempt_rate
  check (tax_type <> 'EXENTO' or tax_rate = 0);
drop trigger if exists billing_settings_set_updated_at on public.billing_settings;
create trigger billing_settings_set_updated_at before update on public.billing_settings
  for each row execute function public.set_updated_at();
alter table public.billing_settings enable row level security;
drop policy if exists billing_settings_all on public.billing_settings;
create policy billing_settings_all on public.billing_settings for all
  using (public.is_admin() or (public.current_role_name() = 'empresa' and empresa_id = public.current_empresa_id()))
  with check (public.is_admin() or (public.current_role_name() = 'empresa' and empresa_id = public.current_empresa_id()));

-- ===========================================================================
-- 13) Comprobaciones de salud de integraciones
-- ===========================================================================
create table if not exists public.integration_health_checks (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas(id) on delete cascade,
  connection_id  uuid references public.integration_connections(id) on delete cascade,
  kind           text not null,
  check_type     text not null default 'test',   -- test | health | oauth | webhook | send_test
  ok             boolean not null,
  result         jsonb not null default '{}'::jsonb,
  checked_by     uuid references auth.users(id) on delete set null,
  checked_at     timestamptz not null default now()
);
create index if not exists integration_health_checks_conn_idx on public.integration_health_checks (connection_id, checked_at desc);
alter table public.integration_health_checks enable row level security;
drop policy if exists integration_health_checks_select on public.integration_health_checks;
create policy integration_health_checks_select on public.integration_health_checks for select
  using (public.is_admin() or (public.current_role_name() = 'empresa' and empresa_id = public.current_empresa_id()));

-- ===========================================================================
-- 14) Ejecuciones de la prueba guiada
-- ===========================================================================
create table if not exists public.onboarding_test_runs (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas(id) on delete cascade,
  status         text not null default 'running' check (status in ('running', 'completed', 'failed', 'cleaned')),
  steps          jsonb not null default '[]'::jsonb,
  created_ids    jsonb not null default '{}'::jsonb,
  created_by     uuid references auth.users(id) on delete set null,
  started_at     timestamptz not null default now(),
  completed_at   timestamptz,
  cleaned_at     timestamptz
);
create index if not exists onboarding_test_runs_empresa_idx on public.onboarding_test_runs (empresa_id, started_at desc);
alter table public.onboarding_test_runs enable row level security;
drop policy if exists onboarding_test_runs_select on public.onboarding_test_runs;
create policy onboarding_test_runs_select on public.onboarding_test_runs for select
  using (public.is_admin() or (public.current_role_name() = 'empresa' and empresa_id = public.current_empresa_id()));

-- ===========================================================================
-- 15) Auditoría
-- ===========================================================================
create table if not exists public.audit_events (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid references public.empresas(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete set null,
  action       text not null,
  entity_type  text,
  entity_id    uuid,
  result       text not null default 'ok' check (result in ('ok', 'error', 'blocked')),
  metadata     jsonb not null default '{}'::jsonb,
  ip           inet,
  user_agent   text,
  created_at   timestamptz not null default now()
);
create index if not exists audit_events_empresa_idx on public.audit_events (empresa_id, created_at desc);
create index if not exists audit_events_action_idx on public.audit_events (action);
alter table public.audit_events enable row level security;
drop policy if exists audit_events_select on public.audit_events;
create policy audit_events_select on public.audit_events for select
  using (public.is_admin() or (public.current_role_name() = 'empresa' and empresa_id = public.current_empresa_id()));
-- Inserciones solo vía log_audit_event() / funciones del sistema.

-- Elimina del metadata cualquier clave que parezca un secreto
create or replace function public.strip_secret_keys(p jsonb)
returns jsonb language plpgsql immutable as $$
begin
  if p is null then return '{}'::jsonb; end if;
  if jsonb_typeof(p) <> 'object' then return p; end if;
  return coalesce(
    (select jsonb_object_agg(key, value)
       from jsonb_each(p)
      where key !~* '(token|secret|password|passwd|api[_-]?key|private|iban|authorization|cookie)'),
    '{}'::jsonb);
end $$;

create or replace function public.audit_log_internal(
  p_empresa_id uuid, p_user_id uuid, p_action text, p_entity_type text, p_entity_id uuid,
  p_result text, p_metadata jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into public.audit_events (empresa_id, user_id, action, entity_type, entity_id, result, metadata, ip, user_agent)
  values (p_empresa_id, p_user_id, p_action, p_entity_type, p_entity_id, coalesce(p_result, 'ok'),
          public.strip_secret_keys(p_metadata), public.request_ip(), public.request_user_agent())
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.audit_log_internal(uuid, uuid, text, text, uuid, text, jsonb) from public, anon, authenticated;

create or replace function public.log_audit_event(
  p_action text, p_entity_type text default null, p_entity_id uuid default null,
  p_result text default 'ok', p_metadata jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_empresa uuid := public.current_empresa_id();
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if p_action !~ '^[a-z0-9_.]{3,80}$' then raise exception 'Acción no válida'; end if;
  return public.audit_log_internal(v_empresa, auth.uid(), p_action, p_entity_type, p_entity_id, p_result, p_metadata);
end $$;
revoke all on function public.log_audit_event(text, text, uuid, text, jsonb) from public, anon;
grant execute on function public.log_audit_event(text, text, uuid, text, jsonb) to authenticated;

-- ===========================================================================
-- 16) Datos de prueba (sandbox) marcados
-- ===========================================================================
alter table public.clientes   add column if not exists is_test boolean not null default false;
alter table public.projects   add column if not exists is_test boolean not null default false;
alter table public.documents  add column if not exists is_test boolean not null default false;
alter table public.tasks      add column if not exists is_test boolean not null default false;

-- ===========================================================================
-- 17) Registro: handle_new_user con persona/empresa separadas + consentimientos
-- ===========================================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role        user_role := coalesce((new.raw_user_meta_data->>'role')::user_role, 'cliente');
  v_empresa     uuid;
  v_full_name   text := nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), '');
  v_company     text := nullif(trim(coalesce(new.raw_user_meta_data->>'company_name', '')), '');
  v_entity      text := nullif(new.raw_user_meta_data->>'entity_type', '');
  v_tax_type    text := nullif(new.raw_user_meta_data->>'tax_type', '');
  v_terms_ver   text := coalesce(nullif(new.raw_user_meta_data->>'terms_version', ''), 'unknown');
  v_priv_ver    text := coalesce(nullif(new.raw_user_meta_data->>'privacy_version', ''), v_terms_ver);
  v_terms       boolean := coalesce((new.raw_user_meta_data->>'terms_accepted')::boolean, false);
  v_marketing   boolean := coalesce((new.raw_user_meta_data->>'marketing_consent')::boolean, false);
  v_ua          text := left(coalesce(new.raw_user_meta_data->>'user_agent', ''), 512);
begin
  if v_entity is null and v_tax_type is not null then
    v_entity := case v_tax_type when 'CIF' then 'company' when 'NIF' then 'self_employed' end;
  end if;
  if v_tax_type is null and v_entity is not null then
    v_tax_type := case v_entity when 'company' then 'CIF' else 'NIF' end;
  end if;

  if v_role = 'empresa' then
    insert into public.empresas (name, cif, tax_type, entity_type, trial_ends_at, subscription_status, email_verified,
                                 onboarding_status)
    values (
      coalesce(v_company, v_full_name, new.email),
      nullif(upper(regexp_replace(coalesce(new.raw_user_meta_data->>'tax_id', ''), '[\s\-\.]', '', 'g')), ''),
      v_tax_type,
      v_entity,
      now() + interval '14 days',
      'trial',
      false,
      'not_started'
    )
    returning id into v_empresa;
  end if;

  insert into public.profiles (id, email, full_name, role, empresa_id, is_onboarding_owner)
  values (new.id, new.email, coalesce(v_full_name, new.email), v_role, v_empresa, v_role = 'empresa')
  on conflict (id) do nothing;

  -- Consentimientos: registro permanente (no depende de raw_user_meta_data)
  insert into public.consent_records (user_id, empresa_id, consent_type, version, accepted, user_agent, source)
  values
    (new.id, v_empresa, 'terms_of_service', v_terms_ver, v_terms, nullif(v_ua, ''), 'signup'),
    (new.id, v_empresa, 'privacy_policy',   v_priv_ver,  v_terms, nullif(v_ua, ''), 'signup'),
    (new.id, v_empresa, 'marketing',        v_terms_ver, v_marketing, nullif(v_ua, ''), 'signup');

  -- Auditoría del registro
  if v_empresa is not null then
    perform public.audit_log_internal(v_empresa, new.id, 'empresa.registered', 'empresas', v_empresa, 'ok',
      jsonb_build_object('entity_type', v_entity, 'tax_type', v_tax_type));
  end if;
  perform public.audit_log_internal(v_empresa, new.id,
    case when v_terms then 'consent.terms_accepted' else 'consent.terms_missing' end,
    'consent_records', null, case when v_terms then 'ok' else 'blocked' end,
    jsonb_build_object('terms_version', v_terms_ver, 'privacy_version', v_priv_ver));
  perform public.audit_log_internal(v_empresa, new.id,
    case when v_marketing then 'consent.marketing_accepted' else 'consent.marketing_rejected' end,
    'consent_records', null, 'ok', jsonb_build_object('version', v_terms_ver));

  return new;
end $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Registrar un consentimiento posterior (p. ej. cambio de preferencia de marketing)
create or replace function public.record_consent(p_type text, p_version text, p_accepted boolean, p_source text default 'settings')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_empresa uuid := public.current_empresa_id();
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if p_type not in ('terms_of_service', 'privacy_policy', 'marketing') then raise exception 'Tipo de consentimiento no válido'; end if;
  insert into public.consent_records (user_id, empresa_id, consent_type, version, accepted, ip, user_agent, source)
  values (auth.uid(), v_empresa, p_type, coalesce(nullif(p_version, ''), 'unknown'), p_accepted,
          public.request_ip(), public.request_user_agent(), coalesce(p_source, 'settings'))
  returning id into v_id;
  perform public.audit_log_internal(v_empresa, auth.uid(),
    'consent.' || p_type || '.' || case when p_accepted then 'accepted' else 'rejected' end,
    'consent_records', v_id, 'ok', jsonb_build_object('version', p_version, 'source', p_source));
  return v_id;
end $$;
revoke all on function public.record_consent(text, text, boolean, text) from public, anon;
grant execute on function public.record_consent(text, text, boolean, text) to authenticated;

-- ===========================================================================
-- 18) Verificación de email: una sola experiencia coherente
-- ===========================================================================
-- Estado de verificación + modo configurado (para que el frontend elija pantalla)
create or replace function public.get_verification_state()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_empresa uuid := public.current_empresa_id(); v_verified boolean; v_mode text;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  select coalesce(value #>> '{}', 'otp') into v_mode from public.platform_settings where key = 'email_verification_mode';
  if v_empresa is null then
    return jsonb_build_object('has_empresa', false, 'email_verified', true, 'mode', coalesce(v_mode, 'otp'));
  end if;
  select email_verified into v_verified from public.empresas where id = v_empresa;
  return jsonb_build_object('has_empresa', true, 'email_verified', coalesce(v_verified, false), 'mode', coalesce(v_mode, 'otp'));
end $$;
revoke all on function public.get_verification_state() from public, anon;
grant execute on function public.get_verification_state() to authenticated;

-- Si la plataforma usa la confirmación nativa de Supabase, reconocerla como verificación
-- (evita pedir un OTP adicional). Solo actúa en modo 'native'.
create or replace function public.claim_native_email_verification()
returns jsonb language plpgsql security definer set search_path = public set feblio.trusted = 'on' as $$
declare v_empresa uuid := public.current_empresa_id(); v_mode text; v_confirmed timestamptz;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  select coalesce(value #>> '{}', 'otp') into v_mode from public.platform_settings where key = 'email_verification_mode';
  if coalesce(v_mode, 'otp') <> 'native' then
    return jsonb_build_object('ok', false, 'error', 'La plataforma usa verificación por código.');
  end if;
  if v_empresa is null then return jsonb_build_object('ok', false, 'error', 'Cuenta sin empresa'); end if;
  select email_confirmed_at into v_confirmed from auth.users where id = auth.uid();
  if v_confirmed is null then return jsonb_build_object('ok', false, 'error', 'El email aún no está confirmado.'); end if;
    update public.empresas set email_verified = true where id = v_empresa and email_verified = false;
  perform public.audit_log_internal(v_empresa, auth.uid(), 'email.verified', 'empresas', v_empresa, 'ok', jsonb_build_object('mode', 'native'));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.claim_native_email_verification() from public, anon;
grant execute on function public.claim_native_email_verification() to authenticated;

-- verify_email_otp: igual que 0008 + marca de confianza + auditoría
create or replace function public.verify_email_otp(p_code text)
returns jsonb language plpgsql security definer set search_path = public set feblio.trusted = 'on' as $$
declare v_empresa uuid; v_otp public.email_otps;
begin
  select empresa_id into v_empresa from public.profiles where id = auth.uid();
  if v_empresa is null then return jsonb_build_object('ok', false, 'error', 'Cuenta sin empresa'); end if;

  select * into v_otp from public.email_otps where empresa_id = v_empresa;
  if not found then return jsonb_build_object('ok', false, 'error', 'No hay código pendiente. Reenvíalo.'); end if;
  if v_otp.expires_at < now() then return jsonb_build_object('ok', false, 'error', 'El código ha caducado. Reenvíalo.'); end if;
  if v_otp.attempts >= 5 then return jsonb_build_object('ok', false, 'error', 'Demasiados intentos. Reenvía un código nuevo.'); end if;

  if v_otp.code <> p_code then
    update public.email_otps set attempts = attempts + 1 where empresa_id = v_empresa;
    perform public.audit_log_internal(v_empresa, auth.uid(), 'email.otp_failed', 'empresas', v_empresa, 'error', '{}'::jsonb);
    return jsonb_build_object('ok', false, 'error', 'Código incorrecto.');
  end if;

    update public.empresas set email_verified = true where id = v_empresa;
  delete from public.email_otps where empresa_id = v_empresa;
  perform public.audit_log_internal(v_empresa, auth.uid(), 'email.verified', 'empresas', v_empresa, 'ok', jsonb_build_object('mode', 'otp'));
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.verify_email_otp(text) to authenticated;

-- ===========================================================================
-- 19) Onboarding · helpers internos
-- ===========================================================================
-- Empresa sobre la que actúa el RPC: la del usuario 'empresa', o la indicada si es admin.
create or replace function public.onboarding_target_empresa(p_empresa_id uuid default null)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if public.is_admin() and p_empresa_id is not null then return p_empresa_id; end if;
  if public.current_role_name() <> 'empresa' then
    raise exception 'Solo las cuentas de empresa gestionan el onboarding' using errcode = '42501';
  end if;
  v := public.current_empresa_id();
  if v is null then raise exception 'Cuenta sin empresa' using errcode = '42501'; end if;
  if p_empresa_id is not null and p_empresa_id <> v then
    raise exception 'No puedes acceder al onboarding de otra empresa' using errcode = '42501';
  end if;
  return v;
end $$;
revoke all on function public.onboarding_target_empresa(uuid) from public, anon, authenticated;

-- Crea filas por defecto (idempotente)
create or replace function public.ensure_onboarding_defaults(p_empresa uuid)
returns void language plpgsql security definer set search_path = public as $$
declare k text; v_form uuid;
begin
  foreach k in array array['company', 'repository', 'email', 'whatsapp', 'sms', 'voice', 'forms', 'automation', 'billing', 'review'] loop
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
revoke all on function public.ensure_onboarding_defaults(uuid) from public, anon, authenticated;

-- ===========================================================================
-- 20) Onboarding · RPCs públicos (authenticated)
-- ===========================================================================
create or replace function public.get_onboarding(p_empresa_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_empresa uuid := public.onboarding_target_empresa(p_empresa_id);
begin
  perform public.ensure_onboarding_defaults(v_empresa);
  return jsonb_build_object(
    'empresa', (select (to_jsonb(e) - 'iban') || jsonb_build_object('iban_masked',
                  case when e.iban is null or e.iban = '' then null
                       else repeat('•', greatest(length(e.iban) - 4, 0)) || right(e.iban, 4) end)
                from public.empresas e where e.id = v_empresa),
    'owner', (select jsonb_build_object('id', p.id, 'email', p.email, 'full_name', p.full_name,
                'contact_email', p.contact_email, 'phone', p.phone, 'job_title', p.job_title,
                'is_onboarding_owner', p.is_onboarding_owner)
              from public.profiles p where p.empresa_id = v_empresa and p.role = 'empresa'
              order by p.is_onboarding_owner desc, p.created_at asc limit 1),
    'steps', (select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at), '[]'::jsonb)
              from public.onboarding_steps s where s.empresa_id = v_empresa),
    'integrations', (select coalesce(jsonb_agg(to_jsonb(c) order by c.kind), '[]'::jsonb)
                     from public.integration_connections c where c.empresa_id = v_empresa),
    'automation', (select to_jsonb(a) from public.automation_settings a where a.empresa_id = v_empresa),
    'billing', (select to_jsonb(b) from public.billing_settings b where b.empresa_id = v_empresa),
    'folder_templates', (select coalesce(jsonb_agg(to_jsonb(f) order by f.created_at), '[]'::jsonb)
                         from public.folder_templates f where f.empresa_id = v_empresa),
    'form_templates', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb)
                       from public.intake_form_templates t where t.empresa_id = v_empresa),
    'channel_rules', (select coalesce(jsonb_agg(to_jsonb(r) order by r.channel), '[]'::jsonb)
                      from public.channel_rules r where r.empresa_id = v_empresa),
    'consents', (select jsonb_build_object(
                   'terms_of_service', exists (select 1 from public.consent_records c where c.empresa_id = v_empresa and c.consent_type = 'terms_of_service' and c.accepted),
                   'privacy_policy',   exists (select 1 from public.consent_records c where c.empresa_id = v_empresa and c.consent_type = 'privacy_policy' and c.accepted),
                   'marketing',        coalesce((select c.accepted from public.consent_records c where c.empresa_id = v_empresa and c.consent_type = 'marketing' order by c.created_at desc limit 1), false))),
    'last_test_run', (select to_jsonb(r) from public.onboarding_test_runs r where r.empresa_id = v_empresa order by r.started_at desc limit 1)
  );
end $$;
revoke all on function public.get_onboarding(uuid) from public, anon;
grant execute on function public.get_onboarding(uuid) to authenticated;

-- Guardar datos de un paso (autoguardado). No cambia a completed.
create or replace function public.save_onboarding_step(p_step_key text, p_data jsonb, p_empresa_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public set feblio.trusted = 'on' as $$
declare v_empresa uuid := public.onboarding_target_empresa(p_empresa_id); v_row public.onboarding_steps;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'Datos del paso no válidos'; end if;
  if p_data::text ~* '"(token|secret|password|api[_-]?key)"' then
    raise exception 'Los datos del paso no pueden contener secretos' using errcode = '22023';
  end if;
  perform public.ensure_onboarding_defaults(v_empresa);
  
  update public.onboarding_steps
     set data = p_data,
         status = case when status in ('pending', 'skipped') then 'in_progress' else status end,
         started_at = coalesce(started_at, now()),
         skipped_at = null, skipped_reason = null,
         updated_by = auth.uid()
   where empresa_id = v_empresa and step_key = p_step_key
   returning * into v_row;
  if not found then raise exception 'Paso desconocido: %', p_step_key; end if;

  update public.empresas
     set onboarding_status = case when onboarding_status = 'completed' then 'completed' else 'in_progress' end,
         onboarding_current_step = p_step_key,
         onboarding_started_at = coalesce(onboarding_started_at, now())
   where id = v_empresa;
  return to_jsonb(v_row);
end $$;
revoke all on function public.save_onboarding_step(text, jsonb, uuid) from public, anon;
grant execute on function public.save_onboarding_step(text, jsonb, uuid) to authenticated;

create or replace function public.complete_onboarding_step(p_step_key text, p_data jsonb default null, p_empresa_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public set feblio.trusted = 'on' as $$
declare v_empresa uuid := public.onboarding_target_empresa(p_empresa_id); v_row public.onboarding_steps;
begin
  perform public.ensure_onboarding_defaults(v_empresa);
    update public.onboarding_steps
     set data = coalesce(p_data, data),
         status = 'completed', errors = '[]'::jsonb,
         started_at = coalesce(started_at, now()), completed_at = now(),
         skipped_at = null, skipped_reason = null, updated_by = auth.uid()
   where empresa_id = v_empresa and step_key = p_step_key
   returning * into v_row;
  if not found then raise exception 'Paso desconocido: %', p_step_key; end if;
  update public.empresas
     set onboarding_status = case when onboarding_status = 'completed' then 'completed' else 'in_progress' end,
         onboarding_started_at = coalesce(onboarding_started_at, now())
   where id = v_empresa;
  perform public.audit_log_internal(v_empresa, auth.uid(), 'onboarding.step_completed', 'onboarding_steps', v_row.id, 'ok',
    jsonb_build_object('step_key', p_step_key));
  return to_jsonb(v_row);
end $$;
revoke all on function public.complete_onboarding_step(text, jsonb, uuid) from public, anon;
grant execute on function public.complete_onboarding_step(text, jsonb, uuid) to authenticated;

create or replace function public.skip_onboarding_step(p_step_key text, p_reason text default null, p_empresa_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public set feblio.trusted = 'on' as $$
declare v_empresa uuid := public.onboarding_target_empresa(p_empresa_id); v_row public.onboarding_steps;
begin
  if p_step_key in ('company', 'billing', 'review') then
    raise exception 'El paso % es obligatorio y no puede omitirse', p_step_key using errcode = '22023';
  end if;
  perform public.ensure_onboarding_defaults(v_empresa);
    update public.onboarding_steps
     set status = 'skipped', skipped_at = now(), skipped_reason = left(p_reason, 300), updated_by = auth.uid()
   where empresa_id = v_empresa and step_key = p_step_key
   returning * into v_row;
  if not found then raise exception 'Paso desconocido: %', p_step_key; end if;
  update public.empresas
     set onboarding_status = case when onboarding_status = 'completed' then 'completed' else 'in_progress' end,
         onboarding_started_at = coalesce(onboarding_started_at, now())
   where id = v_empresa;
  perform public.audit_log_internal(v_empresa, auth.uid(), 'onboarding.step_skipped', 'onboarding_steps', v_row.id, 'ok',
    jsonb_build_object('step_key', p_step_key, 'reason', p_reason));
  return to_jsonb(v_row);
end $$;
revoke all on function public.skip_onboarding_step(text, text, uuid) from public, anon;
grant execute on function public.skip_onboarding_step(text, text, uuid) to authenticated;

create or replace function public.reopen_onboarding_step(p_step_key text, p_empresa_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public set feblio.trusted = 'on' as $$
declare v_empresa uuid := public.onboarding_target_empresa(p_empresa_id); v_row public.onboarding_steps;
begin
    update public.onboarding_steps
     set status = 'in_progress', completed_at = null, skipped_at = null, skipped_reason = null, updated_by = auth.uid()
   where empresa_id = v_empresa and step_key = p_step_key
   returning * into v_row;
  if not found then raise exception 'Paso desconocido: %', p_step_key; end if;
  update public.empresas set onboarding_current_step = p_step_key where id = v_empresa;
  perform public.audit_log_internal(v_empresa, auth.uid(), 'onboarding.step_reopened', 'onboarding_steps', v_row.id, 'ok',
    jsonb_build_object('step_key', p_step_key));
  return to_jsonb(v_row);
end $$;
revoke all on function public.reopen_onboarding_step(text, uuid) from public, anon;
grant execute on function public.reopen_onboarding_step(text, uuid) to authenticated;

-- Marca un paso con error / requiere atención (p. ej. tras una prueba fallida)
create or replace function public.flag_onboarding_step(p_step_key text, p_status text, p_errors jsonb default '[]'::jsonb, p_empresa_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public set feblio.trusted = 'on' as $$
declare v_empresa uuid := public.onboarding_target_empresa(p_empresa_id); v_row public.onboarding_steps;
begin
  if p_status not in ('error', 'requires_attention', 'in_progress') then raise exception 'Estado no permitido'; end if;
    update public.onboarding_steps
     set status = p_status, errors = public.strip_secret_keys(coalesce(p_errors, '[]'::jsonb)) , updated_by = auth.uid()
   where empresa_id = v_empresa and step_key = p_step_key
   returning * into v_row;
  if not found then raise exception 'Paso desconocido: %', p_step_key; end if;
  return to_jsonb(v_row);
end $$;
revoke all on function public.flag_onboarding_step(text, text, jsonb, uuid) from public, anon;
grant execute on function public.flag_onboarding_step(text, text, jsonb, uuid) to authenticated;

-- Reabrir la configuración inicial completa desde Configuración
create or replace function public.reopen_onboarding(p_empresa_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public set feblio.trusted = 'on' as $$
declare v_empresa uuid := public.onboarding_target_empresa(p_empresa_id);
begin
    update public.empresas
     set onboarding_status = 'in_progress', onboarding_current_step = 'review', onboarding_completed_at = null
   where id = v_empresa;
  perform public.audit_log_internal(v_empresa, auth.uid(), 'onboarding.reopened', 'empresas', v_empresa, 'ok', '{}'::jsonb);
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.reopen_onboarding(uuid) from public, anon;
grant execute on function public.reopen_onboarding(uuid) to authenticated;

-- Bloqueos para activar (fuente de verdad en servidor)
create or replace function public.onboarding_blockers(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare e public.empresas; b jsonb := '[]'::jsonb; v_owner text; v_repo public.integration_connections;
        v_has_request_method boolean; v_terms boolean; v_privacy boolean; v_voice text;
begin
  select * into e from public.empresas where id = p_empresa;
  select full_name into v_owner from public.profiles where empresa_id = p_empresa and role = 'empresa' order by is_onboarding_owner desc limit 1;

  if nullif(trim(coalesce(e.name, '')), '') is null or nullif(coalesce(e.cif, ''), '') is null
     or e.entity_type is null or nullif(coalesce(v_owner, ''), '') is null then
    b := b || jsonb_build_object('code', 'essential_data', 'step', 'company',
           'message', 'Faltan datos esenciales de la empresa o del propietario (razón social, NIF fiscal, tipo de titular, nombre).');
  end if;

  select * into v_repo from public.integration_connections where empresa_id = p_empresa and kind = 'document_repository';
  if v_repo.provider is null or v_repo.status in ('not_configured', 'disconnected') then
    b := b || jsonb_build_object('code', 'no_repository', 'step', 'repository',
           'message', 'Elige un repositorio documental (por ejemplo, el almacenamiento interno de Feblio).');
  end if;

  select coalesce(settings->>'mode', '') into v_voice from public.integration_connections where empresa_id = p_empresa and kind = 'voice';
  v_has_request_method :=
       exists (select 1 from public.onboarding_steps s where s.empresa_id = p_empresa and s.step_key = 'forms' and s.status = 'completed')
    or exists (select 1 from public.integration_connections c where c.empresa_id = p_empresa and c.kind in ('email', 'whatsapp', 'sms') and c.status = 'connected')
    or exists (select 1 from public.integration_connections c where c.empresa_id = p_empresa and c.kind = 'voice' and c.provider in ('manual', 'manual_log') and c.status = 'connected');
  if not v_has_request_method then
    b := b || jsonb_build_object('code', 'no_request_method', 'step', 'forms',
           'message', 'Debe existir al menos un método para crear solicitudes (formulario público, registro manual de llamadas o un canal conectado).');
  end if;

  if exists (select 1 from public.onboarding_steps s where s.empresa_id = p_empresa and s.status = 'error') then
    b := b || jsonb_build_object('code', 'step_errors', 'step', 'review',
           'message', 'Hay pasos con errores críticos que deben resolverse antes de activar.');
  end if;

  select exists (select 1 from public.consent_records c where c.empresa_id = p_empresa and c.consent_type = 'terms_of_service' and c.accepted),
         exists (select 1 from public.consent_records c where c.empresa_id = p_empresa and c.consent_type = 'privacy_policy' and c.accepted)
    into v_terms, v_privacy;
  if not (v_terms and v_privacy) then
    b := b || jsonb_build_object('code', 'consents_missing', 'step', 'company',
           'message', 'La empresa debe aceptar los Términos del servicio y la Política de privacidad.');
  end if;

  if not coalesce(e.email_verified, false) then
    b := b || jsonb_build_object('code', 'email_not_verified', 'step', 'company', 'message', 'El email no está verificado.');
  end if;
  return b;
end $$;
revoke all on function public.onboarding_blockers(uuid) from public, anon, authenticated;

create or replace function public.get_onboarding_blockers(p_empresa_id uuid default null)
returns jsonb language sql security definer set search_path = public as $$
  select public.onboarding_blockers(public.onboarding_target_empresa(p_empresa_id));
$$;
revoke all on function public.get_onboarding_blockers(uuid) from public, anon;
grant execute on function public.get_onboarding_blockers(uuid) to authenticated;

create or replace function public.activate_onboarding(p_empresa_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public set feblio.trusted = 'on' as $$
declare v_empresa uuid := public.onboarding_target_empresa(p_empresa_id); v_b jsonb; v_level int;
begin
  v_b := public.onboarding_blockers(v_empresa);
  if jsonb_array_length(v_b) > 0 then
    perform public.audit_log_internal(v_empresa, auth.uid(), 'onboarding.activation_blocked', 'empresas', v_empresa, 'blocked',
      jsonb_build_object('blockers', v_b));
    return jsonb_build_object('ok', false, 'blockers', v_b);
  end if;
    update public.onboarding_steps set status = 'completed', completed_at = coalesce(completed_at, now()), updated_by = auth.uid()
   where empresa_id = v_empresa and step_key = 'review';
  update public.empresas
     set onboarding_status = 'completed', onboarding_completed_at = now(), onboarding_current_step = null
   where id = v_empresa;
  select level into v_level from public.automation_settings where empresa_id = v_empresa;
  perform public.audit_log_internal(v_empresa, auth.uid(), 'onboarding.activated', 'empresas', v_empresa, 'ok',
    jsonb_build_object('automation_level', v_level,
      'skipped_steps', (select coalesce(jsonb_agg(step_key), '[]'::jsonb) from public.onboarding_steps where empresa_id = v_empresa and status = 'skipped')));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.activate_onboarding(uuid) from public, anon;
grant execute on function public.activate_onboarding(uuid) to authenticated;

-- ===========================================================================
-- 21) Integraciones · RPC de configuración (sin secretos, sin 'connected' externo)
-- ===========================================================================
create or replace function public.upsert_integration_connection(
  p_kind text, p_provider text, p_status text, p_settings jsonb default '{}'::jsonb,
  p_account_identifier text default null, p_display_name text default null, p_empresa_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_empresa uuid := public.onboarding_target_empresa(p_empresa_id); v_row public.integration_connections;
        internal_providers text[] := array['feblio_storage', 'feblio_inbox', 'manual', 'manual_log'];
        v_old public.integration_connections;
begin
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then raise exception 'Configuración no válida'; end if;
  if p_settings::text ~* '"(access_token|refresh_token|client_secret|api_key|secret|password)"' then
    raise exception 'La configuración no puede contener secretos; usa la Edge Function de integraciones' using errcode = '22023';
  end if;
  -- El cliente solo puede fijar estados sin verificación externa
  if p_status not in ('not_configured', 'pending_credentials', 'disconnected', 'connected') then
    raise exception 'Estado % no permitido desde el cliente', p_status using errcode = '42501';
  end if;
  if p_status = 'connected' and not (p_provider = any(internal_providers)) then
    raise exception 'El proveedor % requiere una prueba de conexión real antes de marcarse como conectado', p_provider using errcode = '42501';
  end if;
  perform public.ensure_onboarding_defaults(v_empresa);
  select * into v_old from public.integration_connections where empresa_id = v_empresa and kind = p_kind;

  update public.integration_connections
     set provider = p_provider,
         status = p_status,
         settings = p_settings,
         account_identifier = coalesce(p_account_identifier, account_identifier),
         display_name = coalesce(p_display_name, display_name),
         last_error = case when p_status in ('connected', 'not_configured') then null else last_error end,
         connected_at = case when p_status = 'connected' then coalesce(connected_at, now()) else connected_at end,
         disconnected_at = case when p_status = 'disconnected' then now() else null end,
         last_test_at = case when p_status = 'connected' and p_provider = any(internal_providers) then now() else last_test_at end,
         last_test_ok = case when p_status = 'connected' and p_provider = any(internal_providers) then true else last_test_ok end,
         updated_by = auth.uid()
   where empresa_id = v_empresa and kind = p_kind
   returning * into v_row;
  if not found then raise exception 'Canal desconocido: %', p_kind; end if;

  if p_status = 'disconnected' then
    delete from public.integration_credentials where connection_id = v_row.id;
  end if;

  perform public.audit_log_internal(v_empresa, auth.uid(),
    case when p_status = 'connected' then 'integration.connected'
         when p_status = 'disconnected' then 'integration.disconnected'
         else 'integration.configured' end,
    'integration_connections', v_row.id, 'ok',
    jsonb_build_object('kind', p_kind, 'provider', p_provider, 'status', p_status,
      'previous_status', v_old.status));
  return to_jsonb(v_row);
end $$;
revoke all on function public.upsert_integration_connection(text, text, text, jsonb, text, text, uuid) from public, anon;
grant execute on function public.upsert_integration_connection(text, text, text, jsonb, text, text, uuid) to authenticated;

-- Actualizar solo los ajustes (sin secretos) de una conexión, sin tocar su estado
create or replace function public.update_integration_settings(p_kind text, p_settings jsonb, p_account_identifier text default null, p_empresa_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_empresa uuid := public.onboarding_target_empresa(p_empresa_id); v_row public.integration_connections;
begin
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then raise exception 'Configuración no válida'; end if;
  if p_settings::text ~* '"(access_token|refresh_token|client_secret|api_key|secret|password)"' then
    raise exception 'La configuración no puede contener secretos' using errcode = '22023';
  end if;
  perform public.ensure_onboarding_defaults(v_empresa);
  update public.integration_connections
     set settings = p_settings,
         account_identifier = coalesce(p_account_identifier, account_identifier),
         updated_by = auth.uid()
   where empresa_id = v_empresa and kind = p_kind
   returning * into v_row;
  if not found then raise exception 'Canal desconocido: %', p_kind; end if;
  perform public.audit_log_internal(v_empresa, auth.uid(), 'integration.settings_changed', 'integration_connections', v_row.id, 'ok',
    jsonb_build_object('kind', p_kind));
  return to_jsonb(v_row);
end $$;
revoke all on function public.update_integration_settings(text, jsonb, text, uuid) from public, anon;
grant execute on function public.update_integration_settings(text, jsonb, text, uuid) to authenticated;

-- Registrar el resultado de una prueba interna (solo proveedores internos; los externos van por Edge Function)
create or replace function public.record_internal_health_check(p_kind text, p_ok boolean, p_result jsonb default '{}'::jsonb, p_empresa_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_empresa uuid := public.onboarding_target_empresa(p_empresa_id); v_conn public.integration_connections; v_id uuid;
begin
  select * into v_conn from public.integration_connections where empresa_id = v_empresa and kind = p_kind;
  if not found then raise exception 'Canal desconocido'; end if;
  if not (v_conn.provider = any(array['feblio_storage', 'feblio_inbox', 'manual', 'manual_log'])) then
    raise exception 'Las pruebas de proveedores externos se ejecutan en la Edge Function' using errcode = '42501';
  end if;
  insert into public.integration_health_checks (empresa_id, connection_id, kind, check_type, ok, result, checked_by)
  values (v_empresa, v_conn.id, p_kind, 'test', p_ok, public.strip_secret_keys(p_result), auth.uid())
  returning id into v_id;
  update public.integration_connections
     set last_test_at = now(), last_test_ok = p_ok,
         last_error = case when p_ok then null else left(coalesce(p_result->>'error', 'Prueba fallida'), 500) end,
         status = case when p_ok then 'connected' else 'error' end,
         updated_by = auth.uid()
   where id = v_conn.id;
  perform public.audit_log_internal(v_empresa, auth.uid(), 'integration.tested', 'integration_connections', v_conn.id,
    case when p_ok then 'ok' else 'error' end, jsonb_build_object('kind', p_kind, 'ok', p_ok));
  return jsonb_build_object('ok', p_ok, 'id', v_id);
end $$;
revoke all on function public.record_internal_health_check(text, boolean, jsonb, uuid) from public, anon;
grant execute on function public.record_internal_health_check(text, boolean, jsonb, uuid) to authenticated;

-- ===========================================================================
-- 22) Solicitud creada desde una llamada (registro manual)
-- ===========================================================================
create or replace function public.create_request_from_call(p_data jsonb, p_empresa_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_empresa uuid := public.onboarding_target_empresa(p_empresa_id); v_cliente uuid; v_intake public.client_intake;
        v_task uuid; v_form uuid; v_is_test boolean := coalesce((p_data->>'is_test')::boolean, false);
begin
  if nullif(trim(coalesce(p_data->>'name', '')), '') is null then raise exception 'El nombre del cliente es obligatorio'; end if;
  if not coalesce((p_data->>'consent')::boolean, false) then raise exception 'Es necesario registrar el consentimiento del cliente'; end if;

  insert into public.clientes (empresa_id, name, email, phone, is_test)
  values (v_empresa, trim(p_data->>'name'), nullif(p_data->>'email', ''), nullif(p_data->>'phone', ''), v_is_test)
  returning id into v_cliente;

  select id into v_form from public.intake_form_templates
   where empresa_id = v_empresa and (id::text = p_data->>'form_template_id' or (p_data->>'form_template_id' is null and is_default))
   limit 1;

  insert into public.client_intake (empresa_id, client_email, form_template_id, channel, is_test, expires_at)
  values (v_empresa, nullif(p_data->>'email', ''), v_form, 'voice', v_is_test, now() + interval '30 days')
  returning * into v_intake;

  insert into public.tasks (empresa_id, type, title, detail, priority, related_id, is_test)
  values (v_empresa, 'nuevo_cliente', 'Solicitud por llamada: ' || trim(p_data->>'name'),
          coalesce(nullif(p_data->>'reason', ''), 'Llamada registrada manualmente.')
            || case when nullif(p_data->>'notes', '') is not null then E'\n' || (p_data->>'notes') else '' end
            || E'\nEnviar formulario por: ' || coalesce(p_data->>'send_via', 'copiar enlace'),
          1, v_cliente, v_is_test)
  returning id into v_task;

  perform public.audit_log_internal(v_empresa, auth.uid(), 'request.created_from_call', 'client_intake', v_intake.id, 'ok',
    jsonb_build_object('send_via', p_data->>'send_via', 'is_test', v_is_test));
  return jsonb_build_object('ok', true, 'cliente_id', v_cliente, 'intake_id', v_intake.id, 'token', v_intake.token, 'task_id', v_task);
end $$;
revoke all on function public.create_request_from_call(jsonb, uuid) from public, anon;
grant execute on function public.create_request_from_call(jsonb, uuid) to authenticated;

-- ===========================================================================
-- 23) Prueba guiada (sandbox) y limpieza
-- ===========================================================================
create or replace function public.run_onboarding_test(p_empresa_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_empresa uuid := public.onboarding_target_empresa(p_empresa_id);
        v_run uuid; v_cliente uuid; v_intake public.client_intake; v_project uuid; v_quote uuid; v_prov uuid; v_task uuid;
        v_billing public.billing_settings; v_steps jsonb := '[]'::jsonb; v_form uuid; v_amount numeric := 1000;
        v_tax numeric; v_advance numeric;
begin
  perform public.ensure_onboarding_defaults(v_empresa);
  select * into v_billing from public.billing_settings where empresa_id = v_empresa;
  v_tax := case when v_billing.tax_type = 'EXENTO' then 0 else round(v_amount * v_billing.tax_rate / 100, 2) end;
  v_advance := round((v_amount + v_tax) * v_billing.advance_percentage / 100, 2);

  insert into public.onboarding_test_runs (empresa_id, created_by) values (v_empresa, auth.uid()) returning id into v_run;

  -- 1) Solicitud ficticia
  insert into public.clientes (empresa_id, name, email, phone, is_test)
  values (v_empresa, '[PRUEBA] Cliente de ejemplo', 'prueba@example.invalid', '+34600000000', true)
  returning id into v_cliente;
  v_steps := v_steps || jsonb_build_object('key', 'create_request', 'label', 'Crear solicitud ficticia', 'ok', true);

  -- 2/3) Formulario abierto y completado con datos ficticios
  select id into v_form from public.intake_form_templates where empresa_id = v_empresa and is_default limit 1;
  insert into public.client_intake (empresa_id, client_email, form_template_id, channel, is_test, status, submitted, cliente_id, completed_at, expires_at)
  values (v_empresa, 'prueba@example.invalid', v_form, 'public_form', true, 'completado',
          jsonb_build_object('name', '[PRUEBA] Cliente de ejemplo', 'email', 'prueba@example.invalid', 'phone', '+34600000000',
                             'description', 'Solicitud de prueba generada por el asistente de configuración.', 'files', '[]'::jsonb),
          v_cliente, now(), now() + interval '1 day')
  returning * into v_intake;
  v_steps := v_steps || jsonb_build_object('key', 'open_form', 'label', 'Abrir formulario', 'ok', true, 'token', v_intake.token);
  v_steps := v_steps || jsonb_build_object('key', 'fill_form', 'label', 'Completar datos ficticios', 'ok', true);

  -- 4) Proyecto (la carpeta la crea el frontend en el repositorio elegido)
  insert into public.projects (empresa_id, cliente_id, name, status, budget_total, is_test)
  values (v_empresa, v_cliente, '[PRUEBA] Proyecto de ejemplo', 'borrador', v_amount, true)
  returning id into v_project;
  v_steps := v_steps || jsonb_build_object('key', 'create_folder', 'label', 'Crear carpeta del proyecto', 'ok', true, 'project_id', v_project);

  -- 5/6) Documento pendiente detectado → petición de información
  insert into public.tasks (empresa_id, type, title, detail, priority, related_id, is_test)
  values (v_empresa, 'revision', '[PRUEBA] Documento pendiente: documento de identidad',
          'El asistente detectó que falta un documento y creó esta petición de información.', 2, v_project, true)
  returning id into v_task;
  v_steps := v_steps || jsonb_build_object('key', 'detect_missing', 'label', 'Detectar documento pendiente', 'ok', true);
  v_steps := v_steps || jsonb_build_object('key', 'request_info', 'label', 'Crear petición de información', 'ok', true, 'task_id', v_task);

  -- 7) Presupuesto de prueba (borrador) → 8) aprobación simulada
  insert into public.documents (empresa_id, project_id, type, name, amount, status, is_test)
  values (v_empresa, v_project, 'presupuesto',
          '[PRUEBA] ' || v_billing.quote_series || '-' || lpad(v_billing.quote_next_number::text, 4, '0') || '.pdf',
          v_amount + v_tax, 'aprobado', true)
  returning id into v_quote;
  v_steps := v_steps || jsonb_build_object('key', 'draft_quote', 'label', 'Crear presupuesto de prueba', 'ok', true,
    'amount', v_amount, 'tax', v_tax, 'tax_type', v_billing.tax_type, 'tax_rate', v_billing.tax_rate);
  v_steps := v_steps || jsonb_build_object('key', 'approve_quote', 'label', 'Simular aprobación', 'ok', true);

  -- 9) Provisión de fondos (anticipo) simulada: justificante ≠ pago confirmado
  insert into public.documents (empresa_id, project_id, type, name, amount, status, is_test)
  values (v_empresa, v_project, 'provision', '[PRUEBA] Provisión de fondos (' || v_billing.advance_percentage || '%).pdf',
          v_advance, 'justificante_aportado', true)
  returning id into v_prov;
  update public.projects set status = 'en_progreso', provision_funds = v_advance, pending_payments = v_amount + v_tax - v_advance
   where id = v_project;
  v_steps := v_steps || jsonb_build_object('key', 'simulate_advance', 'label', 'Simular anticipo', 'ok', true,
    'advance', v_advance, 'advance_percentage', v_billing.advance_percentage, 'note', 'Justificante aportado; pendiente de confirmar el pago.');

  -- 10) Auditoría
  perform public.audit_log_internal(v_empresa, auth.uid(), 'onboarding.test_run', 'onboarding_test_runs', v_run, 'ok',
    jsonb_build_object('project_id', v_project, 'is_test', true));
  v_steps := v_steps || jsonb_build_object('key', 'audit', 'label', 'Ver auditoría', 'ok', true);

  update public.onboarding_test_runs
     set status = 'completed', completed_at = now(), steps = v_steps,
         created_ids = jsonb_build_object('cliente_id', v_cliente, 'intake_id', v_intake.id, 'project_id', v_project,
                                          'quote_id', v_quote, 'provision_id', v_prov, 'task_id', v_task)
   where id = v_run;
  return jsonb_build_object('ok', true, 'run_id', v_run, 'steps', v_steps, 'project_id', v_project, 'intake_token', v_intake.token);
exception when others then
  if v_run is not null then
    update public.onboarding_test_runs set status = 'failed', completed_at = now(),
      steps = v_steps || jsonb_build_object('key', 'error', 'label', 'Error', 'ok', false, 'error', sqlerrm) where id = v_run;
  end if;
  raise;
end $$;
revoke all on function public.run_onboarding_test(uuid) from public, anon;
grant execute on function public.run_onboarding_test(uuid) to authenticated;

create or replace function public.cleanup_onboarding_test_data(p_empresa_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_empresa uuid := public.onboarding_target_empresa(p_empresa_id); n_docs int; n_proj int; n_cli int; n_tasks int; n_intake int;
begin
  delete from public.documents     where empresa_id = v_empresa and is_test; get diagnostics n_docs = row_count;
  delete from public.tasks         where empresa_id = v_empresa and is_test; get diagnostics n_tasks = row_count;
  delete from public.client_intake where empresa_id = v_empresa and is_test; get diagnostics n_intake = row_count;
  delete from public.projects      where empresa_id = v_empresa and is_test; get diagnostics n_proj = row_count;
  delete from public.clientes      where empresa_id = v_empresa and is_test; get diagnostics n_cli = row_count;
  update public.onboarding_test_runs set status = 'cleaned', cleaned_at = now()
   where empresa_id = v_empresa and status <> 'cleaned';
  perform public.audit_log_internal(v_empresa, auth.uid(), 'onboarding.test_data_cleaned', 'onboarding_test_runs', null, 'ok',
    jsonb_build_object('documents', n_docs, 'projects', n_proj, 'clientes', n_cli, 'tasks', n_tasks, 'intakes', n_intake));
  return jsonb_build_object('ok', true, 'deleted', jsonb_build_object('documents', n_docs, 'projects', n_proj, 'clientes', n_cli, 'tasks', n_tasks, 'intakes', n_intake));
end $$;
revoke all on function public.cleanup_onboarding_test_data(uuid) from public, anon;
grant execute on function public.cleanup_onboarding_test_data(uuid) to authenticated;

-- ===========================================================================
-- 24) Formulario público: devuelve la plantilla (compatible con el formulario actual)
-- ===========================================================================
create or replace function public.get_intake_form(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v record;
begin
  select ci.status, ci.expires_at, ci.is_test,
         e.name as empresa, e.logo_url, e.primary_color,
         coalesce(e.intake_config->'project_types', '[]'::jsonb) as project_types,
         t.name as form_name, t.fields, t.required_documents, t.consents
    into v
  from public.client_intake ci
  join public.empresas e on e.id = ci.empresa_id
  left join public.intake_form_templates t on t.id = ci.form_template_id
  where ci.token = p_token;
  if not found then return null; end if;
  return jsonb_build_object(
    'status', case when v.status = 'pendiente' and v.expires_at is not null and v.expires_at < now() then 'caducado' else v.status end,
    'empresa', v.empresa,
    'logo_url', v.logo_url,
    'primary_color', v.primary_color,
    'project_types', v.project_types,
    'is_test', v.is_test,
    'form', case when v.fields is null then null else jsonb_build_object(
      'name', v.form_name, 'fields', v.fields, 'required_documents', v.required_documents, 'consents', v.consents) end
  );
end $$;
grant execute on function public.get_intake_form(uuid) to anon, authenticated;

-- submit_intake_form: respeta caducidad y marca is_test en lo que crea
create or replace function public.submit_intake_form(p_token uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ci public.client_intake; v_cliente uuid;
begin
  select * into v_ci from public.client_intake where token = p_token;
  if not found then return jsonb_build_object('ok', false, 'error', 'Formulario no válido'); end if;
  if v_ci.status = 'completado' then return jsonb_build_object('ok', false, 'error', 'Este formulario ya fue completado'); end if;
  if v_ci.expires_at is not null and v_ci.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'Este enlace ha caducado. Solicita uno nuevo.');
  end if;

  insert into public.clientes (empresa_id, name, email, phone, is_test)
  values (v_ci.empresa_id, coalesce(nullif(p_data->>'name',''), 'Cliente'), nullif(p_data->>'email',''), nullif(p_data->>'phone',''), v_ci.is_test)
  returning id into v_cliente;

  update public.client_intake
     set status='completado', submitted=p_data, cliente_id=v_cliente, completed_at=now()
   where id = v_ci.id;

  insert into public.tasks (empresa_id, type, title, detail, priority, related_id, is_test)
  values (
    v_ci.empresa_id, 'nuevo_cliente',
    case when v_ci.is_test then '[PRUEBA] ' else '' end || 'Nuevo cliente: ' || coalesce(nullif(p_data->>'name',''), 'Cliente'),
    coalesce(nullif(p_data->>'description',''), 'Ha completado el formulario de contacto.'),
    1, v_cliente, v_ci.is_test
  );
  perform public.audit_log_internal(v_ci.empresa_id, null, 'intake.submitted', 'client_intake', v_ci.id, 'ok',
    jsonb_build_object('channel', v_ci.channel, 'is_test', v_ci.is_test));
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.submit_intake_form(uuid, jsonb) to anon, authenticated;

-- ===========================================================================
-- 25) Almacenamiento interno de Feblio (bucket privado, separado por empresa)
-- ===========================================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('empresa-docs', 'empresa-docs', false, 52428800)   -- 50 MB por archivo
on conflict (id) do update set public = false, file_size_limit = 52428800;

-- Ruta obligatoria: {empresa_id}/... → solo la empresa dueña (o admin)
drop policy if exists empresa_docs_select on storage.objects;
create policy empresa_docs_select on storage.objects for select to authenticated
  using (bucket_id = 'empresa-docs' and (public.is_admin() or (storage.foldername(name))[1] = public.current_empresa_id()::text));
drop policy if exists empresa_docs_insert on storage.objects;
create policy empresa_docs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'empresa-docs' and public.current_role_name() = 'empresa'
              and (storage.foldername(name))[1] = public.current_empresa_id()::text);
drop policy if exists empresa_docs_update on storage.objects;
create policy empresa_docs_update on storage.objects for update to authenticated
  using (bucket_id = 'empresa-docs' and public.current_role_name() = 'empresa'
         and (storage.foldername(name))[1] = public.current_empresa_id()::text);
drop policy if exists empresa_docs_delete on storage.objects;
create policy empresa_docs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'empresa-docs' and (public.is_admin() or (public.current_role_name() = 'empresa'
         and (storage.foldername(name))[1] = public.current_empresa_id()::text)));

-- ===========================================================================
-- 26) Backfill: empresas ya existentes no se ven forzadas al wizard.
--     Podrán reabrirlo desde Configuración → Reabrir configuración inicial.
-- ===========================================================================
select set_config('feblio.trusted', 'on', false);   -- permite el backfill pese al trigger de guarda
update public.empresas
   set onboarding_status = 'completed', onboarding_completed_at = coalesce(onboarding_completed_at, now()),
       onboarding_started_at = coalesce(onboarding_started_at, created_at)
 where onboarding_status = 'not_started' and created_at < now() - interval '1 minute';

-- Restaura la marca de confianza de la sesión
select set_config('feblio.trusted', 'off', false);
