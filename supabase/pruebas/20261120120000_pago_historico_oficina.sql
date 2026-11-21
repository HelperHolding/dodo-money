-- Solo lectura. Ejecutar después de supabase/migrations/20261120120000_pago_historico_oficina.sql.
do $pruebas$
declare d text;
begin
 select pg_get_functiondef('public.registrar_pago_simple(jsonb)'::regprocedure) into d;
 if position('v_factura.sucursal_id is not null and v_factura.sucursal_id<>v_sucursal' in d)=0 then raise exception 'FALLÓ: registrar_pago_simple no acepta documentos de Oficina central.';end if;
 if position('v_sucursal is null' in d)=0 then raise exception 'FALLÓ: el histórico dejó de exigir la sucursal de origen.';end if;
 if has_function_privilege('anon','public.registrar_pago_simple(jsonb)','execute') then raise exception 'FALLÓ: anónimo ejecuta.';end if;
 if not has_function_privilege('authenticated','public.registrar_pago_simple(jsonb)','execute') then raise exception 'FALLÓ: usuarios sin permiso.';end if;
 raise notice 'PRUEBAS OK';
end $pruebas$;
