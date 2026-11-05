-- Ejecutar completo después de 20261106120000_facturacion_clientes.sql. Solo lee el catálogo; PRUEBAS OK es un ERROR intencional.
do $$
declare v int;
begin
 if (select count(*) from public.facturacion_sucursales f join public.sucursales s on s.id=f.sucursal_id
     where s.dodois_unit_id='11f187558e757f53b0570d952420b810' and f.rfc_emisor='HCM260306B93')<>1 then
  raise exception 'FALLÓ: Mariano Otero no quedó ligada a Helper';end if;
 if not exists(select 1 from pg_indexes where indexname='facturas_clientes_un_ticket') then raise exception 'FALLÓ: falta el índice de un ticket, una factura';end if;
 select count(*) into v from pg_proc where proname like 'facturacion\_%' and prosecdef;
 if v<>6 then raise exception 'FALLÓ: se esperaban 6 funciones security definer de facturación y hay %',v;end if;
 if has_function_privilege('anon','public.facturacion_reservar(text,jsonb)','execute')
  or has_function_privilege('authenticated','public.facturacion_buscar_ticket(text,uuid,date,time,numeric)','execute') then
  raise exception 'FALLÓ: anon o authenticated pueden ejecutar funciones del servidor';end if;
 if not (select relrowsecurity from pg_class where oid='public.facturas_clientes'::regclass) then raise exception 'FALLÓ: facturas_clientes sin RLS';end if;
 if exists(select 1 from pg_constraint where conrelid='public.facturas_clientes'::regclass and confrelid='public.pedidos'::regclass) then raise exception 'FALLÓ: facturas_clientes no debe tener FK a pedidos';end if;
 raise exception 'PRUEBAS OK';
end $$;
