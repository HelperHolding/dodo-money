-- Después de 20261125150000_ventas_para_cierre.sql. PRUEBAS OK revierte todas las pruebas.
do $$
declare v record;p uuid;r record;n int;
begin
 select * into v from public.ventas_dia where fecha >= (now() at time zone 'America/Mexico_City')::date - 1 and fecha <= (now() at time zone 'America/Mexico_City')::date order by fecha desc limit 1;
 if v.id is null then raise exception 'FALTAN DATOS: no hay ventas sincronizadas de hoy o ayer en ventas_dia; espera la sincronización de Dodo IS y repite.';end if;
 select id into p from public.perfiles where activo and not debe_cambiar_contrasena and sucursal_id=v.sucursal_id and rol::text in ('encargado','gerente','admin') order by rol::text limit 1;
 if p is null then
  select id into p from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='admin' and sucursal_id is not null order by id limit 1;
  if p is null then raise exception 'FALTAN DATOS: ningún encargado/gerente/admin activo tiene asignada una sucursal con ventas';end if;
  select * into v from public.ventas_dia where sucursal_id=(select sucursal_id from public.perfiles where id=p) and fecha >= (now() at time zone 'America/Mexico_City')::date - 1 and fecha <= (now() at time zone 'America/Mexico_City')::date order by fecha desc limit 1;
  if v.id is null then raise exception 'FALTAN DATOS: no hay ventas sincronizadas de hoy o ayer para la sucursal del encargado/gerente/admin elegido';end if;
 end if;
 perform set_config('request.jwt.claims',json_build_object('sub',p,'role','authenticated')::text,true);
 select * into r from public.ventas_para_cierre(v.fecha);
 if r.total is distinct from v.total then raise exception 'FALLÓ: total % distinto de %',r.total,v.total;end if;
 if r.actualizado_en is null then raise exception 'FALLÓ: sin actualizado_en';end if;
 select count(*) into n from public.ventas_para_cierre(date '1900-01-01');
 if n<>0 then raise exception 'FALLÓ: una fecha sin ventas devolvió filas';end if;
 select count(*) into n from public.ventas_para_cierre((now() at time zone 'America/Mexico_City')::date - 2);
 if n<>0 then raise exception 'FALLÓ: una fecha anterior a ayer devolvió filas';end if;
 raise exception 'PRUEBAS OK — la función devuelve el total del día con su hora de actualización · sin ventas o antes de ayer no devuelve filas';
end $$;
