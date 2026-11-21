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
