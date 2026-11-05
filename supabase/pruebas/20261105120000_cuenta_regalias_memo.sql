-- Ejecutar completo después de 20261105120000_cuenta_regalias_memo.sql. Solo lee el catálogo; PRUEBAS OK es un ERROR intencional.
do $$
declare t text; n int; def text;
begin
 foreach t in array array['proveedores','facturas','factura_conceptos'] loop
  select count(*), max(pg_get_constraintdef(c.oid)) into n, def from pg_constraint c
   where c.conrelid=('public.'||t)::regclass and c.contype='c' and pg_get_constraintdef(c.oid) like '%cuenta_pl%';
  if n<>1 then raise exception 'FALLÓ: % tiene % CHECK sobre cuenta_pl',t,n;end if;
  if def not like '%''regalias''%' or def not like '%''insumos''%' or def not like '%''inversiones''%' or def not like '%''otros''%' then
   raise exception 'FALLÓ: el CHECK de % no admite las cuentas esperadas: %',t,def;end if;
 end loop;
 -- Caja chica sigue sin regalías.
 select max(pg_get_constraintdef(c.oid)) into def from pg_constraint c where c.conname='gastos_caja_chica_cuenta_pl_check';
 if def is null or def like '%regalias%' then raise exception 'FALLÓ: caja chica cambió: %',def;end if;
 raise exception 'PRUEBAS OK';
end $$;
