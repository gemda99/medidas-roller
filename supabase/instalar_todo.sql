-- =====================================================================
-- MEDIDAS ROLLER · INSTALAR TODO (base de datos nueva de una empresa)
-- =====================================================================
-- Úsalo SOLO en un proyecto de Supabase NUEVO y vacío (no en uno que ya tenga la app).
-- Supabase > SQL Editor > New query > pega TODO este archivo > Run (una sola vez).
-- Después: crea el primer usuario en Authentication > Users y ejecuta el bloque del final.
-- Incluye 16 migraciones, en orden:
--   20261121000100_profiles_and_helpers.sql
--   20261121000200_customers.sql
--   20261121000300_api_grants.sql
--   20261121000400_catalog_base.sql
--   20261121000500_rectifications.sql
--   20261121000600_sprint2_ajustes.sql
--   20261121000700_price_lists.sql
--   20261121000800_curtain_photos.sql
--   20261121000900_quotations.sql
--   20261121001000_business_and_documents.sql
--   20261121001100_warranty_details.sql
--   20261121001200_confection_rules.sql
--   20261121001300_rut_and_signature.sql
--   20261122001400_quotation_work_snapshot.sql
--   20261123001500_admin_purge.sql
--   20261126001600_app_theme.sql
-- =====================================================================


-- >>>>>>>>>> 20261121000100_profiles_and_helpers.sql
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


-- >>>>>>>>>> 20261121000200_customers.sql
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


-- >>>>>>>>>> 20261121000300_api_grants.sql
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
-- TRUNCATE no respeta RLS: nadie desde la app lo necesita.
revoke truncate, references, trigger on public.profiles, public.customers, public.customer_addresses from authenticated;


-- >>>>>>>>>> 20261121000400_catalog_base.sql
-- Sprint 2 · Catálogo base (lo mínimo para registrar cortinas).
-- La administración del catálogo (pantallas) y los precios llegan en el Sprint 3.

create table public.products (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique check (code ~ '^[A-Z0-9+]{1,12}$'),
  name          text not null check (length(trim(name)) between 2 and 80),
  kind          text not null check (kind in ('tela', 'sistema')),
  cenefa_mode   text not null default 'no' check (cenefa_mode in ('no', 'opcional', 'incluida')),
  fabricated    boolean not null default true,
  active        boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Un sistema doble (SE+BO) se compone de dos productos tela: fondo y frente.
create table public.product_components (
  system_product_id     uuid not null references public.products (id) on delete cascade,
  role                  text not null check (role in ('fondo', 'frente')),
  component_product_id  uuid not null references public.products (id),
  primary key (system_product_id, role)
);

-- Opciones técnicas por producto (velcro, contrapeso…), sin precio.
create table public.product_options (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products (id) on delete cascade,
  name        text not null check (length(trim(name)) between 2 and 60),
  active      boolean not null default true,
  sort_order  int not null default 0,
  unique (product_id, name)
);

create table public.colors (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (length(trim(name)) between 1 and 60),
  active      boolean not null default true,
  sort_order  int not null default 0
);

create table public.accessories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (length(trim(name)) between 2 and 60),
  scope       text not null check (scope in ('cortina', 'cotizacion')),
  active      boolean not null default true,
  sort_order  int not null default 0
);

create trigger products_set_updated_at before update on public.products
  for each row execute function public.set_updated_at();

alter table public.products enable row level security;
alter table public.product_components enable row level security;
alter table public.product_options enable row level security;
alter table public.colors enable row level security;
alter table public.accessories enable row level security;

-- Lectura: cualquier usuario activo. Escritura: solo administrador.
do $$
declare t text;
begin
  foreach t in array array['products', 'product_components', 'product_options', 'colors', 'accessories'] loop
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (public.is_active_user())', t);
    execute format('create policy %1$s_admin_insert on public.%1$s for insert to authenticated with check (public.is_admin())', t);
    execute format('create policy %1$s_admin_update on public.%1$s for update to authenticated using (public.is_admin()) with check (public.is_admin())', t);
    execute format('create policy %1$s_admin_delete on public.%1$s for delete to authenticated using (public.is_admin())', t);
    execute format('grant select, insert, update, delete on public.%1$s to authenticated', t);
    execute format('revoke all on public.%1$s from anon', t);
    execute format('revoke truncate, references, trigger on public.%1$s from authenticated', t);
  end loop;
end $$;

-- Datos iniciales informados por Gabriel (D-20, D-25, D-28). Todo editable por el administrador.
insert into public.products (code, name, kind, cenefa_mode, fabricated, sort_order) values
  ('SE',     'Sunscreen',              'tela',    'opcional', true,  10),
  ('BO',     'Blackout',               'tela',    'opcional', true,  20),
  ('SE+BO',  'Sistema doble',          'sistema', 'no',       true,  30),
  ('RD',     'Dúo traslúcida',         'tela',    'incluida', true,  40),
  ('RDBO',   'Dúo blackout',           'tela',    'incluida', true,  50),
  ('BOP',    'Blackout con perfil',    'tela',    'no',       true,  60),
  ('SE+BOP', 'Doble con perfiles',     'sistema', 'no',       true,  70),
  ('VE',     'Verticales',             'tela',    'no',       false, 80);

insert into public.product_components (system_product_id, role, component_product_id)
select s.id, x.role, c.id
from (values ('SE+BO', 'fondo', 'SE'), ('SE+BO', 'frente', 'BO'),
             ('SE+BOP', 'fondo', 'SE'), ('SE+BOP', 'frente', 'BOP')) as x(sys, role, comp)
join public.products s on s.code = x.sys
join public.products c on c.code = x.comp;

-- Supuesto: velcro y contrapeso disponibles en todos los productos fabricados; el admin quita los que no aplican.
insert into public.product_options (product_id, name, sort_order)
select p.id, o.name, o.ord
from public.products p
cross join (values ('Velcro', 10), ('Contrapeso', 20)) as o(name, ord)
where p.fabricated;

-- Colores de la planilla de Gabriel (pestaña de listas).
insert into public.colors (name, sort_order)
select name, row_number() over () * 10
from unnest(array['Beige Texturado', 'Gris Claro', 'Azul Rey', 'Beige Claro Liso', 'Blanco Liso', 'Italiano',
                  'Griego', 'Black', 'Gris Perla', 'Negro', 'Negro Grafito', 'Blanco Hueso', 'Café Moro',
                  'Beige', 'Por confirmar']) as name;

insert into public.accessories (name, scope, sort_order) values
  ('Peso', 'cortina', 10),
  ('Antiahorque', 'cortina', 20),
  ('Control remoto', 'cotizacion', 30);


-- >>>>>>>>>> 20261121000500_rectifications.sql
-- Sprint 2 · Rectificaciones, ubicaciones y cortinas (HU-15 a HU-20).
-- El medidor ve y edita solo sus rectificaciones; el administrador, todas.

create table public.rectifications (
  id                          uuid primary key default gen_random_uuid(),
  customer_id                 uuid not null references public.customers (id) on delete restrict,
  executive_id                uuid not null default auth.uid() references public.profiles (id),
  executive_name              text not null default '',
  -- Copia de la dirección al momento de la visita: cambios posteriores del cliente no la alteran.
  address_line                text not null check (length(trim(address_line)) between 3 and 200),
  comuna                      text not null check (length(trim(comuna)) between 2 and 80),
  address_reference           text check (address_reference is null or length(address_reference) <= 200),
  visit_date                  date not null default (now() at time zone 'America/Santiago')::date,
  installation_date           date,
  explained_light_entry       boolean not null default false,
  explained_fabric_position   boolean not null default false,
  explained_side_measure      boolean not null default false,
  observations                text check (observations is null or length(observations) <= 2000),
  status                      text not null default 'borrador' check (status in ('borrador', 'completa')),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index rectifications_customer_idx on public.rectifications (customer_id);
create index rectifications_executive_idx on public.rectifications (executive_id, status);

create table public.locations (
  id                uuid primary key default gen_random_uuid(),
  rectification_id  uuid not null references public.rectifications (id) on delete cascade,
  name              text not null check (length(trim(name)) between 1 and 60),
  notes             text check (notes is null or length(notes) <= 500),
  sort_order        int not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index locations_rectification_idx on public.locations (rectification_id, sort_order);

create table public.curtains (
  id              uuid primary key default gen_random_uuid(),
  location_id     uuid not null references public.locations (id) on delete cascade,
  product_id      uuid not null references public.products (id),
  label           text check (label is null or length(label) <= 60),
  surface         text check (surface in ('concreto', 'volcanita', 'madera', 'otro')),
  surface_other   text check (surface_other is null or length(surface_other) <= 60),
  mounting        text check (mounting in ('interno', 'muro', 'cielo')),
  fall            text check (fall in ('interna', 'externa')),
  -- Opcionales: quedan vacíos en cortinas sin cadena (por ejemplo, con velcro).
  chain_side      text check (chain_side in ('izquierda', 'derecha')),
  chain_length_m  numeric(4, 2) check (chain_length_m is null or chain_length_m between 0.3 and 6),
  has_cenefa      boolean not null default false,
  notes           text check (notes is null or length(notes) <= 1000),
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index curtains_location_idx on public.curtains (location_id, sort_order);

-- Cada tela de la cortina: 1 en una simple ("unica"), 2 en un doble ("fondo" y "frente").
create table public.curtain_components (
  id           uuid primary key default gen_random_uuid(),
  curtain_id   uuid not null references public.curtains (id) on delete cascade,
  role         text not null check (role in ('unica', 'fondo', 'frente')),
  product_id   uuid not null references public.products (id),
  color_name   text check (color_name is null or length(color_name) <= 60),
  width_cm     numeric(6, 1) not null check (width_cm between 10 and 1000),
  height_cm    numeric(6, 1) not null check (height_cm between 10 and 1000),
  motorized    boolean not null default false,
  unique (curtain_id, role)
);

create table public.curtain_options (
  curtain_id         uuid not null references public.curtains (id) on delete cascade,
  product_option_id  uuid not null references public.product_options (id),
  primary key (curtain_id, product_option_id)
);

create table public.curtain_accessories (
  curtain_id    uuid not null references public.curtains (id) on delete cascade,
  accessory_id  uuid not null references public.accessories (id),
  quantity      int not null check (quantity between 1 and 50),
  primary key (curtain_id, accessory_id)
);

create trigger rectifications_set_updated_at before update on public.rectifications
  for each row execute function public.set_updated_at();
create trigger locations_set_updated_at before update on public.locations
  for each row execute function public.set_updated_at();
create trigger curtains_set_updated_at before update on public.curtains
  for each row execute function public.set_updated_at();

-- Copia el nombre del ejecutivo (columna "Ejecutivo" de la hoja) al crear.
create or replace function public.set_executive_name()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select full_name into new.executive_name from public.profiles where id = new.executive_id;
  return new;
end;
$$;
create trigger rectifications_set_executive_name before insert on public.rectifications
  for each row execute function public.set_executive_name();

-- ¿El usuario actual puede ver/editar esta rectificación?
create or replace function public.can_access_rectification(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_active_user() and exists (
    select 1 from public.rectifications r
    where r.id = p_id and (r.executive_id = auth.uid() or public.is_admin())
  )
$$;

create or replace function public.can_access_location(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.locations l where l.id = p_id and public.can_access_rectification(l.rectification_id)
  )
$$;

create or replace function public.can_access_curtain(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.curtains c where c.id = p_id and public.can_access_location(c.location_id)
  )
$$;

alter table public.rectifications enable row level security;
alter table public.locations enable row level security;
alter table public.curtains enable row level security;
alter table public.curtain_components enable row level security;
alter table public.curtain_options enable row level security;
alter table public.curtain_accessories enable row level security;

create policy rectifications_select on public.rectifications for select to authenticated
  using (public.is_active_user() and (executive_id = auth.uid() or public.is_admin()));
create policy rectifications_insert on public.rectifications for insert to authenticated
  with check (public.is_active_user() and (executive_id = auth.uid() or public.is_admin()));
create policy rectifications_update on public.rectifications for update to authenticated
  using (public.is_active_user() and (executive_id = auth.uid() or public.is_admin()))
  with check (public.is_active_user() and (executive_id = auth.uid() or public.is_admin()));
-- El medidor borra solo sus borradores; el admin, cualquiera.
create policy rectifications_delete on public.rectifications for delete to authenticated
  using (public.is_admin() or (public.is_active_user() and executive_id = auth.uid() and status = 'borrador'));

create policy locations_all on public.locations for all to authenticated
  using (public.can_access_rectification(rectification_id))
  with check (public.can_access_rectification(rectification_id));
create policy curtains_all on public.curtains for all to authenticated
  using (public.can_access_location(location_id))
  with check (public.can_access_location(location_id));
create policy curtain_components_all on public.curtain_components for all to authenticated
  using (public.can_access_curtain(curtain_id))
  with check (public.can_access_curtain(curtain_id));
create policy curtain_options_all on public.curtain_options for all to authenticated
  using (public.can_access_curtain(curtain_id))
  with check (public.can_access_curtain(curtain_id));
create policy curtain_accessories_all on public.curtain_accessories for all to authenticated
  using (public.can_access_curtain(curtain_id))
  with check (public.can_access_curtain(curtain_id));

-- Guarda una cortina completa (datos, telas, opciones y accesorios) en una sola transacción.
-- Valida que las telas coincidan con el producto: 1 en simple, fondo y frente en un doble.
create or replace function public.save_curtain(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id        uuid := nullif(p ->> 'id', '')::uuid;
  v_location  uuid := (p ->> 'location_id')::uuid;
  v_product   public.products;
  v_expected  text[];
  v_roles     text[];
  v_cenefa    boolean;
begin
  select * into v_product from public.products where id = (p ->> 'product_id')::uuid and active;
  if not found then
    raise exception 'El producto elegido no está disponible.' using errcode = 'P0001';
  end if;

  if v_product.kind = 'tela' then
    v_expected := array['unica'];
  else
    select array_agg(role order by role) into v_expected
    from public.product_components where system_product_id = v_product.id;
  end if;

  select array_agg(c ->> 'role' order by c ->> 'role') into v_roles
  from jsonb_array_elements(coalesce(p -> 'components', '[]'::jsonb)) c;

  if v_roles is distinct from v_expected then
    raise exception 'Las telas no coinciden con el producto elegido.' using errcode = 'P0001';
  end if;

  v_cenefa := case v_product.cenefa_mode
    when 'incluida' then true
    when 'no' then false
    else coalesce((p ->> 'has_cenefa')::boolean, false)
  end;

  if v_id is null then
    insert into public.curtains (location_id, product_id, label, surface, surface_other, mounting, fall,
                                 chain_side, chain_length_m, has_cenefa, notes, sort_order)
    values (v_location, v_product.id, nullif(trim(p ->> 'label'), ''), nullif(p ->> 'surface', ''),
            nullif(trim(p ->> 'surface_other'), ''), nullif(p ->> 'mounting', ''), nullif(p ->> 'fall', ''),
            nullif(p ->> 'chain_side', ''), nullif(p ->> 'chain_length_m', '')::numeric, v_cenefa,
            nullif(trim(p ->> 'notes'), ''),
            coalesce((select max(sort_order) + 1 from public.curtains where location_id = v_location), 0))
    returning id into v_id;
  else
    update public.curtains set
      location_id = v_location, product_id = v_product.id, label = nullif(trim(p ->> 'label'), ''),
      surface = nullif(p ->> 'surface', ''), surface_other = nullif(trim(p ->> 'surface_other'), ''),
      mounting = nullif(p ->> 'mounting', ''), fall = nullif(p ->> 'fall', ''),
      chain_side = nullif(p ->> 'chain_side', ''), chain_length_m = nullif(p ->> 'chain_length_m', '')::numeric,
      has_cenefa = v_cenefa, notes = nullif(trim(p ->> 'notes'), '')
    where id = v_id;
    if not found then
      raise exception 'No encontramos esa cortina.' using errcode = 'P0002';
    end if;
  end if;

  delete from public.curtain_components where curtain_id = v_id;
  insert into public.curtain_components (curtain_id, role, product_id, color_name, width_cm, height_cm, motorized)
  select v_id,
         c ->> 'role',
         case when v_product.kind = 'tela' then v_product.id
              else (select pc.component_product_id from public.product_components pc
                    where pc.system_product_id = v_product.id and pc.role = c ->> 'role') end,
         nullif(trim(c ->> 'color_name'), ''),
         (c ->> 'width_cm')::numeric,
         (c ->> 'height_cm')::numeric,
         coalesce((c ->> 'motorized')::boolean, false)
  from jsonb_array_elements(p -> 'components') c;

  delete from public.curtain_options where curtain_id = v_id;
  insert into public.curtain_options (curtain_id, product_option_id)
  select v_id, o.id
  from public.product_options o
  where o.product_id = v_product.id and o.active
    and o.id::text in (select jsonb_array_elements_text(coalesce(p -> 'option_ids', '[]'::jsonb)));

  delete from public.curtain_accessories where curtain_id = v_id;
  insert into public.curtain_accessories (curtain_id, accessory_id, quantity)
  select v_id, a.id, (x ->> 'quantity')::int
  from jsonb_array_elements(coalesce(p -> 'accessories', '[]'::jsonb)) x
  join public.accessories a on a.id = (x ->> 'accessory_id')::uuid and a.active and a.scope = 'cortina'
  where (x ->> 'quantity')::int > 0;

  return v_id;
end;
$$;

-- Mueve una ubicación una posición arriba (-1) o abajo (+1). Primero renumera 10, 20, 30…
-- para que el orden sea siempre consistente, y luego intercambia con la vecina.
create or replace function public.move_location(p_id uuid, p_delta int)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_rect uuid;
  v_pos int;
  v_other uuid;
begin
  select rectification_id into v_rect from public.locations where id = p_id;
  if v_rect is null then
    raise exception 'No encontramos esa ubicación.' using errcode = 'P0002';
  end if;

  update public.locations l set sort_order = o.rn * 10
  from (select id, row_number() over (order by sort_order, created_at, id) as rn
        from public.locations where rectification_id = v_rect) o
  where l.id = o.id;

  select sort_order into v_pos from public.locations where id = p_id;
  select id into v_other from public.locations
  where rectification_id = v_rect and sort_order = v_pos + (case when p_delta < 0 then -10 else 10 end);
  if v_other is null then
    return;
  end if;

  update public.locations set sort_order = v_pos where id = v_other;
  update public.locations set sort_order = v_pos + (case when p_delta < 0 then -10 else 10 end) where id = p_id;
end;
$$;

-- Permisos de la API (los proyectos nuevos no los dan solos).
do $$
declare t text;
begin
  foreach t in array array['rectifications', 'locations', 'curtains', 'curtain_components',
                           'curtain_options', 'curtain_accessories'] loop
    execute format('grant select, insert, update, delete on public.%1$s to authenticated', t);
    execute format('revoke all on public.%1$s from anon', t);
    execute format('revoke truncate, references, trigger on public.%1$s from authenticated', t);
  end loop;
end $$;

grant execute on function public.can_access_rectification(uuid) to authenticated;
grant execute on function public.can_access_location(uuid) to authenticated;
grant execute on function public.can_access_curtain(uuid) to authenticated;
grant execute on function public.save_curtain(jsonb) to authenticated;
grant execute on function public.move_location(uuid, int) to authenticated;
revoke execute on function public.set_executive_name() from public, anon, authenticated;


-- >>>>>>>>>> 20261121000600_sprint2_ajustes.sql
-- Sprint 2 · Ajustes pedidos por Gabriel tras la primera prueba:
-- 1) Velcro con contrapeso es un producto (solo tela: sin motor, cadena ni mecanismo).
-- 2) En un doble se puede invertir el orden de las telas (SE atrás y BO adelante, o al revés).
-- 3) La caída de tela es por tela (en un doble, cada una tiene la suya).

-- 1) Productos sin mecanismo
alter table public.products add column has_mechanism boolean not null default true;

insert into public.products (code, name, kind, cenefa_mode, fabricated, has_mechanism, sort_order)
values ('VC', 'Velcro con contrapeso', 'tela', 'no', true, false, 75)
on conflict (code) do nothing;

-- Velcro y contrapeso dejan de ser opciones sueltas (se borran también de cortinas de prueba).
delete from public.curtain_options
where product_option_id in (select id from public.product_options where name in ('Velcro', 'Contrapeso'));
delete from public.product_options where name in ('Velcro', 'Contrapeso');

-- 2) Orden de las telas en un doble
alter table public.curtains add column swap_layers boolean not null default false;

-- 3) Caída por tela
alter table public.curtain_components add column fall text check (fall in ('interna', 'externa'));
update public.curtain_components cc set fall = c.fall from public.curtains c where c.id = cc.curtain_id;
alter table public.curtains drop column fall;

-- save_curtain con las nuevas reglas
create or replace function public.save_curtain(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id        uuid := nullif(p ->> 'id', '')::uuid;
  v_location  uuid := (p ->> 'location_id')::uuid;
  v_product   public.products;
  v_expected  text[];
  v_roles     text[];
  v_cenefa    boolean;
  v_swap      boolean;
  v_mech      boolean;
begin
  select * into v_product from public.products where id = (p ->> 'product_id')::uuid and active;
  if not found then
    raise exception 'El producto elegido no está disponible.' using errcode = 'P0001';
  end if;

  if v_product.kind = 'tela' then
    v_expected := array['unica'];
  else
    select array_agg(role order by role) into v_expected
    from public.product_components where system_product_id = v_product.id;
  end if;

  select array_agg(c ->> 'role' order by c ->> 'role') into v_roles
  from jsonb_array_elements(coalesce(p -> 'components', '[]'::jsonb)) c;

  if v_roles is distinct from v_expected then
    raise exception 'Las telas no coinciden con el producto elegido.' using errcode = 'P0001';
  end if;

  v_cenefa := case v_product.cenefa_mode
    when 'incluida' then true
    when 'no' then false
    else coalesce((p ->> 'has_cenefa')::boolean, false)
  end;
  v_swap := v_product.kind = 'sistema' and coalesce((p ->> 'swap_layers')::boolean, false);
  v_mech := v_product.has_mechanism;

  if v_id is null then
    insert into public.curtains (location_id, product_id, label, surface, surface_other, mounting,
                                 chain_side, chain_length_m, has_cenefa, swap_layers, notes, sort_order)
    values (v_location, v_product.id, nullif(trim(p ->> 'label'), ''), nullif(p ->> 'surface', ''),
            nullif(trim(p ->> 'surface_other'), ''), nullif(p ->> 'mounting', ''),
            case when v_mech then nullif(p ->> 'chain_side', '') end,
            case when v_mech then nullif(p ->> 'chain_length_m', '')::numeric end,
            v_cenefa, v_swap, nullif(trim(p ->> 'notes'), ''),
            coalesce((select max(sort_order) + 1 from public.curtains where location_id = v_location), 0))
    returning id into v_id;
  else
    update public.curtains set
      location_id = v_location, product_id = v_product.id, label = nullif(trim(p ->> 'label'), ''),
      surface = nullif(p ->> 'surface', ''), surface_other = nullif(trim(p ->> 'surface_other'), ''),
      mounting = nullif(p ->> 'mounting', ''),
      chain_side = case when v_mech then nullif(p ->> 'chain_side', '') end,
      chain_length_m = case when v_mech then nullif(p ->> 'chain_length_m', '')::numeric end,
      has_cenefa = v_cenefa, swap_layers = v_swap, notes = nullif(trim(p ->> 'notes'), '')
    where id = v_id;
    if not found then
      raise exception 'No encontramos esa cortina.' using errcode = 'P0002';
    end if;
  end if;

  -- En un doble invertido, la tela de fondo es la que el producto define como frente (y viceversa).
  delete from public.curtain_components where curtain_id = v_id;
  insert into public.curtain_components (curtain_id, role, product_id, color_name, width_cm, height_cm, fall, motorized)
  select v_id,
         c ->> 'role',
         case when v_product.kind = 'tela' then v_product.id
              else (select pc.component_product_id from public.product_components pc
                    where pc.system_product_id = v_product.id
                      and pc.role = case when v_swap then (case c ->> 'role' when 'fondo' then 'frente' else 'fondo' end)
                                         else c ->> 'role' end) end,
         nullif(trim(c ->> 'color_name'), ''),
         (c ->> 'width_cm')::numeric,
         (c ->> 'height_cm')::numeric,
         nullif(c ->> 'fall', ''),
         v_mech and coalesce((c ->> 'motorized')::boolean, false)
  from jsonb_array_elements(p -> 'components') c;

  delete from public.curtain_options where curtain_id = v_id;
  insert into public.curtain_options (curtain_id, product_option_id)
  select v_id, o.id
  from public.product_options o
  where o.product_id = v_product.id and o.active
    and o.id::text in (select jsonb_array_elements_text(coalesce(p -> 'option_ids', '[]'::jsonb)));

  delete from public.curtain_accessories where curtain_id = v_id;
  insert into public.curtain_accessories (curtain_id, accessory_id, quantity)
  select v_id, a.id, (x ->> 'quantity')::int
  from jsonb_array_elements(coalesce(p -> 'accessories', '[]'::jsonb)) x
  join public.accessories a on a.id = (x ->> 'accessory_id')::uuid and a.active and a.scope = 'cortina'
  where (x ->> 'quantity')::int > 0;

  return v_id;
end;
$$;


-- >>>>>>>>>> 20261121000700_price_lists.sql
-- Sprint 3 · Tarifarios con versiones (HU-23, HU-24, HU-25, HU-45).
-- Regla (D-07): un tarifario vigente no se edita. El admin crea una copia en borrador,
-- la ajusta y la activa; la anterior queda archivada. Así ninguna cotización pierde sus precios.
-- Todos los valores los define el administrador; aquí solo se cargan los informados por Gabriel.

create table public.price_lists (
  id                              uuid primary key default gen_random_uuid(),
  name                            text not null check (length(trim(name)) between 2 and 80),
  status                          text not null default 'borrador' check (status in ('borrador', 'vigente', 'archivada')),
  valid_from                      date,
  general_min_price               int not null default 0 check (general_min_price >= 0),
  motor_price                     int check (motor_price is null or motor_price >= 0),
  remote_control_per_motors       int not null default 15 check (remote_control_per_motors between 1 and 100),
  cenefa_price_ml                 int check (cenefa_price_ml is null or cenefa_price_ml >= 0),
  installation_mode               text not null default 'proyecto' check (installation_mode in ('proyecto', 'cortina', 'manual')),
  installation_project_price      int check (installation_project_price is null or installation_project_price >= 0),
  installation_per_curtain_price  int check (installation_per_curtain_price is null or installation_per_curtain_price >= 0),
  iva_rate                        numeric(5, 4) not null default 0.19 check (iva_rate between 0 and 1),
  iva_mode_default                text not null default 'excluido' check (iva_mode_default in ('excluido', 'incluido', 'sin')),
  rounding_step                   int not null default 1 check (rounding_step in (1, 10, 100, 1000)),
  medidor_discount_enabled        boolean not null default false,
  medidor_max_discount_pct        numeric(5, 2) not null default 0 check (medidor_max_discount_pct between 0 and 100),
  notes                           text check (notes is null or length(notes) <= 500),
  created_by                      uuid default auth.uid() references public.profiles (id),
  activated_at                    timestamptz,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);

-- Solo un tarifario vigente a la vez.
create unique index price_lists_one_vigente on public.price_lists ((status)) where status = 'vigente';

create table public.product_prices (
  price_list_id  uuid not null references public.price_lists (id) on delete cascade,
  product_id     uuid not null references public.products (id),
  price_m2       int check (price_m2 is null or price_m2 >= 0),
  min_price      int check (min_price is null or min_price >= 0),
  primary key (price_list_id, product_id)
);

create table public.accessory_prices (
  price_list_id  uuid not null references public.price_lists (id) on delete cascade,
  accessory_id   uuid not null references public.accessories (id),
  unit_price     int check (unit_price is null or unit_price >= 0),
  primary key (price_list_id, accessory_id)
);

create trigger price_lists_set_updated_at before update on public.price_lists
  for each row execute function public.set_updated_at();

-- Bloquea cambios en tarifarios vigentes o archivados (excepto el cambio de estado que hace activate_price_list).
create or replace function public.protect_price_list()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'borrador' then
      raise exception 'Solo se pueden eliminar tarifarios en borrador.' using errcode = 'P0001';
    end if;
    return old;
  end if;
  if old.status <> 'borrador' and current_setting('app.activating', true) is distinct from 'on' then
    raise exception 'Este tarifario ya está en uso y no se edita. Crea una copia para cambiar precios.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger price_lists_protect before update or delete on public.price_lists
  for each row execute function public.protect_price_list();

create or replace function public.protect_price_rows()
returns trigger language plpgsql set search_path = public as $$
declare v_status text;
begin
  select status into v_status from public.price_lists
  where id = coalesce(new.price_list_id, old.price_list_id);
  if v_status is not null and v_status <> 'borrador' then
    raise exception 'Este tarifario ya está en uso y no se edita. Crea una copia para cambiar precios.' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger product_prices_protect before insert or update or delete on public.product_prices
  for each row execute function public.protect_price_rows();
create trigger accessory_prices_protect before insert or update or delete on public.accessory_prices
  for each row execute function public.protect_price_rows();

-- Copia un tarifario (normalmente el vigente) como borrador nuevo, con todos sus precios.
create or replace function public.clone_price_list(p_id uuid, p_name text default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_new uuid;
begin
  if not public.is_admin() then
    raise exception 'Solo el administrador maneja tarifarios.' using errcode = '42501';
  end if;
  insert into public.price_lists (name, status, general_min_price, motor_price, remote_control_per_motors, cenefa_price_ml,
    installation_mode, installation_project_price, installation_per_curtain_price, iva_rate, iva_mode_default,
    rounding_step, medidor_discount_enabled, medidor_max_discount_pct, notes)
  select coalesce(nullif(trim(p_name), ''), name || ' (copia)'), 'borrador', general_min_price, motor_price,
    remote_control_per_motors, cenefa_price_ml, installation_mode, installation_project_price,
    installation_per_curtain_price, iva_rate, iva_mode_default, rounding_step, medidor_discount_enabled,
    medidor_max_discount_pct, notes
  from public.price_lists where id = p_id
  returning id into v_new;
  if v_new is null then
    raise exception 'No encontramos ese tarifario.' using errcode = 'P0002';
  end if;
  insert into public.product_prices (price_list_id, product_id, price_m2, min_price)
  select v_new, product_id, price_m2, min_price from public.product_prices where price_list_id = p_id;
  insert into public.accessory_prices (price_list_id, accessory_id, unit_price)
  select v_new, accessory_id, unit_price from public.accessory_prices where price_list_id = p_id;
  return v_new;
end;
$$;

-- Productos tela activos sin precio por m² en un tarifario (impiden activarlo).
create or replace function public.price_list_missing(p_id uuid)
returns table (code text, name text) language sql stable security invoker set search_path = public as $$
  select p.code, p.name from public.products p
  where p.active and p.kind = 'tela'
    and not exists (select 1 from public.product_prices pp
                    where pp.price_list_id = p_id and pp.product_id = p.id and pp.price_m2 is not null)
  order by p.sort_order
$$;

-- Activa un borrador: el vigente anterior pasa a archivado. Exige precio por m² en todas las telas activas.
create or replace function public.activate_price_list(p_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare v_missing text;
begin
  if not public.is_admin() then
    raise exception 'Solo el administrador maneja tarifarios.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.price_lists where id = p_id and status = 'borrador') then
    raise exception 'Solo se puede activar un tarifario en borrador.' using errcode = 'P0001';
  end if;
  select string_agg(code, ', ') into v_missing from public.price_list_missing(p_id);
  if v_missing is not null then
    raise exception 'Falta el precio por m² de: %.', v_missing using errcode = 'P0001';
  end if;
  perform set_config('app.activating', 'on', true);
  update public.price_lists set status = 'archivada' where status = 'vigente';
  update public.price_lists set status = 'vigente', activated_at = now(),
    valid_from = coalesce(valid_from, (now() at time zone 'America/Santiago')::date)
  where id = p_id;
  perform set_config('app.activating', 'off', true);
end;
$$;

alter table public.price_lists enable row level security;
alter table public.product_prices enable row level security;
alter table public.accessory_prices enable row level security;

-- El medidor ve solo el tarifario vigente (para cotizar); el admin, todos.
create policy price_lists_select on public.price_lists for select to authenticated
  using (public.is_admin() or (public.is_active_user() and status = 'vigente'));
create policy price_lists_admin_insert on public.price_lists for insert to authenticated with check (public.is_admin());
create policy price_lists_admin_update on public.price_lists for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy price_lists_admin_delete on public.price_lists for delete to authenticated using (public.is_admin());

create policy product_prices_select on public.product_prices for select to authenticated
  using (exists (select 1 from public.price_lists l where l.id = price_list_id));
create policy product_prices_admin_write on public.product_prices for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy accessory_prices_select on public.accessory_prices for select to authenticated
  using (exists (select 1 from public.price_lists l where l.id = price_list_id));
create policy accessory_prices_admin_write on public.accessory_prices for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

do $$
declare t text;
begin
  foreach t in array array['price_lists', 'product_prices', 'accessory_prices'] loop
    execute format('grant select, insert, update, delete on public.%1$s to authenticated', t);
    execute format('revoke all on public.%1$s from anon', t);
    execute format('revoke truncate, references, trigger on public.%1$s from authenticated', t);
  end loop;
end $$;
grant execute on function public.clone_price_list(uuid, text) to authenticated;
grant execute on function public.activate_price_list(uuid) to authenticated;
grant execute on function public.price_list_missing(uuid) to authenticated;
revoke execute on function public.protect_price_list() from public, anon, authenticated;
revoke execute on function public.protect_price_rows() from public, anon, authenticated;

-- Tarifario inicial en BORRADOR solo con los valores informados por Gabriel.
-- Falta cargar el precio por m² del resto de las telas antes de activarlo.
insert into public.price_lists (name, general_min_price, motor_price, cenefa_price_ml, installation_mode,
  installation_project_price, iva_rate, iva_mode_default, rounding_step)
values ('Tarifario inicial', 40000, 100000, 10000, 'proyecto', 50000, 0.19, 'excluido', 1);

insert into public.product_prices (price_list_id, product_id, price_m2, min_price)
select l.id, p.id,
       case p.code when 'BO' then 21000 end,
       case when p.kind = 'sistema' then 70000 end
from public.price_lists l cross join public.products p
where l.name = 'Tarifario inicial';

insert into public.accessory_prices (price_list_id, accessory_id, unit_price)
select l.id, a.id, null from public.price_lists l cross join public.accessories a
where l.name = 'Tarifario inicial';


-- >>>>>>>>>> 20261121000800_curtain_photos.sql
-- Sprint 3 · Fotos por cortina (HU-21).
-- Archivos en Supabase Storage, bucket privado "curtain-photos", ruta {rectificación}/{cortina}/{uuid}.jpg.
-- Quien puede ver la rectificación puede ver y subir sus fotos; nadie más.

create or replace function public.try_uuid(p text)
returns uuid language plpgsql immutable as $$
begin
  return p::uuid;
exception when others then
  return null;
end;
$$;

create table public.curtain_photos (
  id            uuid primary key default gen_random_uuid(),
  curtain_id    uuid not null references public.curtains (id) on delete cascade,
  storage_path  text not null unique check (length(storage_path) between 10 and 300),
  width         int check (width is null or width > 0),
  height        int check (height is null or height > 0),
  size_bytes    int check (size_bytes is null or size_bytes between 1 and 10485760),
  created_by    uuid default auth.uid() references public.profiles (id),
  created_at    timestamptz not null default now()
);
create index curtain_photos_curtain_idx on public.curtain_photos (curtain_id, created_at);

alter table public.curtain_photos enable row level security;
create policy curtain_photos_all on public.curtain_photos for all to authenticated
  using (public.can_access_curtain(curtain_id))
  with check (public.can_access_curtain(curtain_id));

grant select, insert, update, delete on public.curtain_photos to authenticated;
revoke all on public.curtain_photos from anon;
revoke truncate, references, trigger on public.curtain_photos from authenticated;

-- Bucket privado, máximo 10 MB por archivo y solo imágenes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('curtain-photos', 'curtain-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy curtain_photos_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'curtain-photos'
         and public.can_access_rectification(public.try_uuid((storage.foldername(name))[1])));
create policy curtain_photos_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'curtain-photos'
              and public.can_access_rectification(public.try_uuid((storage.foldername(name))[1])));
create policy curtain_photos_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'curtain-photos'
         and public.can_access_rectification(public.try_uuid((storage.foldername(name))[1])));


-- >>>>>>>>>> 20261121000900_quotations.sql
-- Sprint 4 · Cotizaciones (HU-27 a HU-30).
-- Cada cotización guarda una COPIA de precios, catálogo y cliente (snapshots): cambiar el tarifario
-- después no la altera. Los montos los calcula el motor (TypeScript); la base verifica coherencia,
-- límites de descuento y que una cotización emitida no cambie.

create sequence public.quotation_seq;

create or replace function public.next_quotation_number()
returns text language sql volatile security definer set search_path = public as $$
  select 'COT-' || to_char(now() at time zone 'America/Santiago', 'YYYY') || '-' ||
         lpad(nextval('public.quotation_seq')::text, 4, '0')
$$;

create table public.quotations (
  id                    uuid primary key default gen_random_uuid(),
  number                text not null unique default public.next_quotation_number(),
  rectification_id      uuid not null references public.rectifications (id) on delete restrict,
  status                text not null default 'borrador' check (status in ('borrador', 'emitida', 'aceptada', 'rechazada')),
  price_list_id         uuid references public.price_lists (id) on delete set null,
  created_by            uuid not null default auth.uid() references public.profiles (id),
  iva_mode              text not null check (iva_mode in ('excluido', 'incluido', 'sin')),
  discount_type         text not null default 'ninguno' check (discount_type in ('ninguno', 'porcentaje', 'monto')),
  discount_value        numeric(12, 2) not null default 0 check (discount_value >= 0),
  installation_mode     text not null check (installation_mode in ('proyecto', 'cortina', 'manual')),
  subtotal_products     int not null check (subtotal_products >= 0),
  discount_amount       int not null default 0 check (discount_amount >= 0),
  installation_amount   int not null default 0 check (installation_amount >= 0),
  extras_amount         int not null default 0 check (extras_amount >= 0),
  net_amount            int not null,
  iva_amount            int not null default 0 check (iva_amount >= 0),
  total_calculated      int not null check (total_calculated >= 0),
  manual_adjustment     int not null default 0,
  total_final           int not null check (total_final >= 0),
  valid_days            int not null default 10 check (valid_days between 1 and 90),
  notes                 text check (notes is null or length(notes) <= 1000),
  options               jsonb not null default '{}'::jsonb,
  customer_snapshot     jsonb not null,
  pricing_snapshot      jsonb not null,
  issued_at             timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  -- Coherencia de montos (la base no recalcula, pero no acepta totales que no cuadran).
  constraint quotations_net_ok check (net_amount = subtotal_products - discount_amount + installation_amount + extras_amount),
  constraint quotations_discount_ok check (discount_amount <= subtotal_products),
  constraint quotations_final_ok check (total_final = total_calculated + manual_adjustment),
  constraint quotations_total_ok check (
    (iva_mode = 'excluido' and total_calculated = net_amount + iva_amount)
    or (iva_mode <> 'excluido' and total_calculated = net_amount)
  ),
  constraint quotations_no_iva check (iva_mode <> 'sin' or iva_amount = 0)
);
create index quotations_rectification_idx on public.quotations (rectification_id, created_at desc);

create table public.quotation_items (
  id                 uuid primary key default gen_random_uuid(),
  quotation_id       uuid not null references public.quotations (id) on delete cascade,
  sort_order         int not null,
  kind               text not null check (kind in ('cortina', 'cenefa', 'motor', 'accesorio', 'adicional')),
  curtain_id         uuid references public.curtains (id) on delete set null,
  location_name      text not null default '',
  description        text not null check (length(description) between 1 and 200),
  product_code       text,
  color_name         text,
  width_cm           numeric(6, 1),
  height_cm          numeric(6, 1),
  area_m2            numeric(8, 4),
  base_price         int,
  min_price_applied  boolean not null default false,
  unit_price         int not null check (unit_price >= 0),
  quantity           int not null check (quantity between 1 and 999),
  line_total         int not null check (line_total >= 0),
  layers             jsonb
);
create index quotation_items_quotation_idx on public.quotation_items (quotation_id, sort_order);

-- Registro de descuentos y ajustes manuales (quién, cuánto, por qué).
create table public.quotation_adjustments (
  id            uuid primary key default gen_random_uuid(),
  quotation_id  uuid not null references public.quotations (id) on delete cascade,
  type          text not null check (type in ('descuento_porcentaje', 'descuento_monto', 'ajuste_manual')),
  value         numeric(12, 2) not null,
  amount        int not null,
  reason        text check (reason is null or length(reason) <= 300),
  created_by    uuid not null default auth.uid() references public.profiles (id),
  created_at    timestamptz not null default now()
);

create trigger quotations_set_updated_at before update on public.quotations
  for each row execute function public.set_updated_at();

-- Reglas de descuento y ajuste para el medidor (el admin no tiene límite).
create or replace function public.check_quotation_rules()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_enabled boolean;
  v_max numeric;
begin
  if tg_op = 'UPDATE' and old.status <> 'borrador' then
    if (new.subtotal_products, new.discount_amount, new.installation_amount, new.extras_amount, new.net_amount,
        new.iva_amount, new.total_calculated, new.manual_adjustment, new.total_final, new.iva_mode,
        new.pricing_snapshot, new.customer_snapshot, new.rectification_id)
       is distinct from
       (old.subtotal_products, old.discount_amount, old.installation_amount, old.extras_amount, old.net_amount,
        old.iva_amount, old.total_calculated, old.manual_adjustment, old.total_final, old.iva_mode,
        old.pricing_snapshot, old.customer_snapshot, old.rectification_id) then
      raise exception 'Esta cotización ya fue emitida y no se modifica. Crea una nueva.' using errcode = 'P0001';
    end if;
    if new.status = 'borrador' then
      raise exception 'Una cotización emitida no vuelve a borrador.' using errcode = 'P0001';
    end if;
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  if new.manual_adjustment <> 0 then
    raise exception 'Solo el administrador puede ajustar el total a mano.' using errcode = 'P0001';
  end if;
  if new.discount_type = 'monto' and new.discount_value > 0 then
    raise exception 'Solo el administrador puede aplicar descuentos por monto.' using errcode = 'P0001';
  end if;
  if new.discount_type = 'porcentaje' and new.discount_value > 0 then
    select medidor_discount_enabled, medidor_max_discount_pct into v_enabled, v_max
    from public.price_lists where id = new.price_list_id;
    if not coalesce(v_enabled, false) then
      raise exception 'El descuento no está habilitado para el medidor.' using errcode = 'P0001';
    end if;
    if new.discount_value > v_max then
      raise exception 'El descuento máximo permitido es % por ciento.', v_max using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
create trigger quotations_rules before insert or update on public.quotations
  for each row execute function public.check_quotation_rules();

-- Las líneas de una cotización emitida no se tocan.
create or replace function public.protect_quotation_items()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  select status into v_status from public.quotations where id = coalesce(new.quotation_id, old.quotation_id);
  if v_status is not null and v_status <> 'borrador' then
    raise exception 'Esta cotización ya fue emitida y no se modifica.' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger quotation_items_protect before insert or update or delete on public.quotation_items
  for each row execute function public.protect_quotation_items();

alter table public.quotations enable row level security;
alter table public.quotation_items enable row level security;
alter table public.quotation_adjustments enable row level security;

create policy quotations_select on public.quotations for select to authenticated
  using (public.can_access_rectification(rectification_id));
create policy quotations_insert on public.quotations for insert to authenticated
  with check (public.can_access_rectification(rectification_id) and created_by = auth.uid());
create policy quotations_update on public.quotations for update to authenticated
  using (public.can_access_rectification(rectification_id))
  with check (public.can_access_rectification(rectification_id));
create policy quotations_delete on public.quotations for delete to authenticated
  using (public.is_admin() or (public.can_access_rectification(rectification_id) and status = 'borrador'));

create policy quotation_items_all on public.quotation_items for all to authenticated
  using (exists (select 1 from public.quotations q where q.id = quotation_id))
  with check (exists (select 1 from public.quotations q where q.id = quotation_id));
create policy quotation_adjustments_select on public.quotation_adjustments for select to authenticated
  using (exists (select 1 from public.quotations q where q.id = quotation_id));
create policy quotation_adjustments_insert on public.quotation_adjustments for insert to authenticated
  with check (exists (select 1 from public.quotations q where q.id = quotation_id) and created_by = auth.uid());

-- Guarda la cotización completa (cabecera + líneas + registro de ajustes) en una transacción.
create or replace function public.save_quotation(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_q public.quotations;
  v_prev_adj int := 0;
  v_prev_disc numeric := 0;
  v_prev_type text := 'ninguno';
begin
  if v_id is null then
    insert into public.quotations (rectification_id, price_list_id, iva_mode, discount_type, discount_value,
      installation_mode, subtotal_products, discount_amount, installation_amount, extras_amount, net_amount,
      iva_amount, total_calculated, manual_adjustment, total_final, valid_days, notes, options,
      customer_snapshot, pricing_snapshot)
    values ((p ->> 'rectification_id')::uuid, nullif(p ->> 'price_list_id', '')::uuid, p ->> 'iva_mode',
      p ->> 'discount_type', (p ->> 'discount_value')::numeric, p ->> 'installation_mode',
      (p ->> 'subtotal_products')::int, (p ->> 'discount_amount')::int, (p ->> 'installation_amount')::int,
      (p ->> 'extras_amount')::int, (p ->> 'net_amount')::int, (p ->> 'iva_amount')::int,
      (p ->> 'total_calculated')::int, (p ->> 'manual_adjustment')::int, (p ->> 'total_final')::int,
      coalesce((p ->> 'valid_days')::int, 10), nullif(trim(p ->> 'notes'), ''), coalesce(p -> 'options', '{}'::jsonb),
      p -> 'customer_snapshot', p -> 'pricing_snapshot')
    returning * into v_q;
  else
    select manual_adjustment, discount_value, discount_type into v_prev_adj, v_prev_disc, v_prev_type
    from public.quotations where id = v_id;
    update public.quotations set
      price_list_id = nullif(p ->> 'price_list_id', '')::uuid, iva_mode = p ->> 'iva_mode',
      discount_type = p ->> 'discount_type', discount_value = (p ->> 'discount_value')::numeric,
      installation_mode = p ->> 'installation_mode', subtotal_products = (p ->> 'subtotal_products')::int,
      discount_amount = (p ->> 'discount_amount')::int, installation_amount = (p ->> 'installation_amount')::int,
      extras_amount = (p ->> 'extras_amount')::int, net_amount = (p ->> 'net_amount')::int,
      iva_amount = (p ->> 'iva_amount')::int, total_calculated = (p ->> 'total_calculated')::int,
      manual_adjustment = (p ->> 'manual_adjustment')::int, total_final = (p ->> 'total_final')::int,
      valid_days = coalesce((p ->> 'valid_days')::int, 10), notes = nullif(trim(p ->> 'notes'), ''),
      options = coalesce(p -> 'options', '{}'::jsonb), customer_snapshot = p -> 'customer_snapshot',
      pricing_snapshot = p -> 'pricing_snapshot'
    where id = v_id
    returning * into v_q;
    if v_q.id is null then
      raise exception 'No encontramos esa cotización.' using errcode = 'P0002';
    end if;
  end if;

  delete from public.quotation_items where quotation_id = v_q.id;
  insert into public.quotation_items (quotation_id, sort_order, kind, curtain_id, location_name, description,
    product_code, color_name, width_cm, height_cm, area_m2, base_price, min_price_applied, unit_price, quantity,
    line_total, layers)
  select v_q.id, (x.ord - 1)::int, l ->> 'kind',
         case when (select 1 from public.curtains c where c.id = nullif(l ->> 'curtain_id', '')::uuid) = 1
              then nullif(l ->> 'curtain_id', '')::uuid end,
         coalesce(l ->> 'location_name', ''), l ->> 'description', l ->> 'product_code', l ->> 'color_name',
         nullif(l ->> 'width_cm', '')::numeric, nullif(l ->> 'height_cm', '')::numeric,
         nullif(l ->> 'area_m2', '')::numeric, nullif(l ->> 'base_price', '')::int,
         coalesce((l ->> 'min_price_applied')::boolean, false), (l ->> 'unit_price')::int,
         (l ->> 'quantity')::int, (l ->> 'line_total')::int, l -> 'layers'
  from jsonb_array_elements(coalesce(p -> 'lines', '[]'::jsonb)) with ordinality as x(l, ord);

  -- Registro de ajustes (solo cuando cambian).
  if v_q.discount_type <> 'ninguno' and v_q.discount_value > 0
     and (v_q.discount_type, v_q.discount_value) is distinct from (v_prev_type, v_prev_disc) then
    insert into public.quotation_adjustments (quotation_id, type, value, amount, reason)
    values (v_q.id, case v_q.discount_type when 'porcentaje' then 'descuento_porcentaje' else 'descuento_monto' end,
            v_q.discount_value, v_q.discount_amount, nullif(trim(p ->> 'adjustment_reason'), ''));
  end if;
  if v_q.manual_adjustment <> 0 and v_q.manual_adjustment is distinct from v_prev_adj then
    insert into public.quotation_adjustments (quotation_id, type, value, amount, reason)
    values (v_q.id, 'ajuste_manual', v_q.manual_adjustment, v_q.manual_adjustment, nullif(trim(p ->> 'adjustment_reason'), ''));
  end if;

  return jsonb_build_object('id', v_q.id, 'number', v_q.number);
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['quotations', 'quotation_items', 'quotation_adjustments'] loop
    execute format('grant select, insert, update, delete on public.%1$s to authenticated', t);
    execute format('revoke all on public.%1$s from anon', t);
    execute format('revoke truncate, references, trigger on public.%1$s from authenticated', t);
  end loop;
end $$;
revoke update, delete on public.quotation_adjustments from authenticated;
grant execute on function public.save_quotation(jsonb) to authenticated;
grant execute on function public.next_quotation_number() to authenticated;
revoke execute on function public.check_quotation_rules() from public, anon, authenticated;
revoke execute on function public.protect_quotation_items() from public, anon, authenticated;


-- >>>>>>>>>> 20261121001000_business_and_documents.sql
-- Sprint 5 · Configuración de la empresa e imágenes generadas (HU-31, HU-35).
-- Ningún dato de empresa viene fijo: el administrador los completa en Configuración.

create table public.business_settings (
  id                   int primary key default 1 check (id = 1),
  business_name        text check (business_name is null or length(business_name) <= 80),
  tax_id               text check (tax_id is null or length(tax_id) <= 20),
  phone                text check (phone is null or length(phone) <= 30),
  email                text check (email is null or length(email) <= 120),
  website              text check (website is null or length(website) <= 120),
  address              text check (address is null or length(address) <= 200),
  logo_path            text,
  bank_name            text check (bank_name is null or length(bank_name) <= 60),
  bank_account_type    text check (bank_account_type is null or length(bank_account_type) <= 40),
  bank_account_number  text check (bank_account_number is null or length(bank_account_number) <= 40),
  bank_holder          text check (bank_holder is null or length(bank_holder) <= 80),
  bank_holder_tax_id   text check (bank_holder_tax_id is null or length(bank_holder_tax_id) <= 20),
  bank_email           text check (bank_email is null or length(bank_email) <= 120),
  delivery_time_text   text check (delivery_time_text is null or length(delivery_time_text) <= 80),
  warranty_text        text check (warranty_text is null or length(warranty_text) <= 80),
  conditions_text      text check (conditions_text is null or length(conditions_text) <= 3000),
  thank_you_text       text check (thank_you_text is null or length(thank_you_text) <= 120),
  accent_color         text not null default '#0F2A4A' check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  updated_at           timestamptz not null default now()
);
insert into public.business_settings (id, thank_you_text) values (1, 'Gracias por su preferencia') on conflict do nothing;

create trigger business_settings_set_updated_at before update on public.business_settings
  for each row execute function public.set_updated_at();

alter table public.business_settings enable row level security;
create policy business_settings_select on public.business_settings for select to authenticated using (public.is_active_user());
create policy business_settings_update on public.business_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select, update on public.business_settings to authenticated;
revoke all on public.business_settings from anon;

-- Copia de los datos de la empresa al emitir (cambios posteriores no alteran cotizaciones emitidas).
alter table public.quotations add column business_snapshot jsonb;

-- Emitir: congela la cotización y guarda la copia de la empresa. Solo desde borrador.
create or replace function public.issue_quotation(p_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare v_business jsonb;
begin
  select to_jsonb(b) - 'id' - 'updated_at' into v_business from public.business_settings b where id = 1;
  update public.quotations
  set status = 'emitida', issued_at = now(), business_snapshot = v_business
  where id = p_id and status = 'borrador';
  if not found then
    raise exception 'Solo se puede emitir una cotización en borrador.' using errcode = 'P0001';
  end if;
end;
$$;
grant execute on function public.issue_quotation(uuid) to authenticated;

-- business_snapshot tampoco cambia después de emitir.
create or replace function public.protect_business_snapshot()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.status <> 'borrador' and new.business_snapshot is distinct from old.business_snapshot then
    raise exception 'Esta cotización ya fue emitida y no se modifica. Crea una nueva.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger quotations_protect_business before update on public.quotations
  for each row execute function public.protect_business_snapshot();
revoke execute on function public.protect_business_snapshot() from public, anon, authenticated;

-- Imágenes generadas (cotización y, en el Sprint 6, confección).
create table public.generated_documents (
  id            uuid primary key default gen_random_uuid(),
  quotation_id  uuid not null references public.quotations (id) on delete cascade,
  kind          text not null check (kind in ('cotizacion', 'confeccion')),
  page          int not null check (page >= 1),
  page_count    int not null check (page_count >= 1 and page_count >= page),
  storage_path  text not null unique,
  created_by    uuid default auth.uid() references public.profiles (id),
  created_at    timestamptz not null default now(),
  unique (quotation_id, kind, page)
);
alter table public.generated_documents enable row level security;
create policy generated_documents_select on public.generated_documents for select to authenticated
  using (exists (select 1 from public.quotations q where q.id = quotation_id));
create policy generated_documents_insert on public.generated_documents for insert to authenticated
  with check (exists (select 1 from public.quotations q where q.id = quotation_id));
create policy generated_documents_delete on public.generated_documents for delete to authenticated
  using (public.is_admin());
grant select, insert, delete on public.generated_documents to authenticated;
revoke all on public.generated_documents from anon;

-- Buckets privados: documentos (ruta {rectificación}/{cotización}/archivo.png) y marca (logo).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760, array['image/png']),
       ('branding', 'branding', false, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy documents_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'documents' and public.can_access_rectification(public.try_uuid((storage.foldername(name))[1])));
create policy documents_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and public.can_access_rectification(public.try_uuid((storage.foldername(name))[1])));
create policy documents_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and public.is_admin());

create policy branding_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'branding' and public.is_active_user());
create policy branding_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'branding' and public.is_admin());
create policy branding_storage_update on storage.objects for update to authenticated
  using (bucket_id = 'branding' and public.is_admin());
create policy branding_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'branding' and public.is_admin());


-- >>>>>>>>>> 20261121001100_warranty_details.sql
-- Sprint 5 · ajuste: texto de garantía detallado (cobertura y casos no cubiertos) para la imagen.
-- Una línea por renglón; una línea que termina en «:» se muestra como subtítulo.
-- La copia congelada (business_snapshot) lo incluye sola, porque issue_quotation copia la fila completa.
alter table public.business_settings
  add column if not exists warranty_details_text text
    check (warranty_details_text is null or length(warranty_details_text) <= 3000);


-- >>>>>>>>>> 20261121001200_confection_rules.sql
-- Sprint 6 · Reglas de confección por producto (HU-42, D-25, D-30).
-- Cada columna es lo que se suma o resta (en cm) a la medida de terreno. NULL = esa pieza no aplica.
-- Base: ancho de la tela de terreno, salvo conf_fabric_h, que usa el alto.
-- Se guardan como columnas del producto (no como tabla aparte): son 6 valores fijos por producto,
-- y así el administrador los edita en la misma ficha del catálogo.
alter table public.products
  add column conf_fabric_w numeric(4,1) check (conf_fabric_w between -50 and 50),  -- tela ancho
  add column conf_fabric_h numeric(4,1) check (conf_fabric_h between -50 and 80),  -- tela alto
  add column conf_tube     numeric(4,1) check (conf_tube     between -50 and 50),  -- tubo
  add column conf_bottom   numeric(4,1) check (conf_bottom   between -50 and 50),  -- G polvo
  add column conf_cenefa   numeric(4,1) check (conf_cenefa   between -50 and 50),  -- cenefa (si la cortina la lleva)
  add column conf_roller   numeric(4,1) check (conf_roller   between -50 and 50);  -- rodillo extra del dúo

-- Valores informados por Gabriel (Excel y D-25). BOP usa los mismos que BO (D-30).
update public.products
set conf_fabric_w = -4, conf_fabric_h = 20, conf_tube = -3.5, conf_bottom = -3.5, conf_cenefa = -0.5
where code in ('SE', 'BO', 'BOP', 'RD', 'RDBO');

-- Dúo: rodillo extra = G polvo − 1 cm → ancho − 4,5.
update public.products set conf_roller = -4.5 where code in ('RD', 'RDBO');

-- VE: fabricación externa (fabricated = false), sin reglas. VC: sin reglas hasta que el administrador las cargue.
-- Los sistemas dobles (SE+BO, SE+BOP) no llevan reglas propias: cada tela usa las de su producto.


-- >>>>>>>>>> 20261121001300_rut_and_signature.sql
-- Ajustes pedidos por Gabriel (2026-11-21): RUT del cliente y firma de conformidad.

-- ============ RUT del cliente (opcional, validado, único) ============
-- Se guarda normalizado: sin puntos, con guion y K mayúscula → '12345678-5'.
create or replace function public.rut_is_valid(p_rut text)
returns boolean language plpgsql immutable set search_path = public as $$
declare
  v_body text;
  v_dv text;
  v_sum int := 0;
  v_mul int := 2;
  v_res int;
  v_expected text;
begin
  if p_rut is null or p_rut !~ '^[0-9]{7,8}-[0-9K]$' then return false; end if;
  v_body := split_part(p_rut, '-', 1);
  v_dv := split_part(p_rut, '-', 2);
  for i in reverse length(v_body)..1 loop
    v_sum := v_sum + substr(v_body, i, 1)::int * v_mul;
    v_mul := case when v_mul = 7 then 2 else v_mul + 1 end;
  end loop;
  v_res := 11 - (v_sum % 11);
  v_expected := case v_res when 11 then '0' when 10 then 'K' else v_res::text end;
  return v_dv = v_expected;
end;
$$;
grant execute on function public.rut_is_valid(text) to authenticated;

alter table public.customers
  add column rut text check (rut is null or public.rut_is_valid(rut));
create unique index customers_rut_key on public.customers (rut) where rut is not null;

-- La función de alta recibe el RUT (se reemplaza la versión de 7 parámetros).
drop function if exists public.create_customer_with_address(text, text, text, text, text, text, text);
create or replace function public.create_customer_with_address(
  p_full_name text,
  p_phone text,
  p_email text,
  p_notes text,
  p_address_line text,
  p_comuna text,
  p_reference text,
  p_rut text default null
)
returns public.customers
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_customer public.customers;
begin
  insert into public.customers (full_name, phone, email, notes, rut)
  values (p_full_name, p_phone, p_email, p_notes, nullif(p_rut, ''))
  returning * into v_customer;

  insert into public.customer_addresses (customer_id, address_line, comuna, reference, is_default)
  values (v_customer.id, p_address_line, p_comuna, p_reference, true);

  return v_customer;
end;
$$;
grant execute on function public.create_customer_with_address(text, text, text, text, text, text, text, text) to authenticated;

-- ============ Firma de conformidad del cliente ============
-- El cliente firma al terminar la rectificación: confirma medidas, colores y lo explicado.
-- La imagen va al bucket privado 'documents' en {rectification_id}/firma-*.png.
alter table public.rectifications
  add column signature_path text,
  add column signed_name    text check (signed_name is null or length(trim(signed_name)) between 2 and 120),
  add column signed_rut     text check (signed_rut is null or public.rut_is_valid(signed_rut)),
  add column signed_at      timestamptz;

-- Los datos de firma solo los escribe sign_rectification (fecha del servidor, no del teléfono).
-- Al volver a borrador la firma se borra: las medidas pueden cambiar y la firma ya no las respaldaría.
create or replace function public.protect_signature()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'borrador' and old.status = 'completa' then
    new.signature_path := null;
    new.signed_name := null;
    new.signed_rut := null;
    new.signed_at := null;
    return new;
  end if;
  if coalesce(current_setting('app.signing', true), '') <> 'on' and (
       new.signature_path is distinct from old.signature_path
    or new.signed_name is distinct from old.signed_name
    or new.signed_rut is distinct from old.signed_rut
    or new.signed_at is distinct from old.signed_at) then
    raise exception 'La firma solo se registra al completar la rectificación.';
  end if;
  return new;
end;
$$;
create trigger rectifications_protect_signature before update on public.rectifications
  for each row execute function public.protect_signature();

create or replace function public.sign_rectification(p_id uuid, p_path text, p_name text, p_rut text)
returns void language plpgsql security invoker set search_path = public as $$
declare
  v_status text;
begin
  select status into v_status from public.rectifications where id = p_id;
  if v_status is null then raise exception 'Rectificación no encontrada.'; end if;
  if v_status <> 'borrador' then raise exception 'La rectificación ya está completa.'; end if;
  if p_path is null or p_path not like p_id::text || '/firma-%.png' then raise exception 'Firma no válida.'; end if;
  if not exists (select 1 from public.locations l join public.curtains c on c.location_id = l.id where l.rectification_id = p_id) then
    raise exception 'Agrega al menos una cortina antes de firmar.';
  end if;
  perform set_config('app.signing', 'on', true);
  update public.rectifications
  set status = 'completa', signature_path = p_path, signed_name = trim(p_name), signed_rut = nullif(p_rut, ''), signed_at = now()
  where id = p_id;
  perform set_config('app.signing', 'off', true);
end;
$$;
grant execute on function public.sign_rectification(uuid, text, text, text) to authenticated;


-- >>>>>>>>>> 20261122001400_quotation_work_snapshot.sql
-- Confección e instalación salen de la cotización ACEPTADA, no de la rectificación (pedido del 22-11).
-- Lo que el cliente aprueba es la cotización: fábrica e instalador deben recibir exactamente esas medidas.

-- Copia de las cortinas y del trabajo (medidas por tela, color, caída, motor, instalación, cadena, cenefa,
-- extras, notas, fotos, fechas, observaciones y firma) tomada al guardar la cotización, con los mismos
-- datos con que se calcularon los precios.
alter table public.quotations add column work_snapshot jsonb;

-- Una vez emitida, la copia no cambia.
create or replace function public.protect_work_snapshot()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.status <> 'borrador' and new.work_snapshot is distinct from old.work_snapshot then
    raise exception 'Esta cotización ya fue emitida y no se modifica. Crea una nueva.' using errcode = 'P0001';
  end if;
  if old.status = 'borrador' and new.status = 'emitida' and new.work_snapshot is null then
    raise exception 'Vuelve a guardar la cotización antes de emitirla.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger quotations_protect_work_snapshot before update on public.quotations
  for each row execute function public.protect_work_snapshot();

-- Nuevo tipo de imagen: guía de instalación.
alter table public.generated_documents drop constraint if exists generated_documents_kind_check;
alter table public.generated_documents
  add constraint generated_documents_kind_check check (kind in ('cotizacion', 'confeccion', 'instalacion'));

-- Confección e instalación solo para cotizaciones aceptadas.
create or replace function public.check_document_kind()
returns trigger language plpgsql set search_path = public as $$
declare
  v_status text;
begin
  if new.kind in ('confeccion', 'instalacion') then
    select status into v_status from public.quotations where id = new.quotation_id;
    if v_status is distinct from 'aceptada' then
      raise exception 'La confección y la guía de instalación se crean cuando el cliente acepta la cotización.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
create trigger generated_documents_check_kind before insert on public.generated_documents
  for each row execute function public.check_document_kind();


-- >>>>>>>>>> 20261123001500_admin_purge.sql
-- Borrado completo por el administrador (pedido del 23-11): rectificación o cliente con todo lo suyo
-- (cotizaciones aunque estén emitidas o aceptadas, imágenes, fotos y firma). Sirve para limpiar datos de
-- prueba o corregir errores. El medidor sigue igual: solo borra lo suyo en borrador y sin cotizaciones.

-- El borrado en cascada de una cotización emitida pasa por la protección de sus líneas: se permite solo
-- dentro de estas funciones (marca app.purging).
create or replace function public.protect_quotation_items()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if tg_op = 'DELETE' and coalesce(current_setting('app.purging', true), '') = 'on' then
    return old;
  end if;
  select status into v_status from public.quotations where id = coalesce(new.quotation_id, old.quotation_id);
  if v_status is not null and v_status <> 'borrador' then
    raise exception 'Esta cotización ya fue emitida y no se modifica.' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;

-- El administrador puede borrar fotos aunque la rectificación ya no exista (limpieza después del borrado).
create policy curtain_photos_storage_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'curtain-photos' and public.is_admin());

-- Rutas de archivos de una rectificación (fotos, imágenes generadas y firma), para limpiar Storage.
create or replace function public.rectification_file_paths(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'photos', coalesce((
      select jsonb_agg(p.storage_path)
      from public.curtain_photos p
      join public.curtains c on c.id = p.curtain_id
      join public.locations l on l.id = c.location_id
      where l.rectification_id = p_id), '[]'::jsonb),
    'documents', coalesce((
      select jsonb_agg(d.storage_path)
      from public.generated_documents d
      join public.quotations q on q.id = d.quotation_id
      where q.rectification_id = p_id), '[]'::jsonb)
      || coalesce((select jsonb_agg(r.signature_path) from public.rectifications r where r.id = p_id and r.signature_path is not null), '[]'::jsonb)
  )
$$;
revoke execute on function public.rectification_file_paths(uuid) from public, anon, authenticated;

-- Borra una rectificación con sus cotizaciones. Devuelve las rutas de archivos para borrarlos de Storage.
create or replace function public.admin_delete_rectification(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_paths jsonb;
begin
  if not public.is_admin() then
    raise exception 'Solo el administrador puede eliminar todo.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.rectifications where id = p_id) then
    raise exception 'Rectificación no encontrada.' using errcode = 'P0001';
  end if;
  v_paths := public.rectification_file_paths(p_id);
  perform set_config('app.purging', 'on', true);
  delete from public.quotations where rectification_id = p_id;
  delete from public.rectifications where id = p_id;
  perform set_config('app.purging', 'off', true);
  return v_paths;
end;
$$;
grant execute on function public.admin_delete_rectification(uuid) to authenticated;

-- Borra un cliente con sus rectificaciones, cotizaciones y direcciones.
create or replace function public.admin_delete_customer(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_rect uuid;
  v_paths jsonb := jsonb_build_object('photos', '[]'::jsonb, 'documents', '[]'::jsonb);
  v_one jsonb;
begin
  if not public.is_admin() then
    raise exception 'Solo el administrador puede eliminar todo.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.customers where id = p_id) then
    raise exception 'Cliente no encontrado.' using errcode = 'P0001';
  end if;
  for v_rect in select id from public.rectifications where customer_id = p_id loop
    v_one := public.admin_delete_rectification(v_rect);
    v_paths := jsonb_build_object(
      'photos', (v_paths -> 'photos') || (v_one -> 'photos'),
      'documents', (v_paths -> 'documents') || (v_one -> 'documents'));
  end loop;
  delete from public.customers where id = p_id;
  return v_paths;
end;
$$;
grant execute on function public.admin_delete_customer(uuid) to authenticated;



-- >>>>>>>>>> 20261126001600_app_theme.sql
-- Colores de la app por empresa (pedido del 26-11): cada instalación muestra su marca.
-- theme_primary: fondos (menú lateral, encabezados, botones principales).
-- theme_secondary: resaltados (opción activa del menú, enlaces, chips).
-- Los valores por defecto son los colores actuales, así que una instalación existente no cambia.
-- (accent_color sigue siendo el color de las imágenes de cotización, confección e instalación.)
alter table public.business_settings
  add column if not exists theme_primary   text not null default '#0F2A4A' check (theme_primary ~ '^#[0-9A-Fa-f]{6}$'),
  add column if not exists theme_secondary text not null default '#2563EB' check (theme_secondary ~ '^#[0-9A-Fa-f]{6}$');


-- =====================================================================
-- PRIMER ADMINISTRADOR (ejecutar DESPUÉS de crear el usuario en Authentication > Users)
-- Cambia el correo y el nombre, selecciona solo estas líneas y presiona Run.
-- =====================================================================
-- update public.profiles
-- set role = 'admin', full_name = 'Nombre Apellido'
-- where id = (select id from auth.users where email = 'correo@empresa.cl');
