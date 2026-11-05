-- Cuenta memo "regalias" para proveedores, facturas, conceptos y gastos sin CFDI (facturas del franquiciador).
-- No entra al EBITDA: el renglón de regalías del P&L se sigue calculando como venta × tasa; lo facturado se ve en el memo.
-- Caja chica no cambia (las regalías no se pagan en efectivo). La equivalencia contable no cambia: como gasto de tienda
-- u oficina, contabilidad_privada.asignar ya admite 602-% / 603-% (el catálogo propone 602-71-004).
-- Requiere 0025 y 0026. Solo amplía los CHECK; no modifica datos.
begin;
set local lock_timeout='5s';
alter table public.proveedores drop constraint proveedores_cuenta_pl_check;
alter table public.proveedores add constraint proveedores_cuenta_pl_check check(cuenta_pl in
 ('repartidores','marketing_agregadores','marketing','renta','servicios','mantenimiento','consumibles_equipo','otros','insumos','inversiones','regalias'));
alter table public.facturas drop constraint facturas_cuenta_pl_check;
alter table public.facturas add constraint facturas_cuenta_pl_check check(cuenta_pl in
 ('repartidores','marketing_agregadores','marketing','renta','servicios','mantenimiento','consumibles_equipo','otros','insumos','inversiones','regalias'));
alter table public.factura_conceptos drop constraint factura_conceptos_cuenta_pl_check;
alter table public.factura_conceptos add constraint factura_conceptos_cuenta_pl_check check(cuenta_pl in
 ('repartidores','marketing_agregadores','marketing','renta','servicios','mantenimiento','consumibles_equipo','otros','insumos','inversiones','regalias'));
commit;
