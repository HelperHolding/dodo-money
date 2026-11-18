-- Solo lectura. Ejecutar después de supabase/migrations/20261118120000_saldo_boveda_desde_cierre.sql.
-- Comprueba en cada sucursal que el saldo de bóveda (saldos_cajas, usado por "Puede salir a corporativo",
-- recolecciones y reservas) sea igual al "Debe haber en bóveda" del cierre del día.
do $pruebas$
declare a uuid; r record; d jsonb; esperado numeric; n int:=0; detalle text:='';
begin
 select id into a from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='admin' limit 1;
 if a is null then raise exception 'FALTAN DATOS: un admin activo.';end if;
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 for r in select s.id,s.nombre,c.saldo from public.sucursales s join public.saldos_cajas c on c.sucursal_id=s.id and c.tipo='boveda' order by s.nombre loop
  d:=public.datos_boveda_cierre(r.id,public.hoy_mx()+1);
  esperado:=round(((d->>'bovedaInicial')::numeric+(d->>'retiros')::numeric-(d->>'aperturas')::numeric-(d->>'depositos')::numeric-(d->>'gastosBoveda')::numeric),2);
  if round(r.saldo,2)<>esperado then raise exception 'FALLÓ: % tiene saldo % y debe haber %.',r.nombre,r.saldo,esperado;end if;
  n:=n+1; detalle:=detalle||format(' · %s: %s',r.nombre,to_char(esperado,'FM999,999,990.00'));
 end loop;
 if n=0 then raise exception 'FALTAN DATOS: ninguna sucursal con bóveda.';end if;
 execute 'reset role';
 raise notice 'PRUEBAS OK (% bóvedas)%',n,detalle;
end $pruebas$;
