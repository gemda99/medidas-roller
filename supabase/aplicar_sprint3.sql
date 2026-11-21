-- Sprint 3: pega TODO este archivo en Supabase > Editor SQL > nueva consulta > Correr (una sola vez).

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
