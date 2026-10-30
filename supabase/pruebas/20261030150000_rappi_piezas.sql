-- Ejecutar completo después de 20261030150000_rappi_piezas.sql. PRUEBAS OK revierte los datos mediante un ERROR intencional.
-- Comprueba: admin guarda y reemplaza piezas y se limpia el vínculo simple; rechazos de cantidades, repetidos y no-admin; solo lectura para la app.
begin;
do $prueba$
declare a uuid;co uuid;p bigint;d1 integer;d2 integer;
begin
 select id into a from public.perfiles where rol::text='admin' and activo limit 1;
 select id into co from public.perfiles where rol::text='corporativo' and activo limit 1;
 select dodo_id into d1 from public.productos_venta order by dodo_id limit 1;
 select dodo_id into d2 from public.productos_venta where dodo_id<>d1 order by dodo_id limit 1;
 if a is null or co is null or d1 is null or d2 is null then raise exception 'FALTAN DATOS: admin y corporativo activos y dos productos del catálogo.';end if;
 insert into public.rappi_productos(clave,nombre,dodo_id) values(md5('ensayo-piezas')||md5('ensayo-piezas-2'),'ENSAYO · Pepperoni + dip',d1) returning id into p;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 set local role authenticated;
 perform public.guardar_piezas_rappi(p,jsonb_build_array(jsonb_build_object('dodo_id',d1,'cantidad',1),jsonb_build_object('dodo_id',d2,'cantidad',2)));
 if (select count(*) from public.rappi_producto_piezas where rappi_producto_id=p)<>2 or (select dodo_id from public.rappi_productos where id=p) is not null then raise exception 'FALLÓ: no guardó las piezas o no limpió el vínculo simple';end if;
 perform public.guardar_piezas_rappi(p,jsonb_build_array(jsonb_build_object('dodo_id',d2,'cantidad',1.5)));
 if (select string_agg(dodo_id||':'||cantidad,',') from public.rappi_producto_piezas where rappi_producto_id=p)<>d2||':1.500' then raise exception 'FALLÓ: no reemplazó las piezas';end if;
 begin perform public.guardar_piezas_rappi(p,jsonb_build_array(jsonb_build_object('dodo_id',d1,'cantidad',0)));raise exception 'FALLÓ: cantidad cero';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 begin perform public.guardar_piezas_rappi(p,jsonb_build_array(jsonb_build_object('dodo_id',d1,'cantidad',1),jsonb_build_object('dodo_id',d1,'cantidad',1)));raise exception 'FALLÓ: repetido';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 begin perform public.guardar_piezas_rappi(p,jsonb_build_array(jsonb_build_object('dodo_id',-1,'cantidad',1)));raise exception 'FALLÓ: producto inexistente';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 perform public.guardar_piezas_rappi(p,'[]'::jsonb);
 if exists(select 1 from public.rappi_producto_piezas where rappi_producto_id=p) then raise exception 'FALLÓ: no quitó las piezas';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',co,'role','authenticated')::text,true);
 begin perform public.guardar_piezas_rappi(p,jsonb_build_array(jsonb_build_object('dodo_id',d1,'cantidad',1)));raise exception 'FALLÓ: corporativo guardó';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 reset role;
 if has_table_privilege('authenticated','public.rappi_producto_piezas','insert') or has_table_privilege('anon','public.rappi_producto_piezas','select') then raise exception 'FALLÓ: permisos de tabla';end if;
 raise exception 'PRUEBAS OK';
end;
$prueba$;
rollback;
