-- Feblio · Registro con identificación fiscal (CIF empresa / NIF autónomo)
alter table public.empresas add column if not exists tax_type text; -- 'CIF' | 'NIF'

-- Al registrarse un tenant (role='empresa') se crea su empresa con la
-- identificación fiscal tomada de los metadatos del signup y se vincula el perfil.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role     user_role := coalesce((new.raw_user_meta_data->>'role')::user_role, 'cliente');
  v_empresa  uuid;
begin
  if v_role = 'empresa' then
    insert into public.empresas (name, cif, tax_type)
    values (
      coalesce(nullif(new.raw_user_meta_data->>'company_name',''),
               new.raw_user_meta_data->>'full_name',
               new.email),
      nullif(new.raw_user_meta_data->>'tax_id',''),
      nullif(new.raw_user_meta_data->>'tax_type','')
    )
    returning id into v_empresa;
  end if;

  insert into public.profiles (id, email, full_name, role, empresa_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    v_role,
    v_empresa
  )
  on conflict (id) do nothing;

  return new;
end $$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
