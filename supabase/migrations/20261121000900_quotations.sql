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
