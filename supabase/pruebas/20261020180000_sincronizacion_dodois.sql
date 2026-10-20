-- Pruebas de la sincronización con Dodo IS. Córrelas completas en Supabase → SQL Editor después de la migración.
-- Necesitan un admin y un corporativo activos y al menos una sucursal. Usan días de 2020 (no deben tener ventas).
--   · "PRUEBAS OK — …" → todo bien (no deja cambios).   · "FALLÓ: …" → dice qué regla no se cumplió.

do $$
declare
  v_a uuid; v_c uuid; v_s uuid; v_imp uuid; v_imp2 uuid; v_dia uuid; v_r text; v_ok text[] := '{}';
  servidor text := json_build_object('role', 'service_role')::text;
  d1 date := '2020-01-02'; d2 date := '2020-01-03';
  ped jsonb := jsonb_build_array(
    jsonb_build_object('dodo_id', 'PRUEBA0040A', 'sucursal_id', null, 'fecha', '2020-01-02', 'hora', '13:20', 'pago', 'efectivo', 'tipo', 'en_tienda',
      'origen', 'mostrador', 'origen_dodo', 'Dine-in', 'para_llevar', false, 'estado', 'entregado', 'total', 328, 'total_sin_descuento', 328,
      'iva', 45.24, 'productos', 2, 'promocion', null, 'turno_dodo', 't1', 'agregador', null),
    jsonb_build_object('dodo_id', 'PRUEBA0040B', 'sucursal_id', null, 'fecha', '2020-01-02', 'hora', '13:49', 'pago', 'tarjeta', 'tipo', 'en_tienda',
      'origen', 'kiosco', 'origen_dodo', 'Kiosk', 'para_llevar', false, 'estado', 'entregado', 'total', 155, 'total_sin_descuento', 155,
      'iva', 21.38, 'productos', 1, 'promocion', null, 'turno_dodo', 't1', 'agregador', null));
  prod jsonb := jsonb_build_array(
    jsonb_build_object('pedido_id', 'PRUEBA0040A', 'renglon', 1, 'dodo_uuid', 'PRUEBA-PROD-1', 'nombre', 'Producto prueba 0040', 'tamano', null, 'precio', 199, 'precio_sin_descuento', 199, 'combo', null),
    jsonb_build_object('pedido_id', 'PRUEBA0040A', 'renglon', 2, 'dodo_uuid', 'PRUEBA-PROD-1', 'nombre', 'Producto prueba 0040', 'tamano', null, 'precio', 129, 'precio_sin_descuento', 129, 'combo', null),
    jsonb_build_object('pedido_id', 'PRUEBA0040B', 'renglon', 1, 'dodo_uuid', 'PRUEBA-PROD-1', 'nombre', 'Producto prueba 0040', 'tamano', null, 'precio', 155, 'precio_sin_descuento', 155, 'combo', null));
  res jsonb := jsonb_build_object('pedidos', 2, 'total', 483, 'efectivo', 328, 'tarjeta', 155, 'en_linea', 0, 'iva', 66.62, 'venta_m2', null, 'suma_productos', 483, 'productos', 3);
  des jsonb := jsonb_build_array(jsonb_build_object('tipo', 'restaurante', 'pedidos', 2, 'total', 483, 'efectivo', 328, 'tarjeta', 155, 'en_linea', 0, 'iva', 66.62));
begin
  select id into v_a from perfiles where rol::text = 'admin' and activo limit 1;
  select id into v_c from perfiles where rol::text = 'corporativo' and activo limit 1;
  select id into v_s from sucursales order by nombre limit 1;
  if v_a is null or v_c is null or v_s is null then raise exception 'FALTAN DATOS: se necesitan un admin, un corporativo y una sucursal.'; end if;
  if exists (select 1 from ventas_dia where fecha in (d1, d2)) then raise exception 'FALTAN DATOS: los días de prueba ya tienen ventas.'; end if;
  ped := (select jsonb_agg(x || jsonb_build_object('sucursal_id', v_s)) from jsonb_array_elements(ped) x);

  -- Conexión (como admin) y permisos.
  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  begin
    perform dodois_conectar('r', 'a', now() + interval '1 day', '[]'::jsonb, 's');
    raise exception 'FALLÓ: corporativo no conecta';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm <> 'Solo un administrador conecta Dodo IS.' then raise exception 'FALLÓ: mensaje inesperado (corporativo): %', sqlerrm; end if;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  perform dodois_conectar('refresh-prueba', 'access-prueba', now() + interval '1 day', '[]'::jsonb, 'sales');
  begin
    perform * from dodois_tokens();
    raise exception 'FALLÓ: un usuario no lee los tokens';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm <> 'Solo el servidor.' then raise exception 'FALLÓ: mensaje inesperado (tokens): %', sqlerrm; end if;
  end;
  begin
    perform sincronizar_ventas_dodo(v_s, d1, res, des, ped, prod);
    raise exception 'FALLÓ: un usuario no sincroniza';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm <> 'Solo el servidor sincroniza ventas.' then raise exception 'FALLÓ: mensaje inesperado (sincronizar): %', sqlerrm; end if;
  end;
  perform set_config('request.jwt.claims', servidor, true);
  if (select refresh from dodois_tokens()) <> 'refresh-prueba' then raise exception 'FALLÓ: el servidor lee el token guardado'; end if;
  if not dodois_tomar_renovacion() then raise exception 'FALLÓ: la primera renovación toma el turno'; end if;
  if dodois_tomar_renovacion() then raise exception 'FALLÓ: una segunda renovación a la vez espera'; end if;
  perform dodois_guardar_tokens('refresh-2', 'access-2', now() + interval '1 day');
  if (select refresh from dodois_tokens()) <> 'refresh-2' or not dodois_tomar_renovacion() then raise exception 'FALLÓ: guardar libera el turno y reemplaza el token'; end if;
  v_ok := array_append(v_ok, 'conexión solo admin; tokens y sincronización solo servidor; una renovación a la vez');

  -- Primera sincronización.
  v_r := sincronizar_ventas_dodo(v_s, d1, res, des, ped, prod);
  select importacion_id, id into v_imp, v_dia from ventas_dia where sucursal_id = v_s and fecha = d1;
  if v_r <> 'ok' or v_imp is null then raise exception 'FALLÓ: la primera sincronización guarda el día (%)', v_r; end if;
  if (select formato from importaciones_ventas where id = v_imp) <> 'api' then raise exception 'FALLÓ: el registro es de la API'; end if;
  if (select total from ventas_dia where id = v_dia) <> 483 or (select count(*) from pedidos where importacion_id = v_imp) <> 2
     or (select sum(cantidad) from ventas_producto where sucursal_id = v_s and fecha = d1) <> 3 then raise exception 'FALLÓ: totales, pedidos y productos del día'; end if;
  -- Segunda: mismo registro, sin duplicar.
  perform sincronizar_ventas_dodo(v_s, d1, res, des, ped, prod);
  if (select importacion_id from ventas_dia where sucursal_id = v_s and fecha = d1) <> v_imp or (select id from ventas_dia where sucursal_id = v_s and fecha = d1) <> v_dia
     or (select count(*) from pedidos where importacion_id = v_imp) <> 2 or (select count(*) from importaciones_ventas where sucursal_id = v_s and fecha = d1) <> 1 then
    raise exception 'FALLÓ: volver a sincronizar reutiliza el registro sin duplicar';
  end if;
  v_ok := array_append(v_ok, 'guarda el día y lo vuelve a sincronizar sin duplicar');

  -- Conciliación: sigue si las formas de pago no cambian; se anula si cambian.
  insert into ventas_conciliaciones (sucursal_id, fecha, importacion_id, original, efectivo, tarjeta, en_linea, conciliar_productos, motivo, registrado_por)
  values (v_s, d1, v_imp, '{"total":483,"iva":66.62,"efectivo":328,"tarjeta":155,"en_linea":0,"suma_productos":483,"bruta_productos":483,"productos":3}',
          300, 183, 0, false, 'Prueba de conciliación 0040', v_a);
  perform sincronizar_ventas_dodo(v_s, d1, res, des, ped, prod);
  if not exists (select 1 from ventas_conciliaciones where importacion_id = v_imp and anulado_en is null) then raise exception 'FALLÓ: la conciliación sigue si la venta no cambia'; end if;
  perform sincronizar_ventas_dodo(v_s, d1, res || jsonb_build_object('efectivo', 300, 'tarjeta', 183), des, ped, prod);
  if exists (select 1 from ventas_conciliaciones where importacion_id = v_imp and anulado_en is null)
     or (select motivo_anulacion from ventas_conciliaciones where importacion_id = v_imp order by registrado_en desc limit 1) <> 'La venta de Dodo IS cambió después de conciliar.' then
    raise exception 'FALLÓ: la conciliación se anula si cambian las formas de pago';
  end if;
  v_ok := array_append(v_ok, 'conciliación sigue o se anula según las formas de pago');

  -- Un pedido que ya no viene se quita.
  perform sincronizar_ventas_dodo(v_s, d1, res || jsonb_build_object('pedidos', 1, 'total', 328, 'efectivo', 328, 'tarjeta', 0, 'iva', 45.24, 'suma_productos', 328, 'productos', 2),
    des, jsonb_build_array(ped->0), jsonb_build_array(prod->0, prod->1));
  if (select count(*) from pedidos where importacion_id = v_imp) <> 1 or exists (select 1 from pedidos where dodo_id = 'PRUEBA0040B') then raise exception 'FALLÓ: el pedido que ya no viene se quita'; end if;
  v_ok := array_append(v_ok, 'quita pedidos que ya no vienen');

  -- Día del Excel: no se toca.
  insert into importaciones_ventas (sucursal_id, fecha, archivo_ventas, archivo_productos, total, suma_productos, productos, pedidos, formato, importado_por)
  values (v_s, d2, 'excel.xlsx', null, 100, 100, 1, 1, 'datos_brutos', v_a) returning id into v_imp2;
  insert into ventas_dia (sucursal_id, fecha, pedidos, total, efectivo, tarjeta, en_linea, iva, importacion_id) values (v_s, d2, 1, 100, 100, 0, 0, 13.79, v_imp2);
  v_r := sincronizar_ventas_dodo(v_s, d2, res, des, ped, prod);
  if v_r <> 'excel' or (select total from ventas_dia where sucursal_id = v_s and fecha = d2) <> 100 then raise exception 'FALLÓ: el día del Excel no se toca (%)', v_r; end if;
  v_ok := array_append(v_ok, 'respeta los días del Excel');

  raise exception 'PRUEBAS OK — %', array_to_string(v_ok, ' · ');
end $$;
