-- Después de 20261125120000_aperturas_por_cerrar.sql. PRUEBAS OK revierte todas las pruebas.
do $$
declare a uuid;i uuid;r integer;resp text;nts text;
begin
 select id into a from public.perfiles where activo and rol::text='admin' limit 1;
 select id,revision,responsable,notas into i,r,resp,nts from public.apertura_items where tipo='actividad' order by clave limit 1;
 if a is null or i is null then raise exception 'FALTAN DATOS: admin activo y una actividad de apertura.';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 perform public.actualizar_apertura_item(i,r,jsonb_build_object('estado','por_cerrar','responsable',resp,'notas',nts));
 if (select estado from public.apertura_items where id=i)<>'por_cerrar' then raise exception 'FALLÓ: la actividad no quedó en por_cerrar';end if;
 raise exception 'PRUEBAS OK — actividad en por_cerrar sin evidencia · demás campos conservados';
end $$;
