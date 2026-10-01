-- Pruebas de la migración 0014 (Compras: pagos y complementos). Córrelas completas en Supabase → SQL Editor.
-- Necesitan dos usuarios activos de la misma sucursal; sus puestos y la empresa cambian solo mientras corre el script.
-- El resultado aparece como ERROR A PROPÓSITO para que Postgres deshaga todo:
--   · "PRUEBAS OK — …" → todo bien.   · "FALLÓ: …" → dice qué regla no se cumplió.

do $$
declare
  v_a uuid; v_b uuid; v_suc uuid; v_prov uuid; v_prov2 uuid; v_f1 uuid; v_f2 uuid; v_fx uuid; v_pago uuid; v_pago2 uuid; v_n int;
  v_hoy date := (now() at time zone 'America/Mexico_City')::date;
  v_base jsonb;
  v_ok text[] := '{}';
begin
  select a.id, b.id, a.sucursal_id into v_a, v_b, v_suc
    from perfiles a join perfiles b on b.id <> a.id and b.activo and b.sucursal_id = a.sucursal_id
   where a.activo and a.sucursal_id is not null
   limit 1;
  if v_a is null then raise exception 'FALTAN DATOS: se necesitan dos usuarios activos de la misma sucursal.'; end if;
  update perfiles set rol = 'admin' where id = v_a;
  update perfiles set rol = 'gerente' where id = v_b;
  delete from empresa;
  insert into empresa (rfc, razon_social) values ('DPM010203XY9', 'Dodo Pizza Prueba');

  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  insert into proveedores (razon_social, rfc, regimen_fiscal, dias_credito) values ('Prueba Pago Uno', 'PPU010203AB1', '601', 30) returning id into v_prov;
  insert into proveedores (razon_social, rfc, regimen_fiscal) values ('Prueba Pago Dos', 'PPD010203AB1', '601') returning id into v_prov2;
  v_base := jsonb_build_object('tipo', 'ingreso', 'fecha', v_hoy, 'rfc_emisor', 'PPU010203AB1', 'nombre_emisor', 'PRUEBA PAGO UNO', 'regimen_emisor', '601',
    'rfc_receptor', 'DPM010203XY9', 'metodo_pago', 'PPD', 'moneda', 'MXN', 'descuento', 0, 'iva', 0, 'retenciones', 0, 'conceptos', '[]'::jsonb);
  v_f1 := registrar_factura(v_base || jsonb_build_object('uuid', 'bbbbbbbb-0000-0000-0000-000000000001', 'folio', '1', 'subtotal', 1000, 'total', 1000), false, 'x.xml', null);
  v_f2 := registrar_factura(v_base || jsonb_build_object('uuid', 'bbbbbbbb-0000-0000-0000-000000000002', 'folio', '2', 'subtotal', 500, 'total', 500), false, 'x.xml', null);
  v_fx := registrar_factura(v_base || jsonb_build_object('uuid', 'bbbbbbbb-0000-0000-0000-000000000003', 'folio', '3', 'subtotal', 100, 'total', 100,
                            'rfc_emisor', 'PPD010203AB1'), false, 'x.xml', null);

  -- Reglas del pago
  begin
    perform registrar_pago(v_prov, v_hoy, 1200, 'transferencia', null, null, null, jsonb_build_array(jsonb_build_object('factura_id', v_f1, 'monto', 1200)));
    raise exception 'FALLÓ: aplicar más que el saldo';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%su saldo es%' then raise exception 'FALLÓ: mensaje inesperado (saldo): %', sqlerrm; end if;
  end;
  begin
    perform registrar_pago(v_prov, v_hoy, 900, 'transferencia', null, null, null, jsonb_build_array(jsonb_build_object('factura_id', v_f1, 'monto', 800)));
    raise exception 'FALLÓ: lo aplicado no suma el monto';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Lo aplicado%' then raise exception 'FALLÓ: mensaje inesperado (suma): %', sqlerrm; end if;
  end;
  begin
    perform registrar_pago(v_prov, v_hoy, 200, 'transferencia', null, null, null,
      jsonb_build_array(jsonb_build_object('factura_id', v_f1, 'monto', 100), jsonb_build_object('factura_id', v_fx, 'monto', 100)));
    raise exception 'FALLÓ: facturas de dos proveedores';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%mismo proveedor%' then raise exception 'FALLÓ: mensaje inesperado (proveedor): %', sqlerrm; end if;
  end;
  begin
    perform registrar_pago(v_prov, v_hoy + 1, 100, 'transferencia', null, null, null, jsonb_build_array(jsonb_build_object('factura_id', v_f1, 'monto', 100)));
    raise exception 'FALLÓ: fecha futura';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%futura%' then raise exception 'FALLÓ: mensaje inesperado (futura): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'reglas: saldo, suma, mismo proveedor y fecha');

  -- Un pago a dos facturas: completa una y abona a la otra
  v_pago := registrar_pago(v_prov, v_hoy, 1200, 'transferencia', 'BBVA', 'REF-1', null,
    jsonb_build_array(jsonb_build_object('factura_id', v_f1, 'monto', 1000), jsonb_build_object('factura_id', v_f2, 'monto', 200)));
  if (select estado::text from facturas where id = v_f1) <> 'pagada' then raise exception 'FALLÓ: pagada'; end if;
  if (select estado::text from facturas where id = v_f2) <> 'parcial' then raise exception 'FALLÓ: parcial'; end if;
  if saldo_factura(v_f2) <> 300 then raise exception 'FALLÓ: saldo tras abono (%)', saldo_factura(v_f2); end if;
  if neto_factura(v_f1) <> 1000 then raise exception 'FALLÓ: el neto no cambia con pagos'; end if;
  begin
    perform cancelar_factura(v_f1, 'Prueba');
    raise exception 'FALLÓ: cancelar con pagos';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%tiene pagos%' then raise exception 'FALLÓ: mensaje inesperado (cancelar): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'un pago a varias facturas: pagada y parcial');

  -- Complemento (PPD): falta hasta que se sube; cubre una factura que llega después
  if not falta_complemento(v_f1) then raise exception 'FALLÓ: PPD pagada sin complemento debe marcarse'; end if;
  perform registrar_complemento(jsonb_build_object('uuid', 'cccccccc-0000-0000-0000-000000000001', 'fecha', v_hoy, 'rfc_emisor', 'PPU010203AB1',
    'nombre_emisor', 'PRUEBA PAGO UNO', 'rfc_receptor', 'DPM010203XY9', 'monto', 1400,
    'documentos', jsonb_build_array(
      jsonb_build_object('uuid', 'bbbbbbbb-0000-0000-0000-000000000001', 'monto_pagado', 1000, 'parcialidad', 1),
      jsonb_build_object('uuid', 'bbbbbbbb-0000-0000-0000-000000000009', 'monto_pagado', 200, 'parcialidad', 1))), 'c.xml');
  if falta_complemento(v_f1) then raise exception 'FALLÓ: el complemento cubre la factura 1'; end if;
  if not falta_complemento(v_f2) then raise exception 'FALLÓ: la factura 2 sigue sin complemento'; end if;
  begin
    perform registrar_complemento(jsonb_build_object('uuid', 'cccccccc-0000-0000-0000-000000000001', 'fecha', v_hoy, 'rfc_emisor', 'PPU010203AB1',
      'rfc_receptor', 'DPM010203XY9', 'documentos', '[]'::jsonb), 'c.xml');
    raise exception 'FALLÓ: complemento repetido';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Este complemento ya se registró%' then raise exception 'FALLÓ: mensaje inesperado (complemento): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'complementos: falta, cubre por UUID y no se repiten');

  -- Programar y anular
  perform programar_pago(v_f2, v_hoy + 5);
  if (select pago_programado_el from facturas where id = v_f2) <> v_hoy + 5 then raise exception 'FALLÓ: programar'; end if;
  begin
    perform programar_pago(v_f1, v_hoy + 5);
    raise exception 'FALLÓ: programar una pagada';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
  end;
  perform anular_pago(v_pago, 'Pago duplicado');
  if (select estado::text from facturas where id = v_f1) <> 'por_pagar' or (select estado::text from facturas where id = v_f2) <> 'por_pagar' then
    raise exception 'FALLÓ: anular devuelve las facturas a por pagar';
  end if;
  if saldo_factura(v_f2) <> 500 then raise exception 'FALLÓ: anular devuelve el saldo'; end if;
  begin
    perform anular_pago(v_pago, 'otra vez');
    raise exception 'FALLÓ: anular dos veces';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
  end;
  v_ok := array_append(v_ok, 'programar y anular con motivo');

  -- Factura que no cuadra con su orden: hay que revisarla antes de pagar
  declare v_art uuid; v_oc uuid;
  begin
    insert into articulos (nombre, unidad, tipo) values ('Prueba pago horno', 'pza', 'activo_fijo') returning id into v_art;
    insert into ordenes_compra (proveedor_id, sucursal_id) values (v_prov, v_suc) returning id into v_oc;
    insert into orden_renglones (orden_id, articulo_id, descripcion, cantidad, precio, tasa_iva) values (v_oc, v_art, 'Horno', 1, 500, '0');
    perform confirmar_orden(v_oc);
    perform ligar_factura_ordenes(v_f2, array[v_oc]);
    if cotejo_factura(v_f2) <> 'nada_recibido' then raise exception 'FALLÓ: cotejo sin recibir (%)', cotejo_factura(v_f2); end if;
    begin
      perform registrar_pago(v_prov, v_hoy, 100, 'transferencia', null, null, null, jsonb_build_array(jsonb_build_object('factura_id', v_f2, 'monto', 100)));
      raise exception 'FALLÓ: pagar una factura que no cuadra sin revisarla';
    exception when others then
      if sqlerrm like 'FALLÓ%' then raise; end if;
      if sqlerrm not like '%márcala como revisada%' then raise exception 'FALLÓ: mensaje inesperado (revisada): %', sqlerrm; end if;
    end;
    perform marcar_factura_revisada(v_f2, 'Anticipo acordado');
    v_pago2 := registrar_pago(v_prov, v_hoy, 100, 'cheque', null, 'CH-9', null, jsonb_build_array(jsonb_build_object('factura_id', v_f2, 'monto', 100)));
    if v_pago2 is null then raise exception 'FALLÓ: pagar revisada'; end if;
  end;
  v_ok := array_append(v_ok, 'si no cuadra, se revisa antes de pagar');

  -- Gerente no ve pagos; corporativo consulta y no paga
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  select count(*) into v_n from pagos;
  if v_n <> 0 then raise exception 'FALLÓ: el gerente no ve pagos'; end if;
  execute 'reset role';
  update perfiles set rol = 'corporativo', sucursal_id = null where id = v_b;
  execute 'set local role authenticated';
  select count(*) into v_n from pagos where id in (v_pago, v_pago2);
  if v_n <> 2 then raise exception 'FALLÓ: corporativo lee pagos'; end if;
  begin
    perform registrar_pago(v_prov, v_hoy, 50, 'efectivo', null, null, null, jsonb_build_array(jsonb_build_object('factura_id', v_f2, 'monto', 50)));
    raise exception 'FALLÓ: corporativo no paga';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Corporativo%' then raise exception 'FALLÓ: mensaje inesperado (corporativo): %', sqlerrm; end if;
  end;
  begin
    perform actualizar_estado_factura(v_f2);
    raise exception 'FALLÓ: actualizar_estado_factura es interna';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  v_ok := array_append(v_ok, 'la sucursal no ve pagos; corporativo consulta');

  raise exception 'PRUEBAS OK — %', array_to_string(v_ok, ' · ');
end $$;
