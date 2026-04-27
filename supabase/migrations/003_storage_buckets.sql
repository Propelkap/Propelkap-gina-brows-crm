-- =========================================================================
-- Storage buckets privados con RLS
-- =========================================================================
-- 3 buckets:
--   1. clientes-fotos       → fotos antes/después/cicatrización por procedimiento
--   2. consentimientos      → PDFs firmados digitalmente
--   3. agendapro-exports    → backup en frío de los exports CSV/JSON antes de migrar
-- =========================================================================

-- Crear buckets (idempotente)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'clientes-fotos',
    'clientes-fotos',
    false,
    10485760, -- 10 MB
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
  )
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'consentimientos',
    'consentimientos',
    false,
    5242880, -- 5 MB
    array['application/pdf', 'image/png', 'image/jpeg']
  )
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'agendapro-exports',
    'agendapro-exports',
    false,
    104857600, -- 100 MB (un export grande)
    array['text/csv', 'application/json', 'application/zip', 'application/x-zip-compressed']
  )
on conflict (id) do nothing;

-- =========================================================================
-- RLS POLICIES — solo authenticated users pueden leer/escribir.
-- Por ahora cualquier admin/técnica/recepción ve todo. Cuando entren más
-- técnicas refinamos a "técnica solo ve fotos de SUS procedimientos".
-- =========================================================================

-- Limpiar policies existentes si ya estaban (idempotente)
drop policy if exists "Authenticated read clientes-fotos" on storage.objects;
drop policy if exists "Authenticated write clientes-fotos" on storage.objects;
drop policy if exists "Authenticated update clientes-fotos" on storage.objects;
drop policy if exists "Authenticated delete clientes-fotos" on storage.objects;

drop policy if exists "Authenticated read consentimientos" on storage.objects;
drop policy if exists "Authenticated write consentimientos" on storage.objects;

drop policy if exists "Authenticated read agendapro-exports" on storage.objects;
drop policy if exists "Service role write agendapro-exports" on storage.objects;

-- clientes-fotos
create policy "Authenticated read clientes-fotos"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'clientes-fotos');

create policy "Authenticated write clientes-fotos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'clientes-fotos');

create policy "Authenticated update clientes-fotos"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'clientes-fotos');

create policy "Authenticated delete clientes-fotos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'clientes-fotos');

-- consentimientos (read-only para authenticated, write solo via service-role desde edge function)
create policy "Authenticated read consentimientos"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'consentimientos');

create policy "Authenticated write consentimientos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'consentimientos');

-- agendapro-exports (solo admins ven el backup en frío)
create policy "Authenticated read agendapro-exports"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'agendapro-exports'
    and exists (
      select 1 from public.usuarios u
      where u.id = auth.uid() and u.rol = 'admin' and u.activo = true
    )
  );

create policy "Authenticated write agendapro-exports"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'agendapro-exports'
    and exists (
      select 1 from public.usuarios u
      where u.id = auth.uid() and u.rol = 'admin' and u.activo = true
    )
  );
