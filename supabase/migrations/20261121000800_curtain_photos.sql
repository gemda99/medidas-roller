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
