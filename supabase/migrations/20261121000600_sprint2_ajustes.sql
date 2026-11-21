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
