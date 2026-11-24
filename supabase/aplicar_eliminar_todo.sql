-- Eliminar todo (solo administrador): pega TODO este archivo en Supabase > Editor SQL > nueva consulta > Correr (una sola vez).

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

