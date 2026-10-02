-- Proveedores: número de cliente (el nuestro con ellos), días de entrega y documentos con historial:
-- opinión de cumplimiento, constancia de situación fiscal y carátula de cuenta bancaria.
-- Cada subida es una versión nueva (no se edita ni se borra); la vigente es la de fecha más reciente.
-- Los archivos van en el bucket privado documentos-proveedores, en <id del proveedor>/<tipo>/<fecha>-<id>.<ext>
-- (por id y no por RFC: el almacenamiento no acepta la Ñ). Admin sube; admin y corporativo ven.
-- Requiere 0001–0020.

alter table proveedores
  add column numero_cliente text check (numero_cliente is null or length(numero_cliente) <= 60),
  add column dias_entrega   integer check (dias_entrega is null or dias_entrega between 0 and 365);

create table documentos_proveedor (
  id            uuid primary key default gen_random_uuid(),
  proveedor_id  uuid not null references proveedores(id),
  tipo          text not null check (tipo in ('opinion_cumplimiento', 'constancia_fiscal', 'caratula_banco')),
  fecha         date not null,
  ruta          text not null unique,
  subido_por    uuid references perfiles(id) default auth.uid(),
  subido_en     timestamptz not null default now(),
  check (ruta like proveedor_id::text || '/' || tipo || '/%'),
  check (fecha <= (now() at time zone 'America/Mexico_City')::date)
);
create index on documentos_proveedor (proveedor_id, tipo, fecha desc);

alter table documentos_proveedor enable row level security;
create policy ver_documentos_proveedor on documentos_proveedor for select using (ve_compras());
create policy subir_documento_proveedor on documentos_proveedor for insert
  with check (edita_compras() and subido_por = auth.uid());
-- Sin políticas de update ni delete: el historial no se toca.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos-proveedores', 'documentos-proveedores', false, 5242880,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy subir_documento_archivo on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos-proveedores' and public.edita_compras());
create policy ver_documento_archivo on storage.objects for select to authenticated
  using (bucket_id = 'documentos-proveedores' and public.ve_compras());
