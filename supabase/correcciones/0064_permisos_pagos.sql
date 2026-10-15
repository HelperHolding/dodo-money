-- Ejecutar si la migración 0064 ya fue aplicada. No vuelve a crear columnas ni funciones.
begin;
revoke all on public.pagos,public.pago_aplicaciones from public,anon,authenticated;
grant select on public.pagos,public.pago_aplicaciones to authenticated;
commit;
