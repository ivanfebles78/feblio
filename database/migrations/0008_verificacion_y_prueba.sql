-- Feblio · Verificación por código (6 dígitos) + periodo de prueba de 14 días

-- 1) Campos de cuenta en la empresa
alter table public.empresas
  add column if not exists email_verified      boolean not null default false,
  add column if not exists trial_ends_at        timestamptz,
  add column if not exists subscription_status  text not null default 'trial';
  -- subscription_status: trial | active | past_due | canceled

-- 2) Códigos OTP de verificación (uno por empresa; solo accesible vía funciones)
create table if not exists public.email_otps (
  empresa_id  uuid primary key references public.empresas(id) on delete cascade,
  code        text not null,
  expires_at  timestamptz not null,
  attempts    int not null default 0,
  created_at  timestamptz not null default now()
);
alter table public.email_otps enable row level security;
-- Sin políticas: solo el edge function (service role) escribe y el RPC (definer) lee.

-- 3) Al registrarse una empresa: prueba de 14 días y sin verificar
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role    user_role := coalesce((new.raw_user_meta_data->>'role')::user_role, 'cliente');
  v_empresa uuid;
begin
  if v_role = 'empresa' then
    insert into public.empresas (name, cif, tax_type, trial_ends_at, subscription_status, email_verified)
    values (
      coalesce(nullif(new.raw_user_meta_data->>'company_name',''), new.raw_user_meta_data->>'full_name', new.email),
      nullif(new.raw_user_meta_data->>'tax_id',''),
      nullif(new.raw_user_meta_data->>'tax_type',''),
      now() + interval '14 days',
      'trial',
      false
    )
    returning id into v_empresa;
  end if;

  insert into public.profiles (id, email, full_name, role, empresa_id)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email), v_role, v_empresa)
  on conflict (id) do nothing;

  return new;
end $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- 4) Verificar el código: lo llama el usuario autenticado tras registrarse
create or replace function public.verify_email_otp(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
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
    return jsonb_build_object('ok', false, 'error', 'Código incorrecto.');
  end if;

  update public.empresas set email_verified = true where id = v_empresa;
  delete from public.email_otps where empresa_id = v_empresa;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.verify_email_otp(text) to authenticated;

-- A los usuarios demo ya existentes los marcamos verificados (no pasan por OTP)
update public.empresas set email_verified = true, trial_ends_at = now() + interval '14 days'
where email_verified = false;
