-- Foto del ticket o recibo en los gastos de caja chica (opcional).
-- Las fotos viven en un bucket privado; la primera carpeta de cada archivo es la sucursal.
-- Igual que el resto: se pueden subir y ver, pero no reemplazar ni borrar.
-- Requiere 0001_control_efectivo.sql (gastos_caja_chica, mi_sucursal(), mi_rol()).

alter table gastos_caja_chica
  add column foto_path text,
  add constraint gastos_foto_de_su_sucursal check (foto_path is null or foto_path like sucursal_id::text || '/%');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comprobantes', 'comprobantes', false, 4194304,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do nothing;

create policy subir_comprobante on storage.objects for insert to authenticated
  with check (bucket_id = 'comprobantes' and (storage.foldername(name))[1] = public.mi_sucursal()::text);

create policy ver_comprobante on storage.objects for select to authenticated
  using (bucket_id = 'comprobantes'
         and ((storage.foldername(name))[1] = public.mi_sucursal()::text or public.mi_rol() = 'admin'));

-- Sin políticas de update ni delete: una foto subida no se reemplaza ni se borra.
