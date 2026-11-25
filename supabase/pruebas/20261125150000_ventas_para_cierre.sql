-- Después de 20261125150000_ventas_para_cierre.sql. PRUEBAS OK revierte todas las pruebas.
do $$
declare v record;p uuid;r record;n int;
begin
 select * into v from public.ventas_dia order by fecha desc limit 1;
 if v.id is null then raise exception 'FALTAN DATOS: alguna fila en ventas_dia.';end if;
 select id into p from public.perfiles where activo and not debe_cambiar_contrasena and sucursal_id=v.sucursal_id and rol::text in ('encargado','gerente','admin') order by rol::text limit 1;
 if p is null then
  select id into p from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='admin' limit 1;
  if p is null then raise exception 'FALTAN DATOS: un perfil activo encargado, gerente o admin.';end if;
  select * into v from public.ventas_dia where sucursal_id=(select sucursal_id from public.perfiles where id=p) order by fecha desc limit 1;
  if v.id is null then raise exception 'FALTAN DATOS: ventas_dia en la sucursal del admin.';end if;
 end if;
 perform set_config('request.jwt.claims',json_build_object('sub',p,'role','authenticated')::text,true);
 select * into r from public.ventas_para_cierre(v.fecha);
 if r.total is distinct from v.total then raise exception 'FALLÓ: total % distinto de %',r.total,v.total;end if;
 if r.actualizado_en is null then raise exception 'FALLÓ: sin actualizado_en';end if;
 select count(*) into n from public.ventas_para_cierre(date '1900-01-01');
 if n<>0 then raise exception 'FALLÓ: una fecha sin ventas devolvió filas';end if;
 raise exception 'PRUEBAS OK — la función devuelve el total del día con su hora de actualización · sin ventas no devuelve filas';
end $$;
