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
