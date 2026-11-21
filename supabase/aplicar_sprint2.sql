-- Sprint 2: pega TODO este archivo en Supabase > Editor SQL > nueva consulta > Correr (una sola vez).

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
