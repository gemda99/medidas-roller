-- HU-13 / HU-14 · Clientes y direcciones
-- Los clientes son compartidos entre usuarios activos (equipo pequeño).
-- Solo el administrador borra.

create table public.customers (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null check (length(trim(full_name)) between 2 and 120),
  phone       text not null check (phone ~ '^\+?[0-9 ]{8,16}$'),
  email       text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  notes       text check (notes is null or length(notes) <= 1000),
  -- Solo dígitos, para buscar "912345678" aunque se haya guardado "+56 9 1234 5678".
  phone_digits text generated always as (regexp_replace(phone, '[^0-9]', '', 'g')) stored,
  created_by  uuid not null default auth.uid() references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index customers_full_name_idx on public.customers (lower(full_name));
create index customers_phone_digits_idx on public.customers (phone_digits);

create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

create table public.customer_addresses (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references public.customers (id) on delete cascade,
  address_line  text not null check (length(trim(address_line)) between 3 and 200),
  comuna        text not null check (length(trim(comuna)) between 2 and 80),
  reference     text check (reference is null or length(reference) <= 200),
  is_default    boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index customer_addresses_customer_idx on public.customer_addresses (customer_id);
-- Una sola dirección principal por cliente.
create unique index customer_addresses_one_default
  on public.customer_addresses (customer_id) where is_default;

create trigger customer_addresses_set_updated_at
  before update on public.customer_addresses
  for each row execute function public.set_updated_at();

alter table public.customers enable row level security;
alter table public.customer_addresses enable row level security;

create policy customers_select on public.customers
  for select to authenticated using (public.is_active_user());
create policy customers_insert on public.customers
  for insert to authenticated with check (public.is_active_user() and created_by = auth.uid());
create policy customers_update on public.customers
  for update to authenticated using (public.is_active_user()) with check (public.is_active_user());
create policy customers_delete on public.customers
  for delete to authenticated using (public.is_admin());

create policy addresses_select on public.customer_addresses
  for select to authenticated using (public.is_active_user());
create policy addresses_insert on public.customer_addresses
  for insert to authenticated with check (public.is_active_user());
create policy addresses_update on public.customer_addresses
  for update to authenticated using (public.is_active_user()) with check (public.is_active_user());
create policy addresses_delete on public.customer_addresses
  for delete to authenticated using (public.is_active_user());

-- Marca una dirección como principal y desmarca las demás en una sola operación.
create or replace function public.set_default_address(p_address_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_customer uuid;
begin
  select customer_id into v_customer from public.customer_addresses where id = p_address_id;
  if v_customer is null then
    raise exception 'Dirección no encontrada' using errcode = 'P0002';
  end if;
  update public.customer_addresses set is_default = false where customer_id = v_customer and is_default;
  update public.customer_addresses set is_default = true where id = p_address_id;
end;
$$;

-- Crea cliente + dirección principal en una sola transacción (evita clientes sin dirección
-- si se corta la señal entre dos llamadas). Respeta RLS porque es security invoker.
create or replace function public.create_customer_with_address(
  p_full_name text,
  p_phone text,
  p_email text,
  p_notes text,
  p_address_line text,
  p_comuna text,
  p_reference text
)
returns public.customers
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_customer public.customers;
begin
  insert into public.customers (full_name, phone, email, notes)
  values (p_full_name, p_phone, p_email, p_notes)
  returning * into v_customer;

  insert into public.customer_addresses (customer_id, address_line, comuna, reference, is_default)
  values (v_customer.id, p_address_line, p_comuna, p_reference, true);

  return v_customer;
end;
$$;
