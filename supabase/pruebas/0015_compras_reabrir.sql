-- Pruebas de la migración 0015 (reabrir órdenes al cancelar o desligar su factura). Córrelas completas en Supabase → SQL Editor.
-- Necesitan un usuario activo con sucursal; su puesto y la empresa cambian solo mientras corre el script.
-- El resultado aparece como ERROR A PROPÓSITO para que Postgres deshaga todo:
--   · "PRUEBAS OK — …" → todo bien.   · "FALLÓ: …" → dice qué regla no se cumplió.

do $$
declare
  v_a uuid; v_suc uuid; v_prov uuid; v_art uuid; v_o1 uuid; v_o2 uuid; v_o3 uuid; v_f1 uuid; v_f2 uuid; v_f3 uuid;
  v_hoy date := (now() at time zone 'America/Mexico_City')::date;
  v_base jsonb;
  v_ok text[] := '{}';
begin
  select id, sucursal_id into v_a, v_suc from perfiles where activo and sucursal_id is not null limit 1;
  if v_a is null then raise exception 'FALTAN DATOS: se necesita un usuario activo con sucursal.'; end if;
  update perfiles set rol = 'admin' where id = v_a;
  delete from empresa;
  insert into empresa (rfc, razon_social) values ('DPM010203XY9', 'Dodo Pizza Prueba');
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  insert into proveedores (razon_social, rfc, regimen_fiscal) values ('Prueba Reabrir', 'PRA010203AB1', '601') returning id into v_prov;
  insert into articulos (nombre, unidad, tipo) values ('Prueba reabrir horno', 'pza', 'activo_fijo') returning id into v_art;
  v_base := jsonb_build_object('tipo', 'ingreso', 'fecha', v_hoy, 'rfc_emisor', 'PRA010203AB1', 'nombre_emisor', 'PRUEBA REABRIR', 'regimen_emisor', '601',
    'rfc_receptor', 'DPM010203XY9', 'metodo_pago', 'PPD', 'moneda', 'MXN', 'descuento', 0, 'iva', 0, 'retenciones', 0, 'conceptos', '[]'::jsonb,
    'subtotal', 1000, 'total', 1000);

  -- Tres órdenes de $1,000 recibidas completas.
  insert into ordenes_compra (proveedor_id, sucursal_id) values (v_prov, v_suc) returning id into v_o1;
  insert into ordenes_compra (proveedor_id, sucursal_id) values (v_prov, v_suc) returning id into v_o2;
  insert into ordenes_compra (proveedor_id, sucursal_id) values (v_prov, v_suc) returning id into v_o3;
  insert into orden_renglones (orden_id, articulo_id, descripcion, cantidad, precio, tasa_iva)
  select o, v_art, 'Horno', 1, 1000, '0' from unnest(array[v_o1, v_o2, v_o3]) o;
  perform confirmar_orden(v_o1); perform confirmar_orden(v_o2); perform confirmar_orden(v_o3);
  perform recibir_renglon(r.id, 1, v_hoy, null) from orden_renglones r where r.orden_id in (v_o1, v_o2, v_o3);

  v_f1 := registrar_factura(v_base || jsonb_build_object('uuid', 'dddddddd-0000-0000-0000-000000000001', 'folio', '1'), false, 'x.xml', null);
  v_f2 := registrar_factura(v_base || jsonb_build_object('uuid', 'dddddddd-0000-0000-0000-000000000002', 'folio', '2'), false, 'x.xml', null);
  v_f3 := registrar_factura(v_base || jsonb_build_object('uuid', 'dddddddd-0000-0000-0000-000000000003', 'folio', '3'), false, 'x.xml', null);
  perform ligar_factura_ordenes(v_f1, array[v_o1]);
  perform ligar_factura_ordenes(v_f2, array[v_o2]);
  perform ligar_factura_ordenes(v_f3, array[v_o3]);
  if (select count(*) from ordenes_compra where id in (v_o1, v_o2, v_o3) and estado = 'cerrada') <> 3 then
    raise exception 'FALLÓ: las tres órdenes deben cerrarse solas';
  end if;

  -- Cancelar la factura reabre la orden que había cerrado
  perform cancelar_factura(v_f1, 'El proveedor la canceló en el SAT');
  if (select estado::text from ordenes_compra where id = v_o1) <> 'confirmada' then raise exception 'FALLÓ: cancelar la factura reabre la orden'; end if;
  if not exists (select 1 from orden_historial where orden_id = v_o1 and evento = 'reabierta') then raise exception 'FALLÓ: el historial registra la reapertura'; end if;
  v_ok := array_append(v_ok, 'cancelar la factura reabre la orden cerrada sola');

  -- Desligar (guardar la factura sin esa orden) también la reabre
  perform ligar_factura_ordenes(v_f2, '{}');
  if (select estado::text from ordenes_compra where id = v_o2) <> 'confirmada' then raise exception 'FALLÓ: desligar la factura reabre la orden'; end if;
  v_ok := array_append(v_ok, 'desligar la factura reabre la orden');

  -- Una orden cerrada a mano no se reabre
  execute 'reset role';
  update ordenes_compra set motivo = 'Cerrada por el admin' where id = v_o3;
  execute 'set local role authenticated';
  perform cancelar_factura(v_f3, 'Prueba');
  if (select estado::text from ordenes_compra where id = v_o3) <> 'cerrada' then raise exception 'FALLÓ: una orden cerrada a mano no se reabre'; end if;
  v_ok := array_append(v_ok, 'una orden cerrada a mano no se toca');

  begin
    perform reabrir_ordenes_incompletas(array[v_o3]);
    raise exception 'FALLÓ: reabrir_ordenes_incompletas es interna';
  exception when insufficient_privilege then null; end;
  execute 'reset role';

  raise exception 'PRUEBAS OK — %', array_to_string(v_ok, ' · ');
end $$;
