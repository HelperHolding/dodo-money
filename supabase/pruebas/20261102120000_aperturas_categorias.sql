-- Después de 20261102120000_aperturas_categorias.sql y supabase/cargas/equipo_categorias_dodo_2.sql. PRUEBAS OK revierte todas las pruebas.
do $$
declare a uuid;p uuid;i uuid;t uuid;m uuid;r integer;n integer;
begin
 select id into a from public.perfiles where activo and rol::text='admin' limit 1;
 select count(*),min(x.id::text)::uuid into n,p from public.apertura_proyectos x join public.sucursales s on s.id=x.sucursal_id where lower(s.nombre) like '%dodo-2%';
 if a is null or n<>1 then raise exception 'FALTAN DATOS: admin y una sola apertura de Dodo-2.';end if;
 if (select count(*) from public.apertura_items where proyecto_id=p and categoria='equipo_cocina')<88
 or (select count(*) from public.apertura_items where proyecto_id=p and categoria='mobiliario')<11
 or (select count(*) from public.apertura_items where proyecto_id=p and categoria='camara_fria')<1 then raise exception 'FALLÓ: el plano cargado en 0037 no quedó categorizado';end if;
 if exists(select 1 from public.apertura_items where proyecto_id=p and clave like 'PL-%' and categoria is null) then raise exception 'FALLÓ: concepto del plano sin categoría';end if;
 if exists(select 1 from public.apertura_items where proyecto_id=p and tipo in ('actividad','tecnico') and categoria is not null) then raise exception 'FALLÓ: actividad con categoría';end if;
 if (select count(*) from public.apertura_items where proyecto_id=p and clave like 'ESP-%')<>67 then raise exception 'FALLÓ: carga de equipo.xlsx incompleta';end if;
 if exists(select 1 from public.apertura_items where proyecto_id=p and tipo='equipo' and categoria is null and original->'celdas'->>0 in ('Equipment schedule','Low power equipment schedule')) then raise exception 'FALLÓ: concepto del presupuesto sin categoría';end if;
 if (select count(*) from public.apertura_items where proyecto_id=p and tipo='equipo' and nombre ilike '%mikrotik%')>1 then raise exception 'FALLÓ: router duplicado con el presupuesto';end if;
 if exists(select 1 from (values('puertas',4),('zoclos',2),('pisos',2),('acabados',6),('paneles',4),('contactos',14),('salidas_cable',5),('baja_tension',1),('iluminacion',10),('plafones',4),('sanitarios',2),('senaletica_interior',10),('senaletica_fachada',3)) e(c,n)
  where (select count(*) from public.apertura_items where proyecto_id=p and clave like 'ESP-%' and categoria=e.c)<>e.n) then raise exception 'FALLÓ: conceptos por categoría';end if;
 if (select sum(cantidad) from public.apertura_items where proyecto_id=p and clave like 'ESP-11-%')<>37 then raise exception 'FALLÓ: el resumen de contactos debe sumar 37';end if;
 if exists(select 1 from public.apertura_items where proyecto_id=p and clave like 'ESP-%' and (tipo<>'equipo' or estado<>'por_cotizar' or cantidad is null or fuente not like 'equipo.xlsx / %')) then raise exception 'FALLÓ: conceptos nuevos sin cantidad, fuente o estado inicial';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 select id,revision into i,r from public.apertura_items where proyecto_id=p and clave='ESP-13-001';
 perform public.actualizar_apertura_item(i,r,'{"estado":"pedido","cantidad":"2","recibido":"0","evidencia":"","categoria":"senaletica_interior"}');
 if (select categoria from public.apertura_items where id=i)<>'senaletica_interior' then raise exception 'FALLÓ: cambiar categoría';end if;
 perform public.actualizar_apertura_item(i,r+1,'{"estado":"pedido","cantidad":"2","recibido":"0"}');
 if (select categoria from public.apertura_items where id=i)<>'senaletica_interior' then raise exception 'FALLÓ: guardar sin categoría la borró';end if;
 if not exists(select 1 from public.apertura_historial where item_id=i and anterior->>'categoria'='iluminacion' and nuevo->>'categoria'='senaletica_interior') then raise exception 'FALLÓ: historial de categoría';end if;
 perform public.actualizar_apertura_item(i,r+2,'{"estado":"pedido","cantidad":"2","recibido":"0","categoria":""}');
 if (select categoria from public.apertura_items where id=i) is not null then raise exception 'FALLÓ: quitar categoría';end if;
 begin perform public.actualizar_apertura_item(i,r+3,'{"estado":"pedido","cantidad":"2","categoria":"cocina"}');raise exception 'FALLÓ: categoría inventada';exception when check_violation then null;end;
 select id,revision into t,r from public.apertura_items where proyecto_id=p and clave='T-001';
 begin perform public.actualizar_apertura_item(t,r,'{"estado":"pendiente","categoria":"pisos"}');raise exception 'FALLÓ: categoría en actividad';exception when others then if sqlerrm<>'Solo el equipo y las compras llevan categoría.' then raise;end if;end;
 m:=public.agregar_apertura_item(p,'equipo','P5','Luminaria de prueba','iluminacion');
 if (select categoria from public.apertura_items where id=m)<>'iluminacion' then raise exception 'FALLÓ: alta con categoría';end if;
 m:=public.agregar_apertura_item(p,'equipo','P4','Equipo sin categoría');
 if (select categoria from public.apertura_items where id=m) is not null then raise exception 'FALLÓ: alta sin categoría';end if;
 begin perform public.agregar_apertura_item(p,'actividad','P1','Actividad con categoría','pisos');raise exception 'FALLÓ: actividad con categoría';exception when others then if sqlerrm<>'Solo el equipo y las compras llevan categoría.' then raise;end if;end;
 if has_function_privilege('anon','public.agregar_apertura_item(uuid,text,text,text,text)','EXECUTE') or to_regprocedure('public.agregar_apertura_item(uuid,text,text,text)') is not null then raise exception 'FALLÓ: permisos de alta';end if;
 raise exception 'PRUEBAS OK — plano categorizado · 67 conceptos de equipo.xlsx sin duplicar el presupuesto · contactos suman 37 · cambiar y quitar categoría con historial · guardar sin categoría la conserva · categorías válidas · actividades sin categoría · alta con y sin categoría';
end $$;
