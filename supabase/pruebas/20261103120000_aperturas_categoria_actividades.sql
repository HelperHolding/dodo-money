-- Después de 20261103120000_aperturas_categoria_actividades.sql. PRUEBAS OK revierte todas las pruebas.
do $$
declare a uuid;p uuid;n integer;t uuid;v uuid;r integer;
begin
 select id into a from public.perfiles where activo and rol::text='admin' limit 1;
 select count(*),min(x.id::text)::uuid into n,p from public.apertura_proyectos x join public.sucursales s on s.id=x.sucursal_id where lower(s.nombre) like '%dodo-2%';
 if a is null or n<>1 then raise exception 'FALTAN DATOS: admin y una sola apertura de Dodo-2.';end if;
 if exists(select 1 from pg_constraint where conname='apertura_items_categoria_compra') then raise exception 'FALLÓ: sigue la restricción de categoría solo para compras';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 t:=public.agregar_apertura_item(p,'actividad','P5','Instalar luminarias (prueba)','iluminacion');
 if not exists(select 1 from public.apertura_items where id=t and tipo='actividad' and categoria='iluminacion' and estado='pendiente') then raise exception 'FALLÓ: alta de actividad con categoría';end if;
 perform public.actualizar_apertura_item(t,1,'{"estado":"en_curso","categoria":"plafones"}');
 if (select categoria from public.apertura_items where id=t)<>'plafones' then raise exception 'FALLÓ: cambiar la categoría de una actividad';end if;
 perform public.actualizar_apertura_item(t,2,'{"estado":"en_curso"}');
 if (select categoria from public.apertura_items where id=t)<>'plafones' then raise exception 'FALLÓ: guardar sin categoría la borró';end if;
 select id,revision into v,r from public.apertura_items where proyecto_id=p and tipo='tecnico' order by clave limit 1;
 perform public.actualizar_apertura_item(v,r,'{"estado":"en_curso","categoria":"contactos"}');
 if (select categoria from public.apertura_items where id=v)<>'contactos' then raise exception 'FALLÓ: categoría en validación técnica';end if;
 begin perform public.agregar_apertura_item(p,'actividad','P5','Categoría inventada','cocina');raise exception 'FALLÓ: categoría inventada';exception when check_violation then null;end;
 if (select count(*) from public.apertura_items where proyecto_id=p and clave like 'ESP-%' and categoria is null)>0 then raise exception 'FALLÓ: se perdió la categoría del equipo cargado';end if;
 raise exception 'PRUEBAS OK — actividades y validaciones con categoría · cambiar categoría con historial · guardar sin categoría la conserva · categorías válidas · equipo cargado intacto';
end $$;
