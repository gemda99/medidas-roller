-- RUT del cliente y firma de conformidad: pega TODO este archivo en Supabase > Editor SQL > nueva consulta > Correr (una sola vez).

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
