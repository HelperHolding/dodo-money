-- Ejecutar completo después de 20261026200000_rappi_conservar_costeo_manual.sql. PRUEBAS OK revierte los datos mediante un ERROR intencional.
do $$
declare a uuid;s uuid;o jsonb;p jsonb;r jsonb;manual bigint;generico bigint;actual bigint;
begin
  select id into a from perfiles where activo and rol::text='admin' limit 1;
  select id into s from sucursales limit 1;
  if a is null or s is null then raise exception 'FALTAN DATOS: admin y sucursal.';end if;
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  o:=jsonb_build_array(jsonb_build_object('rappi_id','999999999000333','tienda_id','MX999999000333','fecha',hoy_mx(),'hora','20:15','estado','Finalizado','pago','Efectivo','bruto',265,'descuento_restaurante',40,'subtotal_restaurante',225,'descuento_rappi',25,'facturar',200));
  p:=jsonb_build_array(jsonb_build_object('rappi_id','999999999000333','linea',1,'nombre','El de Siempre','opciones','Verduras y Champiñones','cantidad',1,'importe',265,'clave',repeat('d',64)));
  r:=importar_rappi(s,'prueba.json',repeat('a',64),o,p);
  select producto_id into generico from rappi_lineas where rappi_id='999999999000333' and linea=1;
  -- Costeo manual del admin para este renglón.
  insert into rappi_productos(clave,nombre) values(repeat('e',64),'Rappi interno · 999999999000333/1 · combo confirmado') returning id into manual;
  update rappi_lineas set producto_id=manual where rappi_id='999999999000333' and linea=1;

  -- 1. Reimportación idéntica: conserva el costeo manual.
  r:=importar_rappi(s,'prueba.json',repeat('b',64),o,p);
  select producto_id into actual from rappi_lineas where rappi_id='999999999000333' and linea=1;
  if actual<>manual or (r->>'actualizadas')::int<>1 then raise exception 'FALLÓ: reimportación idéntica no conservó el costeo manual';end if;

  -- 2. Cambio de estado y montos de la orden con el mismo renglón: lo conserva.
  r:=importar_rappi(s,'prueba.json',repeat('c',64),jsonb_set(jsonb_set(jsonb_set(o,'{0,estado}','"Cancelado"'),'{0,descuento_rappi}','24.6'),'{0,facturar}','200.4'),p);
  select producto_id into actual from rappi_lineas where rappi_id='999999999000333' and linea=1;
  if actual<>manual or not exists(select 1 from rappi_ordenes where rappi_id='999999999000333' and estado='Cancelado' and facturar=200.4) then raise exception 'FALLÓ: cambio de estado no conservó el costeo manual';end if;

  -- 3. Mayúsculas y espacios distintos en el texto: es el mismo renglón.
  r:=importar_rappi(s,'prueba.json',repeat('d',64),o,jsonb_set(p,'{0,opciones}','" verduras y champiñones "'));
  select producto_id into actual from rappi_lineas where rappi_id='999999999000333' and linea=1;
  if actual<>manual then raise exception 'FALLÓ: diferencia de mayúsculas o espacios perdió el costeo manual';end if;

  -- 4. Renglón distinto (otro producto, mismo importe): se liga por clave al producto nuevo.
  r:=importar_rappi(s,'prueba.json',repeat('e',64),o,jsonb_set(jsonb_set(p,'{0,opciones}','"Jamon y champiñones"'),'{0,clave}',to_jsonb(repeat('f',64))));
  select producto_id into actual from rappi_lineas where rappi_id='999999999000333' and linea=1;
  if actual<>(select id from rappi_productos where clave=repeat('f',64)) then raise exception 'FALLÓ: renglón distinto no se reasignó por clave';end if;

  -- 5. Tras reasignarse, volver al texto original ya no recupera el manual (el renglón previo ya no lo tenía).
  r:=importar_rappi(s,'prueba.json',repeat('f',64),o,p);
  select producto_id into actual from rappi_lineas where rappi_id='999999999000333' and linea=1;
  if actual<>generico then raise exception 'FALLÓ: se esperaba el producto por clave';end if;

  -- 6. Órdenes nuevas siguen ligándose por clave y la función sigue sin duplicar renglones.
  if (select count(*) from rappi_lineas where rappi_id='999999999000333')<>1 then raise exception 'FALLÓ: renglones duplicados';end if;
  raise exception 'PRUEBAS OK — reimportación idéntica conserva costeo manual · cambio de estado y montos lo conserva · mayúsculas y espacios · renglón distinto se liga por clave · sin duplicados';
end $$;
