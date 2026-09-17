-- Feblio · 0010 · Mantener profiles.email sincronizado con auth.users.email
--
-- Cambiar el email de un usuario desde Supabase Authentication (panel o Admin API)
-- no actualizaba public.profiles.email (handle_new_user solo actúa en el alta).
-- Idempotente. Aplicar DESPUÉS de 0009.

create or replace function public.handle_user_email_change()
returns trigger language plpgsql security definer set search_path = public set feblio.trusted = 'on' as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id and email is distinct from new.email;
    -- Cliente final vinculado a este usuario: mantiene el email de contacto alineado
    update public.clientes set email = new.email where linked_profile_id = new.id and email is distinct from new.email;
  end if;
  return new;
end $$;
revoke all on function public.handle_user_email_change() from public, anon, authenticated;

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- Backfill: cuentas cuyo email ya se cambió en Auth antes de instalar el trigger
select set_config('feblio.trusted', 'on', false);
update public.profiles p
   set email = u.email
  from auth.users u
 where u.id = p.id and p.email is distinct from u.email;
update public.clientes c
   set email = u.email
  from auth.users u
 where c.linked_profile_id = u.id and c.email is distinct from u.email;
select set_config('feblio.trusted', 'off', false);
