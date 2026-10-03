-- 1. Datos de la empresa para el formato de la orden de compra: régimen fiscal, código postal, domicilio y correo de compras.
-- 2. Corte de Rappi en el cierre del día (mientras no esté la integración): el monto del reporte de Rappi y su foto o PDF.
--    Se captura al cerrar o, si el reporte llega después, una sola vez con registrar_corte_rappi().
--    El archivo va en el bucket comprobantes, en <sucursal>/rappi/…; el bucket ahora también acepta PDF.
-- Requiere 0001–0022.

alter table empresa
  add column regimen_fiscal text check (regimen_fiscal is null or regimen_fiscal ~ '^6[0-9]{2}$'),
  add column codigo_postal  text check (codigo_postal is null or codigo_postal ~ '^[0-9]{5}$'),
  add column domicilio      text,
  add column correo_compras text check (correo_compras is null or correo_compras ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');

alter table cierres_dia
  add column rappi_corte      numeric(12,2) check (rappi_corte is null or rappi_corte >= 0),
  add column rappi_corte_ruta text,
  add constraint corte_rappi_de_su_sucursal check (rappi_corte_ruta is null or rappi_corte_ruta like sucursal_id::text || '/rappi/%');

update storage.buckets
   set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
 where id = 'comprobantes';

-- Corte de Rappi que llegó después de cerrar el día: el gerente o el admin lo registran una sola vez.
create or replace function registrar_corte_rappi(p_cierre uuid, p_monto numeric, p_ruta text) returns void
language plpgsql security definer set search_path = public as $$
declare c cierres_dia;
begin
  if mi_rol()::text = 'corporativo' then raise exception 'Corporativo solo puede consultar.'; end if;
  if mi_rol() not in ('gerente', 'admin') then raise exception 'Solo el gerente o el admin registran el corte de Rappi'; end if;
  if p_monto is null or p_monto < 0 then raise exception 'Escribe el total del corte de Rappi'; end if;
  select * into c from cierres_dia where id = p_cierre for update;
  if not found then raise exception 'Cierre no encontrado'; end if;
  if c.sucursal_id <> mi_sucursal() and mi_rol() <> 'admin' then raise exception 'El cierre es de otra sucursal'; end if;
  if c.rappi_corte is not null then raise exception 'El corte de Rappi de ese día ya está registrado'; end if;
  update cierres_dia set rappi_corte = p_monto, rappi_corte_ruta = p_ruta where id = p_cierre;
end $$;
revoke execute on function registrar_corte_rappi(uuid, numeric, text) from public, anon;
grant execute on function registrar_corte_rappi(uuid, numeric, text) to authenticated;
