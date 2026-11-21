-- Ejecutar UNA vez en Supabase > SQL Editor, después de crear tu usuario en
-- Authentication > Users. Cambia el correo por el tuyo.
update public.profiles
set role = 'admin', full_name = 'Gabriel'
where id = (select id from auth.users where email = 'TU-CORREO@ejemplo.cl');
