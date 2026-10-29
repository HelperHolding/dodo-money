-- Ejecutar completo después de 20261029130000_precios_rappi.sql. PRUEBAS OK revierte los datos mediante un ERROR intencional.
do $$
declare a uuid;r jsonb;ok boolean;
begin
  select id into a from public.perfiles where activo and rol::text='admin' limit 1;
  if a is null then raise exception 'FALTAN DATOS: un administrador activo.';end if;
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  insert into public.productos_venta(dodo_id,nombre) values(-900001,'Prueba Rappi Mediano'),(-900002,'Prueba  Rappi Mediano T'),(-900003,'Prueba Jamón y Champiñones Grande');

  -- 1. Liga por nombre sin acentos, mayúsculas ni espacios dobles; reporta lo que no encontró.
  r:=public.cargar_precios_rappi('2027-01-01','Prueba',jsonb_build_array(
    jsonb_build_object('renglon','Prueba 30 cm','nombres',jsonb_build_array('prueba rappi mediano','Prueba Rappi Mediano T'),'precio',159),
    jsonb_build_object('renglon','Jamón 35 cm','nombres',jsonb_build_array('Prueba Jamon y Champinones Grande'),'precio',239.5),
    jsonb_build_object('renglon','No existe','nombres',jsonb_build_array('Producto que no existe 999'),'precio',10)));
  if (r->>'cargados')::int<>3 or r->'sin_producto'<>'["No existe"]'::jsonb then raise exception 'FALLÓ: carga %',r;end if;
  if (select precio from public.precios_rappi where dodo_id=-900002 and vigente_desde='2027-01-01')<>159
    or (select precio from public.precios_rappi where dodo_id=-900003)<>239.5 then raise exception 'FALLÓ: precios guardados';end if;

  -- 2. Volver a cargar la misma fecha reemplaza el precio; otra fecha agrega una vigencia nueva.
  r:=public.cargar_precios_rappi('2027-01-01','Prueba 2',jsonb_build_array(jsonb_build_object('renglon','Prueba 30 cm','nombres',jsonb_build_array('Prueba Rappi Mediano'),'precio',165)));
  if (select precio from public.precios_rappi where dodo_id=-900001 and vigente_desde='2027-01-01')<>165 then raise exception 'FALLÓ: reemplazo';end if;
  r:=public.cargar_precios_rappi('2027-02-01','Prueba 3',jsonb_build_array(jsonb_build_object('renglon','Prueba 30 cm','nombres',jsonb_build_array('Prueba Rappi Mediano'),'precio',170)));
  if (select count(*) from public.precios_rappi where dodo_id=-900001)<>2 then raise exception 'FALLÓ: nueva vigencia';end if;

  -- 3. Un producto con dos precios distintos en la misma carga: rechazado.
  begin perform public.cargar_precios_rappi('2027-03-01','Prueba',jsonb_build_array(
    jsonb_build_object('renglon','A','nombres',jsonb_build_array('Prueba Rappi Mediano'),'precio',100),
    jsonb_build_object('renglon','B','nombres',jsonb_build_array('Prueba Rappi Mediano'),'precio',101)));ok:=true;
  exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: dos precios para un producto';end if;

  -- 4. Precio inválido: rechazado.
  begin perform public.cargar_precios_rappi('2027-03-01','Prueba',jsonb_build_array(jsonb_build_object('renglon','A','nombres',jsonb_build_array('Prueba Rappi Mediano'),'precio',0)));ok:=true;
  exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: precio cero aceptado';end if;
  begin perform public.cargar_precios_rappi('2027-03-01','Prueba',jsonb_build_array(jsonb_build_object('renglon','A','nombres',jsonb_build_array('Prueba Rappi Mediano'),'precio','159')));ok:=true;
  exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: precio como texto aceptado';end if;

  -- 5. Sin ser admin: rechazado.
  select id into a from public.perfiles where activo and rol::text<>'admin' limit 1;
  if a is not null then
    perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
    begin perform public.cargar_precios_rappi('2027-04-01','Prueba',jsonb_build_array(jsonb_build_object('renglon','A','nombres',jsonb_build_array('Prueba Rappi Mediano'),'precio',1)));ok:=true;
    exception when others then ok:=false;end;
    if ok then raise exception 'FALLÓ: usuario sin permiso pudo cargar';end if;
  end if;

  raise exception 'PRUEBAS OK';
end $$;
