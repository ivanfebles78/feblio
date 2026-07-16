-- Feblio · Endurecer helpers SECURITY DEFINER
-- Quita EXECUTE público/anon; RLS los usa internamente como definer.
revoke all on function public.current_role_name()  from public, anon;
revoke all on function public.current_empresa_id()  from public, anon;
revoke all on function public.current_cliente_id()  from public, anon;
revoke all on function public.is_admin()            from public, anon;
grant execute on function public.current_role_name() to authenticated;
grant execute on function public.current_empresa_id() to authenticated;
grant execute on function public.current_cliente_id() to authenticated;
grant execute on function public.is_admin()          to authenticated;

revoke all on function public.handle_new_user() from public, anon, authenticated;
