-- Pruebas de la migración 0006 (ventas y costos importados de Dodo IS). Córrelas completas en Supabase → SQL Editor,
-- después de 0006_ventas_costos.sql y seed_ventas_costos.sql.
-- Necesitan dos usuarios activos con sucursal; sus roles cambian solo mientras corre el script.
-- El resultado aparece como ERROR A PROPÓSITO para que Postgres deshaga todo:
--   · "PRUEBAS OK — …" → todo bien.   · "FALLÓ: …" → dice qué regla no se cumplió.

do $$
declare
  v_a uuid; v_b uuid; v_suc_a uuid; v_suc_b uuid;
  v_imp1 uuid; v_imp2 uuid; v_n int; v_num numeric; v_txt text;
  v_ok text[] := '{}';
  -- Un día de prueba: un producto del seed (27) y uno nuevo (999001).
  v_resumen jsonb := '{"pedidos": 3, "total": 243.4, "efectivo": 143.4, "tarjeta": 100, "en_linea": 0, "iva": 33.57, "venta_m2": 1.5}';
  v_desglose jsonb := '[{"tipo": "restaurante", "pedidos": 3, "total": 243.4, "efectivo": 143.4, "tarjeta": 100, "en_linea": 0, "iva": 33.57}]';
  v_productos jsonb := '[{"dodo_id": 27, "nombre": "Margarita Mediano", "tamano": "mediano", "cantidad": 1, "importe": 143.4, "importe_sin_descuento": 169},
                         {"dodo_id": 999001, "nombre": "Prueba Grande", "tamano": "grande", "cantidad": 2, "importe": 100, "importe_sin_descuento": 100}]';
  v_archivos jsonb := '{"ventas": "Ventas.xlsx", "productos": "ProductsSales.xlsx"}';
begin
  select p.id, p.sucursal_id, o.id into v_a, v_suc_a, v_b
    from perfiles p join perfiles o on o.id <> p.id and o.activo and o.sucursal_id is not null
   where p.activo and p.sucursal_id is not null
   limit 1;
  if v_a is null then raise exception 'FALTAN DATOS: se necesitan dos usuarios activos con sucursal.'; end if;
  select id into v_suc_b from sucursales where id <> v_suc_a limit 1;
  if v_suc_b is null then insert into sucursales (nombre) values ('Prueba ventas') returning id into v_suc_b; end if;
  if costo_vigente(27, '2026-09-25') is distinct from 26.74 then raise exception 'FALTAN DATOS: corre seed_ventas_costos.sql.'; end if;

  -- ── Gerente: no importa, no maneja costos ni categorías ───────────────────
  update perfiles set rol = 'gerente' where id = v_a;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform importar_ventas_dia(v_suc_a, '2000-01-02', v_resumen, v_desglose, v_productos, v_archivos, false);
    raise exception 'FALLÓ: un gerente no debe importar ventas';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Solo un administrador importa%' then raise exception 'FALLÓ: mensaje inesperado (gerente importa): %', sqlerrm; end if;
  end;
  begin
    insert into costos_producto (dodo_id, costo, vigente_desde) values (27, 1, '2000-01-01');
    raise exception 'FALLÓ: un gerente no debe registrar costos';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%row-level security%' then raise exception 'FALLÓ: mensaje inesperado (gerente costo): %', sqlerrm; end if;
  end;
  begin
    perform asignar_categoria(27, 'snack');
    raise exception 'FALLÓ: un gerente no debe asignar categorías';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Solo un administrador asigna%' then raise exception 'FALLÓ: mensaje inesperado (gerente categoría): %', sqlerrm; end if;
  end;
  begin
    perform corregir_costo((select id from costos_producto where dodo_id = 27 limit 1), 1);
    raise exception 'FALLÓ: gerente no debe corregir costos';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Solo un administrador corrige%' then raise exception 'FALLÓ: mensaje inesperado (gerente corrige): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'gerente no importa ni maneja costos');

  -- ── Admin: importa, reimporta, costos y categorías ────────────────────────
  execute 'reset role';
  update perfiles set rol = 'admin' where id = v_a;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  v_imp1 := importar_ventas_dia(v_suc_b, '2000-01-02', v_resumen, v_desglose, v_productos, v_archivos, false);
  select count(*) into v_n from ventas_dia where sucursal_id = v_suc_b and fecha = '2000-01-02' and total = 243.4 and pedidos = 3 and importacion_id = v_imp1;
  if v_n <> 1 then raise exception 'FALLÓ: la importación debe guardar el día'; end if;
  select count(*) into v_n from ventas_dia_desglose d join ventas_dia v on v.id = d.ventas_dia_id where v.sucursal_id = v_suc_b and v.fecha = '2000-01-02';
  if v_n <> 1 then raise exception 'FALLÓ: la importación debe guardar el desglose (guardó %)', v_n; end if;
  select count(*) into v_n from ventas_producto where sucursal_id = v_suc_b and fecha = '2000-01-02';
  if v_n <> 2 then raise exception 'FALLÓ: la importación debe guardar 2 productos (guardó %)', v_n; end if;
  select tamano || '|' || coalesce(categoria::text, 'sin') into v_txt from productos_venta where dodo_id = 999001;
  if v_txt is distinct from 'grande|sin' then raise exception 'FALLÓ: el producto nuevo debe entrar grande y sin categoría (quedó %)', v_txt; end if;
  select suma_productos into v_num from importaciones_ventas where id = v_imp1;
  if v_num <> 243.4 then raise exception 'FALLÓ: la bitácora debe guardar la suma de productos (guardó %)', v_num; end if;
  v_ok := array_append(v_ok, 'admin importa y el producto nuevo entra al catálogo');

  begin
    perform importar_ventas_dia(v_suc_b, '2000-01-02', v_resumen, v_desglose, v_productos, v_archivos, false);
    raise exception 'FALLÓ: el mismo día no se debe importar dos veces sin reimportar';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Ese día ya se importó%' then raise exception 'FALLÓ: mensaje inesperado (doble importación): %', sqlerrm; end if;
  end;

  v_imp2 := importar_ventas_dia(v_suc_b, '2000-01-02', v_resumen || '{"total": 300}', v_desglose,
                                jsonb_build_array(v_productos->1), v_archivos, true);
  select count(*) into v_n from ventas_dia where sucursal_id = v_suc_b and fecha = '2000-01-02';
  if v_n <> 1 then raise exception 'FALLÓ: reimportar debe dejar un solo día (hay %)', v_n; end if;
  select total into v_num from ventas_dia where sucursal_id = v_suc_b and fecha = '2000-01-02';
  if v_num <> 300 then raise exception 'FALLÓ: reimportar debe reemplazar el total (quedó %)', v_num; end if;
  select count(*) into v_n from ventas_producto where sucursal_id = v_suc_b and fecha = '2000-01-02';
  if v_n <> 1 then raise exception 'FALLÓ: reimportar debe reemplazar los productos (quedaron %)', v_n; end if;
  select count(*) into v_n from importaciones_ventas where id = v_imp2 and reemplaza_id = v_imp1 and total_anterior = 243.4;
  if v_n <> 1 then raise exception 'FALLÓ: la bitácora debe guardar qué reemplazó y el total anterior'; end if;
  select count(*) into v_n from importaciones_ventas where sucursal_id = v_suc_b and fecha = '2000-01-02';
  if v_n <> 2 then raise exception 'FALLÓ: la bitácora debe conservar las dos importaciones (hay %)', v_n; end if;
  v_ok := array_append(v_ok, 'reimportar reemplaza el día y deja bitácora');

  -- Día sin ventas: sin productos y total 0 (sucursal cerrada).
  perform importar_ventas_dia(v_suc_b, '2000-01-03', '{"pedidos": 0, "total": 0, "efectivo": 0, "tarjeta": 0, "en_linea": 0, "iva": 0}',
                              '[]', '[]', v_archivos, false);
  select count(*) into v_n from ventas_dia where sucursal_id = v_suc_b and fecha = '2000-01-03' and total = 0 and venta_m2 is null;
  if v_n <> 1 then raise exception 'FALLÓ: un día sin ventas se debe poder importar en ceros'; end if;
  v_ok := array_append(v_ok, 'día sin ventas se importa en ceros');

  -- Costos por fecha de vigencia.
  insert into costos_producto (dodo_id, costo, vigente_desde, fuente, nota) values (999001, 10, '2000-01-01', 'prueba', null), (999001, 12, '2000-01-05', 'prueba', 'dudoso');
  if costo_vigente(999001, '1999-12-31') is not null then raise exception 'FALLÓ: antes de la vigencia no hay costo'; end if;
  if costo_vigente(999001, '2000-01-02') <> 10 then raise exception 'FALLÓ: el 2 de enero aplica el costo de 10'; end if;
  if costo_vigente(999001, '2000-01-05') <> 12 then raise exception 'FALLÓ: desde el 5 de enero aplica el costo de 12'; end if;
  select count(*) into v_n from costos_producto where dodo_id = 999001 and registrado_por = v_a;
  if v_n <> 2 then raise exception 'FALLÓ: el costo debe quedar registrado por quien lo capturó'; end if;
  begin
    insert into costos_producto (dodo_id, costo, vigente_desde, registrado_por) values (999001, 13, '2000-01-06', v_b);
    raise exception 'FALLÓ: nadie registra un costo a nombre de otro';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%row-level security%' then raise exception 'FALLÓ: mensaje inesperado (costo a nombre de otro): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'costo vigente por fecha');

  -- Corregir un error de captura: cambia el renglón, quita la nota y deja bitácora.
  perform corregir_costo((select id from costos_producto where dodo_id = 999001 and vigente_desde = '2000-01-05'), 12.5);
  if costo_vigente(999001, '2000-01-05') <> 12.5 then raise exception 'FALLÓ: la corrección debe cambiar el costo'; end if;
  select count(*) into v_n from costos_producto where dodo_id = 999001 and vigente_desde = '2000-01-05' and nota is null;
  if v_n <> 1 then raise exception 'FALLÓ: la corrección debe quitar la nota'; end if;
  select count(*) into v_n from correcciones_costo k join costos_producto c on c.id = k.costo_id
   where c.dodo_id = 999001 and k.costo_anterior = 12 and k.costo_nuevo = 12.5 and k.nota_anterior = 'dudoso' and k.corregido_por = v_a;
  if v_n <> 1 then raise exception 'FALLÓ: la corrección debe quedar en la bitácora con el valor y la nota anteriores'; end if;
  begin
    perform corregir_costo((select id from costos_producto where dodo_id = 999001 and vigente_desde = '2000-01-05'), -1);
    raise exception 'FALLÓ: un costo negativo no se acepta';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Escribe un costo válido%' then raise exception 'FALLÓ: mensaje inesperado (costo negativo): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'admin corrige un costo con bitácora');

  -- La vista: costo teórico e importe neto (sin IVA, prorrateado).
  select costo_teorico into v_num from ventas_producto_costeo where sucursal_id = v_suc_b and fecha = '2000-01-02' and dodo_id = 999001;
  if v_num <> 20 then raise exception 'FALLÓ: costo teórico debe ser 2 × 10 = 20 (dio %)', v_num; end if;
  select round(importe_neto, 2) into v_num from ventas_producto_costeo where sucursal_id = v_suc_b and fecha = '2000-01-02' and dodo_id = 999001;
  if v_num <> round(100 * (300 - 33.57) / 300, 2) then raise exception 'FALLÓ: importe neto mal prorrateado (dio %)', v_num; end if;
  v_ok := array_append(v_ok, 'vista de costeo');

  perform asignar_categoria(999001, 'snack');
  select categoria::text into v_txt from productos_venta where dodo_id = 999001;
  if v_txt is distinct from 'snack' then raise exception 'FALLÓ: admin debe poder asignar categoría'; end if;
  v_ok := array_append(v_ok, 'admin asigna categoría');

  -- Un día en la sucursal del admin, para probar qué ve el gerente.
  perform importar_ventas_dia(v_suc_a, '2000-01-02', v_resumen, v_desglose, v_productos, v_archivos, false);

  -- ── Gerente: ve solo su sucursal, y el catálogo con costos ─────────────────
  execute 'reset role';
  update perfiles set rol = 'gerente' where id = v_a;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from ventas_dia where fecha between '2000-01-02' and '2000-01-03';
  if v_n <> 1 then raise exception 'FALLÓ: el gerente debe ver solo su sucursal (ve % días)', v_n; end if;
  select count(distinct sucursal_id) into v_n from ventas_producto where fecha = '2000-01-02';
  if v_n <> 1 then raise exception 'FALLÓ: el gerente debe ver productos solo de su sucursal'; end if;
  select count(*) into v_n from ventas_dia_desglose d join ventas_dia v on v.id = d.ventas_dia_id where v.fecha = '2000-01-02';
  if v_n <> 1 then raise exception 'FALLÓ: el gerente debe ver el desglose solo de su sucursal (ve %)', v_n; end if;
  select count(*) into v_n from importaciones_ventas where fecha = '2000-01-02';
  if v_n <> 1 then raise exception 'FALLÓ: el gerente debe ver la bitácora solo de su sucursal (ve %)', v_n; end if;
  select count(*) into v_n from costos_producto where dodo_id = 999001;
  if v_n <> 2 then raise exception 'FALLÓ: el gerente debe ver los costos'; end if;
  select count(*) into v_n from ventas_producto_costeo where fecha = '2000-01-02' and costo_teorico is not null;
  if v_n <> 1 then raise exception 'FALLÓ: el gerente debe ver el costo teórico de su sucursal (ve %)', v_n; end if;
  v_ok := array_append(v_ok, 'gerente ve solo su sucursal');

  -- ── Encargado y cajero: no ven ventas ni costos ───────────────────────────
  foreach v_txt in array array['encargado', 'operacion'] loop
    execute 'reset role';
    update perfiles set rol = v_txt::rol_usuario where id = v_a;
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select (select count(*) from ventas_dia) + (select count(*) from ventas_producto) + (select count(*) from productos_venta)
         + (select count(*) from costos_producto) + (select count(*) from importaciones_ventas) + (select count(*) from ventas_dia_desglose)
         + (select count(*) from correcciones_costo)
      into v_n;
    if v_n <> 0 then raise exception 'FALLÓ: % no debe ver ventas ni costos (ve % renglones)', v_txt, v_n; end if;
  end loop;
  v_ok := array_append(v_ok, 'encargado y cajero no ven ventas');

  -- ── Corporativo: ve todo, no escribe ──────────────────────────────────────
  execute 'reset role';
  update perfiles set rol = 'corporativo', sucursal_id = null where id = v_b;
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(distinct sucursal_id) into v_n from ventas_dia where fecha = '2000-01-02';
  if v_n <> 2 then raise exception 'FALLÓ: corporativo debe ver ventas de las dos sucursales (ve %)', v_n; end if;
  select count(*) into v_n from productos_venta where dodo_id = 999001;
  if v_n <> 1 then raise exception 'FALLÓ: corporativo debe ver el catálogo'; end if;
  begin
    perform importar_ventas_dia(v_suc_a, '2000-01-04', v_resumen, v_desglose, v_productos, v_archivos, false);
    raise exception 'FALLÓ: corporativo no debe importar';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Solo un administrador importa%' then raise exception 'FALLÓ: mensaje inesperado (corporativo importa): %', sqlerrm; end if;
  end;
  begin
    insert into costos_producto (dodo_id, costo, vigente_desde) values (27, 1, '2000-01-01');
    raise exception 'FALLÓ: corporativo no debe registrar costos';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%row-level security%' then raise exception 'FALLÓ: mensaje inesperado (corporativo costo): %', sqlerrm; end if;
  end;
  begin
    perform asignar_categoria(27, 'snack');
    raise exception 'FALLÓ: corporativo no debe asignar categorías';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Solo un administrador asigna%' then raise exception 'FALLÓ: mensaje inesperado (corporativo categoría): %', sqlerrm; end if;
  end;
  begin
    perform corregir_costo((select id from costos_producto where dodo_id = 27 limit 1), 1);
    raise exception 'FALLÓ: corporativo no debe corregir costos';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Solo un administrador corrige%' then raise exception 'FALLÓ: mensaje inesperado (corporativo corrige): %', sqlerrm; end if;
  end;
  update ventas_dia set total = 1 where fecha = '2000-01-02';
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FALLÓ: nadie modifica ventas_dia directamente'; end if;
  v_ok := array_append(v_ok, 'corporativo ve todo y no escribe');

  raise exception 'PRUEBAS OK — %', array_to_string(v_ok, ' · ');
end $$;
