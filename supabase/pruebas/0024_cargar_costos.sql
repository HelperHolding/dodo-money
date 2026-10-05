-- Pruebas de la migración 0024 (carga de costos desde Excel). Córrelas completas en Supabase → SQL Editor después de la migración.
-- Necesitan un usuario activo con sucursal y un usuario corporativo activo. Crean dos productos de prueba (dodo_id 999990 y 999991).
-- El resultado aparece como ERROR A PROPÓSITO para que Postgres deshaga todo:
--   · "PRUEBAS OK — …" → todo bien.   · "FALLÓ: …" → dice qué regla no se cumplió.

do $$
declare
  v_a uuid; v_c uuid; v_n integer;
  v_ok text[] := '{}';
begin
  select id into v_a from perfiles where activo and sucursal_id is not null limit 1;
  if v_a is null then raise exception 'FALTAN DATOS: se necesita un usuario activo con sucursal.'; end if;
  select id into v_c from perfiles where rol::text = 'corporativo' and activo limit 1;
  if v_c is null then raise exception 'FALTAN DATOS: se necesita un usuario corporativo activo.'; end if;

  insert into productos_venta (dodo_id, nombre) values (999990, 'Prueba costos Grande'), (999991, 'Prueba costos Dip');

  -- Solo el admin carga.
  update perfiles set rol = 'gerente' where id = v_a;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  begin
    perform cargar_costos(date '1999-01-01', 'Prueba', '[{"dodo_id": 999990, "costo": 50}]');
    raise exception 'FALLÓ: el gerente no debe cargar costos';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Solo un administrador%' then raise exception 'FALLÓ: mensaje inesperado (gerente): %', sqlerrm; end if;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  begin
    perform cargar_costos(date '1999-01-01', 'Prueba', '[{"dodo_id": 999990, "costo": 50}]');
    raise exception 'FALLÓ: corporativo no debe cargar costos';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Solo un administrador%' then raise exception 'FALLÓ: mensaje inesperado (corporativo): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'solo el admin carga');

  update perfiles set rol = 'admin' where id = v_a;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);

  -- Errores claros.
  begin
    perform cargar_costos(date '1999-01-01', 'Prueba', '[]');
    raise exception 'FALLÓ: sin costos no debe pasar';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'No hay costos%' then raise exception 'FALLÓ: mensaje inesperado (vacío): %', sqlerrm; end if;
  end;
  begin
    perform cargar_costos(date '1999-01-01', 'Prueba', '[{"dodo_id": 999990, "costo": -1}]');
    raise exception 'FALLÓ: un costo negativo no debe pasar';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Costo inválido%' then raise exception 'FALLÓ: mensaje inesperado (negativo): %', sqlerrm; end if;
  end;
  begin
    perform cargar_costos(date '1999-01-01', 'Prueba', '[{"dodo_id": 123456789, "costo": 5}]');
    raise exception 'FALLÓ: un producto que no existe no debe pasar';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%no existe%' then raise exception 'FALLÓ: mensaje inesperado (no existe): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'errores claros');

  -- Carga: guarda costos, pone categoría y tamaño, y guarda la equivalencia.
  v_n := cargar_costos(date '1999-01-01', 'Prueba',
    '[{"dodo_id": 999990, "costo": 52.394, "nota": "Prueba G", "categoria": "pizza", "tamano": "grande"},
      {"dodo_id": 999991, "costo": 6.87, "nota": "Dip", "categoria": "otro", "tamano": ""}]',
    '[{"clave_excel": "prueba nueva", "tamano": "G", "dodo_id": 999990}]');
  if v_n <> 2 then raise exception 'FALLÓ: debían cargarse 2 costos (fueron %)', v_n; end if;
  if (select costo from costos_producto where dodo_id = 999990 and vigente_desde = date '1999-01-01') <> 52.39 then raise exception 'FALLÓ: el costo se redondea a centavos'; end if;
  if (select categoria::text from productos_venta where dodo_id = 999990) <> 'pizza' or (select tamano from productos_venta where dodo_id = 999990) <> 'grande' then
    raise exception 'FALLÓ: debía poner categoría y tamaño';
  end if;
  if (select tamano from productos_venta where dodo_id = 999991) is not null then raise exception 'FALLÓ: un tamaño vacío no se pone'; end if;
  if (select dodo_id from costos_equivalencias where clave_excel = 'prueba nueva' and tamano = 'G') <> 999990 then raise exception 'FALLÓ: debía guardar la equivalencia'; end if;
  v_ok := array_append(v_ok, 'guarda costos, categoría, tamaño y equivalencia');

  -- Volver a cargar con otro costo: actualiza y deja la corrección en la bitácora; mismo costo no deja corrección.
  perform cargar_costos(date '1999-01-01', 'Prueba 2', '[{"dodo_id": 999990, "costo": 55}, {"dodo_id": 999991, "costo": 6.87}]');
  if (select costo from costos_producto where dodo_id = 999990 and vigente_desde = date '1999-01-01') <> 55 then raise exception 'FALLÓ: debía actualizar el costo'; end if;
  if (select count(*) from correcciones_costo k join costos_producto p on p.id = k.costo_id where p.dodo_id = 999990) <> 1 then raise exception 'FALLÓ: el cambio debía quedar en la bitácora'; end if;
  if exists (select 1 from correcciones_costo k join costos_producto p on p.id = k.costo_id where p.dodo_id = 999991) then raise exception 'FALLÓ: sin cambio no hay corrección'; end if;
  if (select count(*) from costos_producto where dodo_id = 999990) <> 1 then raise exception 'FALLÓ: no debía duplicar el costo de la misma fecha'; end if;
  v_ok := array_append(v_ok, 'recargar actualiza y deja bitácora');

  raise exception 'PRUEBAS OK — %', array_to_string(v_ok, ' · ');
end $$;
