-- Después de 20261125120000_aperturas_por_cerrar.sql. PRUEBAS OK revierte todas las pruebas.
do $$
declare a uuid;i uuid;r integer;o public.apertura_items;
begin
 select id into a from public.perfiles where activo and rol::text='admin' limit 1;
 select * into o from public.apertura_items where tipo='actividad' order by clave limit 1;i:=o.id;r:=o.revision;
 if a is null or i is null then raise exception 'FALTAN DATOS: admin activo y una actividad de apertura.';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 perform public.actualizar_apertura_item(i,r,jsonb_strip_nulls(jsonb_build_object('estado','por_cerrar','responsable',o.responsable,'inicio',o.inicio,'fin',o.fin,'cantidad',o.cantidad,'recibido',o.recibido,'precio',o.precio,'evidencia',o.evidencia,'notas',o.notas,'orden_id',o.orden_id,'factura_id',o.factura_id)));
 if (select estado from public.apertura_items where id=i)<>'por_cerrar' then raise exception 'FALLÓ: la actividad no quedó en por_cerrar';end if;
 if (select (responsable,inicio,fin,cantidad,recibido,precio,evidencia,notas,orden_id,factura_id) is distinct from (o.responsable,o.inicio,o.fin,o.cantidad,o.recibido,o.precio,o.evidencia,o.notas,o.orden_id,o.factura_id) from public.apertura_items where id=i) then raise exception 'FALLÓ: se alteraron otros campos';end if;
 raise exception 'PRUEBAS OK — actividad en por_cerrar sin evidencia · demás campos conservados';
end $$;
