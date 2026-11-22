-- Confección e instalación desde la cotización aceptada: pega TODO este archivo en Supabase > Editor SQL > nueva consulta > Correr (una sola vez).

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
