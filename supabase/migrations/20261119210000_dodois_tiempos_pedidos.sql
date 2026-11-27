-- Tiempos de cocina y entrega en la sincronización con Dodo IS.
-- La app ahora manda inicio_coccion, listo y entregado de cada pedido (Producción → orders-handover-time de Dodo IS)
-- y esta versión de sincronizar_ventas_dodo los guarda en pedidos. Misma firma, sin cambios de tablas ni de permisos.
-- La versión anterior ignora esas llaves, así que la app puede desplegarse antes o después de esta migración.

create or replace function sincronizar_ventas_dodo(p_sucursal uuid, p_fecha date, p_resumen jsonb, p_desglose jsonb, p_pedidos jsonb, p_productos jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare v_previa ventas_dia; v_formato text; v_imp uuid; v_dia uuid; v_por uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Solo el servidor sincroniza ventas.'; end if;
  select conectado_por into v_por from dodois_conexion;
  if v_por is null then raise exception 'Dodo IS no está conectado.'; end if;
  perform pg_advisory_xact_lock(hashtext(p_sucursal::text || p_fecha::text));

  select * into v_previa from ventas_dia where sucursal_id = p_sucursal and fecha = p_fecha;
  if v_previa.id is not null then
    select formato into v_formato from importaciones_ventas where id = v_previa.importacion_id;
    if v_formato is distinct from 'api' then return 'excel'; end if;
    v_imp := v_previa.importacion_id;
    -- Una respuesta vacía pasajera no debe borrar el día ni anular su conciliación.
    if jsonb_array_length(coalesce(p_pedidos, '[]')) = 0 and coalesce(v_previa.pedidos, 0) > 0 then
      raise exception 'Dodo IS no trajo pedidos de un día que ya tenía ventas; no se borra.';
    end if;
  elsif jsonb_array_length(coalesce(p_pedidos, '[]')) = 0 then
    return 'vacio';
  end if;

  if v_imp is null then
    insert into importaciones_ventas (sucursal_id, fecha, archivo_ventas, archivo_productos, total, suma_productos, productos, pedidos, formato, importado_por)
    values (p_sucursal, p_fecha, 'API Dodo IS', null, (p_resumen->>'total')::numeric, coalesce((p_resumen->>'suma_productos')::numeric, 0),
            coalesce((p_resumen->>'productos')::integer, 0), (p_resumen->>'pedidos')::integer, 'api', v_por)
    returning id into v_imp;
  else
    update importaciones_ventas set total = (p_resumen->>'total')::numeric, suma_productos = coalesce((p_resumen->>'suma_productos')::numeric, 0),
      productos = coalesce((p_resumen->>'productos')::integer, 0), pedidos = (p_resumen->>'pedidos')::integer, importado_en = now()
     where id = v_imp;
  end if;

  drop table if exists tmp_pedidos, tmp_productos;
  create temp table tmp_pedidos on commit drop as
    select * from jsonb_to_recordset(coalesce(p_pedidos, '[]')) as x(
      dodo_id text, hora time, pago text, tipo text, origen text, origen_dodo text, para_llevar boolean, estado text, total numeric,
      total_sin_descuento numeric, iva numeric, productos integer, promocion text, turno_dodo text, agregador text,
      inicio_coccion timestamptz, listo timestamptz, entregado timestamptz);
  create temp table tmp_productos on commit drop as
    select * from jsonb_to_recordset(coalesce(p_productos, '[]')) as x(
      pedido_id text, renglon integer, dodo_uuid text, nombre text, tamano text, precio numeric, precio_sin_descuento numeric, combo text);

  -- Catálogo, igual que importar_datos_brutos.
  insert into productos_codigos (dodo_uuid, dodo_id)
  select x.dodo_uuid, (select min(pv.dodo_id) from productos_venta pv where lower(pv.nombre) = lower(x.nombre))
    from (select distinct on (dodo_uuid) dodo_uuid, nombre from tmp_productos order by dodo_uuid, nombre) x
   where not exists (select 1 from productos_codigos c where c.dodo_uuid = x.dodo_uuid)
     and exists (select 1 from productos_venta pv where lower(pv.nombre) = lower(x.nombre));
  insert into productos_venta (dodo_id, nombre, tamano)
  select nextval('productos_venta_interno'), x.nombre, nullif(x.tamano, '')
    from (select distinct on (lower(t.nombre)) t.nombre, t.tamano from tmp_productos t
           where not exists (select 1 from productos_codigos c where c.dodo_uuid = t.dodo_uuid) order by lower(t.nombre), t.nombre) x;
  insert into productos_codigos (dodo_uuid, dodo_id)
  select x.dodo_uuid, (select min(pv.dodo_id) from productos_venta pv where lower(pv.nombre) = lower(x.nombre))
    from (select distinct on (dodo_uuid) dodo_uuid, nombre from tmp_productos order by dodo_uuid, nombre) x
   where not exists (select 1 from productos_codigos c where c.dodo_uuid = x.dodo_uuid);

  -- Pedidos sincronizados de este día que ya no vienen (cancelados o devueltos después) se quitan; los demás se guardan.
  delete from pedidos where importacion_id = v_imp and dodo_id not in (select dodo_id from tmp_pedidos);
  insert into pedidos (dodo_id, sucursal_id, fecha, hora, pago, tipo, origen, origen_dodo, para_llevar, estado, total, total_sin_descuento,
                       iva, productos, promocion, turno_dodo, agregador, inicio_coccion, listo, entregado, importacion_id)
  select dodo_id, p_sucursal, p_fecha, hora, pago, tipo, origen, origen_dodo, coalesce(para_llevar, false), estado, total, total_sin_descuento,
         coalesce(iva, 0), coalesce(productos, 0), promocion, turno_dodo, agregador, inicio_coccion, listo, entregado, v_imp
    from tmp_pedidos
  on conflict (dodo_id) do update set hora = excluded.hora, pago = excluded.pago, tipo = excluded.tipo, origen = excluded.origen,
    origen_dodo = excluded.origen_dodo, para_llevar = excluded.para_llevar, estado = excluded.estado, total = excluded.total,
    total_sin_descuento = excluded.total_sin_descuento, iva = excluded.iva, productos = excluded.productos, promocion = excluded.promocion,
    turno_dodo = excluded.turno_dodo, agregador = excluded.agregador, importacion_id = excluded.importacion_id,
    -- Si una pasada no trajo tiempos (falló la consulta de producción), se conservan los que había.
    inicio_coccion = coalesce(excluded.inicio_coccion, pedidos.inicio_coccion), listo = coalesce(excluded.listo, pedidos.listo),
    entregado = coalesce(excluded.entregado, pedidos.entregado);
  delete from pedido_productos where pedido_id in (select dodo_id from tmp_pedidos);
  insert into pedido_productos (pedido_id, renglon, dodo_uuid, dodo_id, nombre, precio, precio_sin_descuento, costo_dodo, combo)
  select t.pedido_id, t.renglon, t.dodo_uuid, c.dodo_id, t.nombre, t.precio, t.precio_sin_descuento, null, t.combo
    from tmp_productos t join tmp_pedidos p on p.dodo_id = t.pedido_id join productos_codigos c on c.dodo_uuid = t.dodo_uuid;

  insert into ventas_dia (sucursal_id, fecha, pedidos, total, efectivo, tarjeta, en_linea, iva, venta_m2, importacion_id)
  values (p_sucursal, p_fecha, (p_resumen->>'pedidos')::integer, (p_resumen->>'total')::numeric, (p_resumen->>'efectivo')::numeric,
          (p_resumen->>'tarjeta')::numeric, (p_resumen->>'en_linea')::numeric, (p_resumen->>'iva')::numeric, (p_resumen->>'venta_m2')::numeric, v_imp)
  on conflict (sucursal_id, fecha) do update set pedidos = excluded.pedidos, total = excluded.total, efectivo = excluded.efectivo,
    tarjeta = excluded.tarjeta, en_linea = excluded.en_linea, iva = excluded.iva, venta_m2 = excluded.venta_m2, importacion_id = excluded.importacion_id
  returning id into v_dia;
  delete from ventas_dia_desglose where ventas_dia_id = v_dia;
  insert into ventas_dia_desglose (ventas_dia_id, tipo, pedidos, total, efectivo, tarjeta, en_linea, iva)
  select v_dia, x->>'tipo', (x->>'pedidos')::integer, (x->>'total')::numeric, (x->>'efectivo')::numeric, (x->>'tarjeta')::numeric,
         (x->>'en_linea')::numeric, (x->>'iva')::numeric
    from jsonb_array_elements(coalesce(p_desglose, '[]')) x;
  delete from ventas_producto where sucursal_id = p_sucursal and fecha = p_fecha;
  insert into ventas_producto (sucursal_id, fecha, dodo_id, nombre, cantidad, importe, importe_sin_descuento)
  select p_sucursal, p_fecha, pp.dodo_id, min(pp.nombre), count(*), sum(pp.precio), sum(pp.precio_sin_descuento)
    from pedido_productos pp join pedidos p on p.dodo_id = pp.pedido_id
   where p.sucursal_id = p_sucursal and p.fecha = p_fecha and p.estado = 'entregado' and p.tipo <> 'personal'
   group by pp.dodo_id;

  -- Una conciliación conserva la suma original de las formas de pago: si cambiaron, deja de aplicar.
  if v_previa.id is not null and (v_previa.efectivo, v_previa.tarjeta, v_previa.en_linea) is distinct from
     ((p_resumen->>'efectivo')::numeric, (p_resumen->>'tarjeta')::numeric, (p_resumen->>'en_linea')::numeric) then
    update ventas_conciliaciones set anulado_en = now(), anulado_por = v_por, motivo_anulacion = 'La venta de Dodo IS cambió después de conciliar.'
     where importacion_id = v_imp and anulado_en is null;
  end if;
  return 'ok';
end $$;
