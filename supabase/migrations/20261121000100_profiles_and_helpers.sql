-- HU-09 / HU-41 · Perfiles, roles y funciones auxiliares
-- Dos perfiles: admin y medidor. No hay registro público: el administrador crea
-- las cuentas desde Supabase (Authentication > Users) y este trigger crea el perfil.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null check (length(trim(full_name)) between 2 and 120),
  role        text not null default 'medidor' check (role in ('admin', 'medidor')),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Crea el perfil al crear el usuario en Auth. Siempre como medidor:
-- el primer administrador se asigna con el script de README (sección Supabase).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    'medidor'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Rol del usuario actual; null si no tiene perfil o está desactivado.
create or replace function public.app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(public.app_role() = 'admin', false)
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
set search_path = public
as $$
  select public.app_role() is not null
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

alter table public.profiles enable row level security;

-- Cada usuario ve su perfil; el admin ve todos.
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

-- Solo el admin cambia nombre, rol o estado (un medidor no puede subirse de rol).
create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Sin políticas de insert/delete: los perfiles nacen del trigger y se desactivan, no se borran.

-- Evita que un admin se quite su propio rol o se desactive y deje la app sin administrador.
create or replace function public.protect_last_admin()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.role = 'admin' and old.active
     and (new.role <> 'admin' or not new.active)
     and (select count(*) from public.profiles where role = 'admin' and active and id <> old.id) = 0 then
    raise exception 'Debe quedar al menos un administrador activo' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger profiles_protect_last_admin
  before update on public.profiles
  for each row execute function public.protect_last_admin();
