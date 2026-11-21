-- Permisos explícitos para la API de datos (PostgREST).
-- Los proyectos nuevos de Supabase pueden no exponer automáticamente las tablas nuevas
-- a los roles anon/authenticated. RLS sigue decidiendo qué filas ve cada usuario.

grant usage on schema public to anon, authenticated;

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.customers to authenticated;
grant select, insert, update, delete on public.customer_addresses to authenticated;

grant execute on function public.app_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.set_default_address(uuid) to authenticated;
grant execute on function public.create_customer_with_address(text, text, text, text, text, text, text) to authenticated;

-- anon (sin sesión) no necesita nada de estas tablas.
revoke all on public.profiles, public.customers, public.customer_addresses from anon;
