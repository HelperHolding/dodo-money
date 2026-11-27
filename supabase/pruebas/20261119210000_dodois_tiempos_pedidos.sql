-- Pruebas de los tiempos de cocina en la sincronización con Dodo IS. Córrelas completas en Supabase → SQL Editor
-- después de la migración 20261119210000. Necesitan Dodo IS conectado y al menos una sucursal. Usan un día de 2020.
--   · "PRUEBAS OK — …" → todo bien (no deja cambios).   · "FALLÓ: …" → dice qué regla no se cumplió.

do $$
declare
  v_s uuid; v_r text; v_ok text[] := '{}';
  d date := '2020-01-04';
  base jsonb := jsonb_build_object('dodo_id', 'PRUEBATIEMPOS1', 'fecha', '2020-01-04', 'hora', '13:20', 'pago', 'efectivo', 'tipo', 'en_tienda',
    'origen', 'mostrador', 'origen_dodo', 'Dine-in', 'para_llevar', false, 'estado', 'entregado', 'total', 199, 'total_sin_descuento', 199,
    'iva', 27.45, 'productos', 1, 'promocion', null, 'turno_dodo', 't1', 'agregador', null);
  con jsonb := jsonb_build_object('inicio_coccion', '2020-01-04T13:21:27-06:00', 'listo', '2020-01-04T13:28:38-06:00', 'entregado', '2020-01-04T13:28:57-06:00');
  sin jsonb := jsonb_build_object('inicio_coccion', null, 'listo', null, 'entregado', null);
  otros jsonb := jsonb_build_object('inicio_coccion', '2020-01-04T13:22:00-06:00', 'listo', '2020-01-04T13:30:00-06:00', 'entregado', '2020-01-04T13:35:00-06:00');
  prod jsonb := jsonb_build_array(jsonb_build_object('pedido_id', 'PRUEBATIEMPOS1', 'renglon', 1, 'dodo_uuid', 'PRUEBA-PROD-TIEMPOS',
    'nombre', 'Producto prueba tiempos', 'tamano', null, 'precio', 199, 'precio_sin_descuento', 199, 'combo', null));
  res jsonb := jsonb_build_object('pedidos', 1, 'total', 199, 'efectivo', 199, 'tarjeta', 0, 'en_linea', 0, 'iva', 27.45, 'venta_m2', null,
    'suma_productos', 199, 'productos', 1);
  des jsonb := jsonb_build_array(jsonb_build_object('tipo', 'restaurante', 'pedidos', 1, 'total', 199, 'efectivo', 199, 'tarjeta', 0, 'en_linea', 0, 'iva', 27.45));
  p pedidos;
begin
  select id into v_s from sucursales order by nombre limit 1;
  if v_s is null then raise exception 'FALTAN DATOS: se necesita una sucursal.'; end if;
  if not exists (select 1 from dodois_conexion) then raise exception 'FALTAN DATOS: Dodo IS debe estar conectado.'; end if;
  if exists (select 1 from ventas_dia where fecha = d) then raise exception 'FALTAN DATOS: el día de prueba ya tiene ventas.'; end if;
  base := base || jsonb_build_object('sucursal_id', v_s);
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);

  v_r := sincronizar_ventas_dodo(v_s, d, res, des, jsonb_build_array(base || con), prod);
  select * into p from pedidos where dodo_id = 'PRUEBATIEMPOS1';
  if v_r <> 'ok' or p.inicio_coccion is distinct from '2020-01-04T13:21:27-06:00'::timestamptz
     or p.listo is distinct from '2020-01-04T13:28:38-06:00'::timestamptz or p.entregado is distinct from '2020-01-04T13:28:57-06:00'::timestamptz then
    raise exception 'FALLÓ: guarda inicio de cocción, listo y entregado (% / % / % / %)', v_r, p.inicio_coccion, p.listo, p.entregado;
  end if;
  v_ok := array_append(v_ok, 'guarda los tiempos del pedido');

  -- Una pasada sin tiempos (falló la consulta de producción) no borra los que ya había.
  perform sincronizar_ventas_dodo(v_s, d, res, des, jsonb_build_array(base || sin), prod);
  select * into p from pedidos where dodo_id = 'PRUEBATIEMPOS1';
  if p.inicio_coccion is null or p.listo is null or p.entregado is null then raise exception 'FALLÓ: una pasada sin tiempos conserva los anteriores'; end if;
  -- La versión anterior de la app (sin esas llaves) tampoco los borra.
  perform sincronizar_ventas_dodo(v_s, d, res, des, jsonb_build_array(base), prod);
  select * into p from pedidos where dodo_id = 'PRUEBATIEMPOS1';
  if p.entregado is distinct from '2020-01-04T13:28:57-06:00'::timestamptz then raise exception 'FALLÓ: sin las llaves de tiempos se conservan los anteriores'; end if;
  v_ok := array_append(v_ok, 'sin tiempos se conservan los que había');

  -- Tiempos nuevos reemplazan a los anteriores; el día no cambia.
  perform sincronizar_ventas_dodo(v_s, d, res, des, jsonb_build_array(base || otros), prod);
  select * into p from pedidos where dodo_id = 'PRUEBATIEMPOS1';
  if p.listo is distinct from '2020-01-04T13:30:00-06:00'::timestamptz or p.entregado is distinct from '2020-01-04T13:35:00-06:00'::timestamptz then
    raise exception 'FALLÓ: tiempos nuevos reemplazan a los anteriores';
  end if;
  if (select count(*) from pedidos where dodo_id = 'PRUEBATIEMPOS1') <> 1 or (select total from ventas_dia where sucursal_id = v_s and fecha = d) <> 199 then
    raise exception 'FALLÓ: el día y el pedido siguen igual';
  end if;
  v_ok := array_append(v_ok, 'tiempos nuevos reemplazan; el día no cambia');

  raise exception 'PRUEBAS OK — %', array_to_string(v_ok, ' · ');
end $$;
