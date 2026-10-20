-- Pruebas de recepciones de insumos desde Dodo IS. Córrelas completas en Supabase → SQL Editor después de la migración.
-- Necesitan un admin activo y una sucursal de la razón social principal. Usan febrero de 2020 (sin recepciones).
--   · "PRUEBAS OK — …" → todo bien (no deja cambios).   · "FALLÓ: …" → dice qué regla no se cumplió.

do $$
declare
  v_a uuid; v_s uuid; v_rfc text; v_p1 uuid; v_p2 uuid; v_art uuid; v_o1 uuid; v_o2 uuid; v_r1 uuid; v_r2 uuid; v_imp uuid; v_f1 uuid; v_res jsonb; v_ok text[] := '{}';
  servidor text := json_build_object('role', 'service_role')::text;
  ins text := 'AAAA0000000000000000000000000001';
  fila jsonb := jsonb_build_object('dodo_insumo_id', 'AAAA0000000000000000000000000001', 'material', 'Insumo prueba', 'unidad', 'kg',
    'recibido_en', '2020-02-03T10:00:00', 'precio', 26.45, 'tasa_iva', 16, 'dodo_proveedor_id', 'S1PRUEBA', 'factura_fecha', null, 'modificado_dodo', null);
  r1 jsonb; r2 jsonb; r3 jsonb;
begin
  select id into v_a from perfiles where rol::text = 'admin' and activo limit 1;
  select rfc into v_rfc from razones_sociales where principal;
  select id into v_s from sucursales s where razon_admite_sucursal(v_rfc, s.id) order by nombre limit 1;
  if v_a is null or v_s is null then raise exception 'FALTAN DATOS: se necesitan un admin y una sucursal de la razón social principal.'; end if;
  if exists (select 1 from recepciones_dodo where fecha between '2020-02-01' and '2020-02-29') then raise exception 'FALTAN DATOS: febrero de 2020 ya tiene recepciones.'; end if;
  r1 := fila || jsonb_build_object('dodo_documento_id', 'D1', 'fecha', '2020-02-03', 'cantidad', 6, 'importe_sin_iva', 158.7, 'importe_con_iva', 184.09, 'factura_texto', 'Aa1654842');
  r2 := fila || jsonb_build_object('dodo_documento_id', 'D2', 'fecha', '2020-02-04', 'cantidad', 2, 'importe_sin_iva', 52.9, 'importe_con_iva', 61.36, 'factura_texto', '0002');
  r3 := fila || jsonb_build_object('dodo_documento_id', 'D3', 'fecha', '2020-02-04', 'cantidad', 3, 'importe_sin_iva', 79.35, 'importe_con_iva', 92.05, 'factura_texto', null);

  -- Datos: dos proveedores con orden confirmada del mismo insumo (la de P2 es más antigua).
  insert into proveedores (razon_social, rfc, regimen_fiscal) values ('Proveedor recepciones 1', 'PRUE800101AB4', '601') returning id into v_p1;
  insert into proveedores (razon_social, rfc, regimen_fiscal) values ('Proveedor recepciones 2', 'PRUE800101AB5', '601') returning id into v_p2;
  insert into articulos (nombre, unidad, tipo, dodo_insumo_id) values ('Insumo prueba recepciones', 'kg', 'consumible', ins) returning id into v_art;
  insert into ordenes_compra (proveedor_id, sucursal_id) values (v_p2, v_s) returning id into v_o2;
  insert into orden_renglones (orden_id, articulo_id, descripcion, cantidad, precio, tasa_iva) values (v_o2, v_art, 'Insumo', 10, 26.45, '16');
  update ordenes_compra set estado = 'confirmada', confirmada_en = '2020-01-31 12:00-06' where id = v_o2;
  insert into ordenes_compra (proveedor_id, sucursal_id) values (v_p1, v_s) returning id into v_o1;
  insert into orden_renglones (orden_id, articulo_id, descripcion, cantidad, precio, tasa_iva) values (v_o1, v_art, 'Insumo', 10, 26.45, '16') returning id into v_r1;
  update ordenes_compra set estado = 'confirmada', confirmada_en = '2020-02-01 12:00-06' where id = v_o1;
  insert into facturas (origen, uuid, serie, folio, tipo, fecha_emision, rfc_emisor, nombre_emisor, regimen_emisor, rfc_receptor, subtotal, total, proveedor_id, vence_el, xml_ruta)
  values ('cfdi', 'PRUEBA-REC-F1', 'AA', '1654842', 'ingreso', '2020-02-03', 'PRUE800101AB4', 'Proveedor recepciones 1', '601', v_rfc, 158.7, 184.09, v_p1, '2020-02-03', 'prueba-rec-1.xml')
  returning id into v_f1;
  insert into facturas (origen, uuid, folio, tipo, fecha_emision, rfc_emisor, nombre_emisor, regimen_emisor, rfc_receptor, subtotal, total, proveedor_id, vence_el, xml_ruta)
  values ('cfdi', 'PRUEBA-REC-F2', '2', 'ingreso', '2020-02-04', 'PRUE800101AB4', 'Proveedor recepciones 1', '601', v_rfc, 10, 10, v_p1, '2020-02-04', 'prueba-rec-2.xml'),
         ('cfdi', 'PRUEBA-REC-F3', '002', 'ingreso', '2020-02-05', 'PRUE800101AB4', 'Proveedor recepciones 1', '601', v_rfc, 10, 10, v_p1, '2020-02-05', 'prueba-rec-3.xml');

  -- Lo del Excel: el 3 marcado a mano como traspaso; el 4 como compra sin orden.
  insert into importaciones_recepciones (archivo, renglones) values ('prueba.xlsx', 2) returning id into v_imp;
  insert into recepciones_dodo (sucursal_id, dodo_insumo_id, material, unidad, fecha, cantidad, precio, importacion_id, clasificacion)
  values (v_s, ins, 'Insumo prueba', 'kg', '2020-02-03', 6, 26.45, v_imp, 'traspaso'), (v_s, ins, 'Insumo prueba', 'kg', '2020-02-04', 5, 26.45, v_imp, 'sin_orden');

  -- Solo el servidor sincroniza.
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  begin
    perform sincronizar_recepciones_dodo(v_s, '2020-02-03', '2020-02-05', jsonb_build_array(r1, r2, r3));
    raise exception 'FALLÓ: un usuario no sincroniza';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm <> 'Solo el servidor sincroniza recepciones.' then raise exception 'FALLÓ: mensaje inesperado (usuario): %', sqlerrm; end if;
  end;

  perform set_config('request.jwt.claims', servidor, true);
  v_res := sincronizar_recepciones_dodo(v_s, '2020-02-03', '2020-02-05', jsonb_build_array(r1, r2, r3));
  if exists (select 1 from recepciones_dodo where sucursal_id = v_s and fuente = 'excel' and fecha in ('2020-02-03', '2020-02-04')) then raise exception 'FALLÓ: lo del Excel de esos días se reemplaza'; end if;
  if (select count(*) from recepciones_dodo where sucursal_id = v_s and fuente = 'api' and fecha between '2020-02-03' and '2020-02-05') <> 3 then raise exception 'FALLÓ: se guardan 3 entregas'; end if;
  if (select clasificacion from recepciones_dodo where dodo_documento_id = 'D1') <> 'traspaso' then raise exception 'FALLÓ: con una sola entrega pasa la clasificación manual'; end if;
  if (select clasificacion from recepciones_dodo where dodo_documento_id = 'D2') <> 'pendiente' or (v_res->>'varias')::int <> 1 then raise exception 'FALLÓ: con varias entregas queda pendiente y se avisa (%)', v_res; end if;
  if (v_res->>'sin_proveedor')::int <> 3 then raise exception 'FALLÓ: sin proveedor ligado (%)', v_res; end if;
  perform sincronizar_recepciones_dodo(v_s, '2020-02-03', '2020-02-05', jsonb_build_array(r1, r2, r3));
  if (select count(*) from recepciones_dodo where sucursal_id = v_s and fuente = 'api') <> 3 then raise exception 'FALLÓ: volver a sincronizar no duplica'; end if;
  v_ok := array_append(v_ok, 'solo servidor; reemplaza el Excel pasando la clasificación; varias entregas quedan pendientes; sin duplicar');

  -- Ligar el proveedor: liga factura por folio (no la ambigua) y orden del mismo proveedor (no la más antigua de otro).
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  if ligar_proveedor_dodois(v_p1, 's1prueba') <> 3 then raise exception 'FALLÓ: ligar el proveedor actualiza sus 3 recepciones'; end if;
  if (select factura_id from recepciones_dodo where dodo_documento_id = 'D1') is distinct from v_f1 then raise exception 'FALLÓ: liga la factura por folio'; end if;
  if (select factura_id from recepciones_dodo where dodo_documento_id = 'D2') is not null then raise exception 'FALLÓ: un folio ambiguo no se liga'; end if;
  if (select orden_renglon_id from recepciones_dodo where dodo_documento_id = 'D2') is distinct from v_r1 then raise exception 'FALLÓ: liga la orden del mismo proveedor'; end if;
  begin
    perform ligar_proveedor_dodois(v_p2, 'S1PRUEBA');
    raise exception 'FALLÓ: un proveedor de Dodo no se liga a dos de la cartera';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm <> 'Ese proveedor de Dodo IS ya está ligado a otro proveedor.' then raise exception 'FALLÓ: mensaje inesperado (doble): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'liga factura por folio sin ambigüedad y orden del mismo proveedor');

  -- Entrega borrada en Dodo: se quita.
  perform set_config('request.jwt.claims', servidor, true);
  perform sincronizar_recepciones_dodo(v_s, '2020-02-03', '2020-02-05', jsonb_build_array(r1, r2));
  if exists (select 1 from recepciones_dodo where dodo_documento_id = 'D3') then raise exception 'FALLÓ: la entrega que ya no viene se quita'; end if;
  v_ok := array_append(v_ok, 'quita entregas borradas');

  -- El Excel no pisa un día con API; un día sin API sí entra.
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  perform importar_recepciones_dodo('prueba2.xlsx',
    jsonb_build_array(jsonb_build_object('sucursal_id', v_s, 'fecha', '2020-02-03'), jsonb_build_object('sucursal_id', v_s, 'fecha', '2020-02-06')),
    jsonb_build_array(jsonb_build_object('sucursal_id', v_s, 'dodo_insumo_id', ins, 'material', 'Insumo prueba', 'unidad', 'kg', 'fecha', '2020-02-03', 'cantidad', 9, 'precio', 1),
                      jsonb_build_object('sucursal_id', v_s, 'dodo_insumo_id', ins, 'material', 'Insumo prueba', 'unidad', 'kg', 'fecha', '2020-02-06', 'cantidad', 1, 'precio', 1)));
  if exists (select 1 from recepciones_dodo where sucursal_id = v_s and fuente = 'excel' and fecha = '2020-02-03')
     or not exists (select 1 from recepciones_dodo where dodo_documento_id = 'D1') then raise exception 'FALLÓ: el Excel no pisa un día con API'; end if;
  if not exists (select 1 from recepciones_dodo where sucursal_id = v_s and fuente = 'excel' and fecha = '2020-02-06') then raise exception 'FALLÓ: un día sin API sí entra del Excel'; end if;
  v_ok := array_append(v_ok, 'el Excel respeta los días de la API');

  raise exception 'PRUEBAS OK — %', array_to_string(v_ok, ' · ');
end $$;
