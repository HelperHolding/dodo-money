-- Prueba de punta a punta del extractor Rappi: borra las 7 órdenes del 20/10/2026 importadas con
-- "Ventas Rappi 2026-10-20.xlsx" para volver a meterlas con la tarea programada.
-- rappi_lineas se borra en cascada. Se conservan rappi_tiendas y rappi_productos (vínculos a SKU intactos).
begin;

-- Antes: 7 órdenes, 12 renglones, 1896.50 de subtotal restaurante.
select count(*) as ordenes,
       (select count(*) from rappi_lineas l where l.rappi_id = any(array['2481968741','2482038959','2482102080','2482108913','2482121068','2482139638','2482139768'])) as renglones,
       sum(subtotal_restaurante) as subtotal
from rappi_ordenes
where fecha = '2026-10-20' and tienda_id = 'MX1930486109' and archivo = 'Ventas Rappi 2026-10-20.xlsx';

delete from rappi_ordenes
where fecha = '2026-10-20' and tienda_id = 'MX1930486109' and archivo = 'Ventas Rappi 2026-10-20.xlsx'
  and rappi_id = any(array['2481968741','2482038959','2482102080','2482108913','2482121068','2482139638','2482139768']);

-- Después: 0 órdenes del 20/10 para esta tienda.
select count(*) as quedan from rappi_ordenes where fecha = '2026-10-20' and tienda_id = 'MX1930486109';

commit;
