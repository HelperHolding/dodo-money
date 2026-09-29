-- Pruebas de la migración 0007 (pedidos de Datos brutos). Córrelas completas en Supabase → SQL Editor,
-- después de 0007_datos_brutos.sql (y con 0006 y su seed ya cargados).
-- Necesitan dos usuarios activos con sucursal; sus roles cambian solo mientras corre el script.
-- El resultado aparece como ERROR A PROPÓSITO para que Postgres deshaga todo:
--   · "PRUEBAS OK — …" → todo bien.   · "FALLÓ: …" → dice qué regla no se cumplió.

do $$
declare
  v_a uuid; v_b uuid; v_suc_a uuid; v_suc_b uuid;
  v_n int; v_num numeric; v_txt text; v_imp uuid;
  v_ok text[] := '{}';
  v_dias jsonb; v_pedidos jsonb; v_productos jsonb; v_dias_a jsonb; v_pedidos_a jsonb; v_productos_a jsonb;
begin
  select p.id, p.sucursal_id, o.id into v_a, v_suc_a, v_b
    from perfiles p join perfiles o on o.id <> p.id and o.activo and o.sucursal_id is not null
   where p.activo and p.sucursal_id is not null
   limit 1;
  if v_a is null then raise exception 'FALTAN DATOS: se necesitan dos usuarios activos con sucursal.'; end if;
  select id into v_suc_b from sucursales where id <> v_suc_a limit 1;
  if v_suc_b is null then insert into sucursales (nombre) values ('Prueba datos brutos') returning id into v_suc_b; end if;
  if not exists (select 1 from productos_venta where dodo_id = 27 and dodo_uuid is null) then
    raise exception 'FALTAN DATOS: se necesita la Margarita Mediano (27) del seed, sin código de Datos brutos.';
  end if;

  -- Un día (2000-01-02) de la sucursal B: una venta en efectivo con Margarita Mediano (existe) y un producto nuevo,
  -- una comida del personal y un cancelado.
  v_dias := jsonb_build_array(jsonb_build_object('sucursal_id', v_suc_b, 'fecha', '2000-01-02',
    'resumen', jsonb_build_object('pedidos', 1, 'total', 243.4, 'efectivo', 243.4, 'tarjeta', 0, 'en_linea', 0, 'iva', 33.57,
                                  'venta_m2', 4, 'suma_productos', 243.4, 'productos', 2),
    'desglose', jsonb_build_array(jsonb_build_object('tipo', 'restaurante', 'pedidos', 1, 'total', 243.4, 'efectivo', 243.4,
                                                     'tarjeta', 0, 'en_linea', 0, 'iva', 33.57))));
  v_pedidos := jsonb_build_array(
    jsonb_build_object('dodo_id', 'PRUEBA-VENTA', 'sucursal_id', v_suc_b, 'fecha', '2000-01-02', 'hora', '13:05', 'pago', 'efectivo',
      'tipo', 'en_tienda', 'origen', 'mostrador', 'origen_dodo', 'Restaurant', 'para_llevar', true, 'estado', 'entregado',
      'total', 243.4, 'total_sin_descuento', 269, 'iva', 33.57, 'productos', 2,
      'inicio_coccion', '2000-01-02T13:06:00-06:00', 'listo', '2000-01-02T13:17:00-06:00', 'entregado', '2000-01-02T13:18:00-06:00'),
    jsonb_build_object('dodo_id', 'PRUEBA-PERSONAL', 'sucursal_id', v_suc_b, 'fecha', '2000-01-02', 'hora', '15:00', 'pago', 'efectivo',
      'tipo', 'personal', 'origen', 'otro', 'origen_dodo', 'Pizzeria', 'para_llevar', false, 'estado', 'entregado',
      'total', 100, 'total_sin_descuento', 100, 'iva', 13.79, 'productos', 1),
    jsonb_build_object('dodo_id', 'PRUEBA-CANCELADO', 'sucursal_id', v_suc_b, 'fecha', '2000-01-02', 'hora', '16:00', 'pago', 'tarjeta',
      'tipo', 'en_tienda', 'origen', 'kiosco', 'origen_dodo', 'Kiosk', 'para_llevar', false, 'estado', 'cancelado',
      'total', 95, 'total_sin_descuento', 95, 'iva', 13.10, 'productos', 1));
  v_productos := jsonb_build_array(
    jsonb_build_object('pedido_id', 'PRUEBA-VENTA', 'renglon', 1, 'dodo_uuid', 'UUID-MARGARITA-M', 'nombre', 'margarita mediano',
      'tamano', 'mediano', 'precio', 143.4, 'precio_sin_descuento', 169, 'costo_dodo', 2280, 'combo', 'El de Siempre'),
    jsonb_build_object('pedido_id', 'PRUEBA-VENTA', 'renglon', 2, 'dodo_uuid', 'UUID-NUEVO', 'nombre', 'Prueba Nueva Grande',
      'tamano', 'grande', 'precio', 100, 'precio_sin_descuento', 100, 'combo', 'El de Siempre'),
    jsonb_build_object('pedido_id', 'PRUEBA-PERSONAL', 'renglon', 1, 'dodo_uuid', 'UUID-NUEVO', 'nombre', 'Prueba Nueva Grande',
      'tamano', 'grande', 'precio', 100, 'precio_sin_descuento', 100),
    jsonb_build_object('pedido_id', 'PRUEBA-CANCELADO', 'renglon', 1, 'dodo_uuid', 'UUID-MARGARITA-M', 'nombre', 'Margarita Mediano',
      'tamano', 'mediano', 'precio', 95, 'precio_sin_descuento', 95));
  -- El mismo día en la sucursal A, con un solo pedido.
  v_dias_a := jsonb_set(v_dias, '{0,sucursal_id}', to_jsonb(v_suc_a));
  v_pedidos_a := jsonb_build_array(jsonb_set(jsonb_set(v_pedidos->0, '{sucursal_id}', to_jsonb(v_suc_a)), '{dodo_id}', '"PRUEBA-A"'));
  v_productos_a := jsonb_build_array(
    jsonb_set(v_productos->0, '{pedido_id}', '"PRUEBA-A"'),
    jsonb_set(v_productos->1, '{pedido_id}', '"PRUEBA-A"'));

  -- ── Gerente: no importa ───────────────────────────────────────────────────
  update perfiles set rol = 'gerente' where id = v_a;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform importar_datos_brutos('Datos brutos.xlsx', v_dias, v_pedidos, v_productos, false);
    raise exception 'FALLÓ: un gerente no debe importar Datos brutos';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Solo un administrador importa%' then raise exception 'FALLÓ: mensaje inesperado (gerente importa): %', sqlerrm; end if;
  end;
  begin
    insert into pedidos (dodo_id, sucursal_id, fecha, hora, pago, tipo, origen, estado, total, total_sin_descuento, importacion_id)
    values ('X', v_suc_a, '2000-01-02', '10:00', 'efectivo', 'en_tienda', 'mostrador', 'entregado', 1, 1, gen_random_uuid());
    raise exception 'FALLÓ: nadie inserta pedidos directamente';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%row-level security%' then raise exception 'FALLÓ: mensaje inesperado (insert directo): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'gerente no importa');

  -- ── Admin: importa ────────────────────────────────────────────────────────
  execute 'reset role';
  update perfiles set rol = 'admin' where id = v_a;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  v_n := importar_datos_brutos('Datos brutos.xlsx', v_dias, v_pedidos, v_productos, false);
  if v_n <> 1 then raise exception 'FALLÓ: debe guardar 1 día (guardó %)', v_n; end if;
  select count(*) into v_n from ventas_dia where sucursal_id = v_suc_b and fecha = '2000-01-02' and total = 243.4 and pedidos = 1 and venta_m2 = 4;
  if v_n <> 1 then raise exception 'FALLÓ: la venta del día debe guardarse'; end if;
  select count(*) into v_n from ventas_dia_desglose d join ventas_dia v on v.id = d.ventas_dia_id where v.sucursal_id = v_suc_b and v.fecha = '2000-01-02';
  if v_n <> 1 then raise exception 'FALLÓ: el desglose debe guardarse (hay %)', v_n; end if;
  select count(*) into v_n from pedidos where sucursal_id = v_suc_b and fecha = '2000-01-02';
  if v_n <> 3 then raise exception 'FALLÓ: deben guardarse los 3 pedidos (hay %)', v_n; end if;
  select count(*) into v_n from pedido_productos pp join pedidos p on p.dodo_id = pp.pedido_id where p.sucursal_id = v_suc_b;
  if v_n <> 4 then raise exception 'FALLÓ: deben guardarse los 4 productos de los pedidos (hay %)', v_n; end if;
  select formato || '|' || pedidos || '|' || coalesce(archivo_productos, 'null') into v_txt from importaciones_ventas
   where sucursal_id = v_suc_b and fecha = '2000-01-02';
  if v_txt is distinct from 'datos_brutos|1|null' then raise exception 'FALLÓ: la bitácora debe decir datos_brutos, 1 pedido y sin archivo de productos (dice %)', v_txt; end if;
  v_ok := array_append(v_ok, 'admin importa pedidos, venta y bitácora');

  -- Catálogo: la Margarita (27) se empata por nombre sin distinguir mayúsculas y recibe su código; el nuevo entra con número interno.
  select dodo_uuid into v_txt from productos_venta where dodo_id = 27;
  if v_txt is distinct from 'UUID-MARGARITA-M' then raise exception 'FALLÓ: la Margarita Mediano debe recibir su código (tiene %)', v_txt; end if;
  select count(*) into v_n from productos_venta where dodo_uuid = 'UUID-NUEVO' and dodo_id >= 1000000 and categoria is null and tamano = 'grande';
  if v_n <> 1 then raise exception 'FALLÓ: el producto nuevo debe entrar con número interno, sin categoría y grande'; end if;
  select dodo_id into v_n from pedido_productos where pedido_id = 'PRUEBA-VENTA' and renglon = 1;
  if v_n <> 27 then raise exception 'FALLÓ: el producto del pedido debe apuntar a la Margarita (27), apunta a %', v_n; end if;
  v_ok := array_append(v_ok, 'empate con el catálogo');

  -- ventas_producto sale solo de los pedidos que son venta (ni personal ni cancelado).
  select count(*), sum(importe) into v_n, v_num from ventas_producto where sucursal_id = v_suc_b and fecha = '2000-01-02';
  if v_n <> 2 or v_num <> 243.4 then raise exception 'FALLÓ: ventas_producto debe traer 2 productos por $243.40 (trae % por %)', v_n, v_num; end if;
  select cantidad into v_num from ventas_producto where sucursal_id = v_suc_b and fecha = '2000-01-02' and dodo_id = 27;
  if v_num <> 1 then raise exception 'FALLÓ: la Margarita debe contar 1 pieza (el cancelado no cuenta), cuenta %', v_num; end if;
  v_ok := array_append(v_ok, 'ventas_producto solo de pedidos con venta');

  -- Otra vez sin reemplazar: error con los días repetidos.
  begin
    perform importar_datos_brutos('Datos brutos.xlsx', v_dias, v_pedidos, v_productos, false);
    raise exception 'FALLÓ: no debe importar días ya importados sin reemplazar';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Estos días ya se importaron: 2000-01-02%' then raise exception 'FALLÓ: mensaje inesperado (repetido): %', sqlerrm; end if;
  end;

  -- Reemplazar: solo queda el pedido de venta con otro total; el día se reemplaza completo y la bitácora guarda el total anterior.
  perform importar_datos_brutos('Datos brutos 2.xlsx',
    jsonb_set(v_dias, '{0,resumen,total}', '300'),
    jsonb_build_array(jsonb_set(v_pedidos->0, '{total}', '300')),
    jsonb_build_array(v_productos->0, v_productos->1), true);
  select count(*) into v_n from pedidos where sucursal_id = v_suc_b and fecha = '2000-01-02';
  if v_n <> 1 then raise exception 'FALLÓ: reemplazar debe dejar solo los pedidos del archivo nuevo (hay %)', v_n; end if;
  select total into v_num from ventas_dia where sucursal_id = v_suc_b and fecha = '2000-01-02';
  if v_num <> 300 then raise exception 'FALLÓ: reemplazar debe cambiar el total del día (quedó %)', v_num; end if;
  select count(*) into v_n from importaciones_ventas where sucursal_id = v_suc_b and fecha = '2000-01-02' and total_anterior = 243.4 and reemplaza_id is not null;
  if v_n <> 1 then raise exception 'FALLÓ: la bitácora debe guardar el total anterior y a quién reemplazó'; end if;
  v_ok := array_append(v_ok, 'reimportar reemplaza el día completo');

  -- Un día importado con el formato anterior (0006) también se reemplaza con Datos brutos.
  perform importar_ventas_dia(v_suc_b, '2000-01-03', '{"pedidos": 1, "total": 50, "efectivo": 50, "tarjeta": 0, "en_linea": 0, "iva": 6.9}',
                              '[]', '[{"dodo_id": 27, "nombre": "Margarita Mediano", "tamano": "mediano", "cantidad": 1, "importe": 50, "importe_sin_descuento": 50}]',
                              '{"ventas": "Ventas.xlsx", "productos": "ProductsSales.xlsx"}', false);
  perform importar_datos_brutos('Datos brutos.xlsx',
    jsonb_set(v_dias, '{0,fecha}', '"2000-01-03"'),
    jsonb_build_array(jsonb_set(jsonb_set(v_pedidos->0, '{fecha}', '"2000-01-03"'), '{dodo_id}', '"PRUEBA-DIA3"')),
    jsonb_build_array(jsonb_set(v_productos->0, '{pedido_id}', '"PRUEBA-DIA3"')), true);
  select count(*) into v_n from ventas_producto where sucursal_id = v_suc_b and fecha = '2000-01-03' and importe = 143.4;
  if v_n <> 1 then raise exception 'FALLÓ: el día del formato anterior debe quedar reemplazado por Datos brutos'; end if;
  v_ok := array_append(v_ok, 'reemplaza días del formato anterior');

  -- Día de la sucursal A, para probar qué ve el gerente.
  perform importar_datos_brutos('Datos brutos.xlsx', v_dias_a, v_pedidos_a, v_productos_a, false);

  -- ── Gerente: ve solo su sucursal ──────────────────────────────────────────
  execute 'reset role';
  update perfiles set rol = 'gerente' where id = v_a;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from pedidos where fecha between '2000-01-02' and '2000-01-03';
  if v_n <> 1 then raise exception 'FALLÓ: el gerente debe ver solo los pedidos de su sucursal (ve %)', v_n; end if;
  select count(*) into v_n from pedido_productos where pedido_id like 'PRUEBA-%';
  if v_n <> 2 then raise exception 'FALLÓ: el gerente debe ver solo los productos de sus pedidos (ve %)', v_n; end if;
  v_ok := array_append(v_ok, 'gerente ve solo su sucursal');

  -- ── Encargado y cajero: no ven pedidos ───────────────────────────────────
  foreach v_txt in array array['encargado', 'cajero'] loop
    execute 'reset role';
    update perfiles set rol = v_txt::rol_usuario where id = v_a;
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select (select count(*) from pedidos) + (select count(*) from pedido_productos) into v_n;
    if v_n <> 0 then raise exception 'FALLÓ: % no debe ver pedidos (ve %)', v_txt, v_n; end if;
  end loop;
  v_ok := array_append(v_ok, 'encargado y cajero no ven pedidos');

  -- ── Corporativo: ve todo, no importa ─────────────────────────────────────
  execute 'reset role';
  update perfiles set rol = 'corporativo', sucursal_id = null where id = v_b;
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(distinct sucursal_id) into v_n from pedidos where fecha = '2000-01-02';
  if v_n <> 2 then raise exception 'FALLÓ: corporativo debe ver pedidos de las dos sucursales (ve %)', v_n; end if;
  begin
    perform importar_datos_brutos('Datos brutos.xlsx', v_dias, v_pedidos, v_productos, true);
    raise exception 'FALLÓ: corporativo no debe importar';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Solo un administrador importa%' then raise exception 'FALLÓ: mensaje inesperado (corporativo importa): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'corporativo ve todo y no importa');

  raise exception 'PRUEBAS OK — %', array_to_string(v_ok, ' · ');
end $$;
