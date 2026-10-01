-- Pruebas de la migración 0013 (Compras: facturas). Córrelas completas en Supabase → SQL Editor.
-- Necesitan dos usuarios activos de la misma sucursal; sus puestos y la empresa cambian solo mientras corre el script.
-- El resultado aparece como ERROR A PROPÓSITO para que Postgres deshaga todo:
--   · "PRUEBAS OK — …" → todo bien.   · "FALLÓ: …" → dice qué regla no se cumplió.

do $$
declare
  v_a uuid; v_b uuid; v_suc uuid; v_prov uuid; v_art uuid; v_oc uuid; v_r uuid; v_f uuid; v_nc uuid; v_n int;
  v_hoy date := (now() at time zone 'America/Mexico_City')::date;
  v_insumo text := 'FEDCBA9876543210FEDCBA9876543210';
  v_ok text[] := '{}';
  v_cfdi jsonb;
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

  -- Orden confirmada y recibida completa: 10 kg a $100 sin IVA = $1,000.
  insert into proveedores (razon_social, rfc, regimen_fiscal, dias_credito) values ('Prueba Factura Uno', 'PFU010203AB1', '601', 15) returning id into v_prov;
  insert into articulos (nombre, unidad, tipo, tasa_iva, dodo_insumo_id) values ('Prueba factura queso', 'kg', 'consumible', '0', v_insumo) returning id into v_art;
  insert into ordenes_compra (proveedor_id, sucursal_id) values (v_prov, v_suc) returning id into v_oc;
  insert into orden_renglones (orden_id, articulo_id, descripcion, cantidad, precio, tasa_iva) values (v_oc, v_art, 'Queso', 10, 100, '0') returning id into v_r;
  perform confirmar_orden(v_oc);
  perform importar_recepciones_dodo('prueba.xlsx', jsonb_build_array(jsonb_build_object('sucursal_id', v_suc, 'fecha', v_hoy)),
    jsonb_build_array(jsonb_build_object('sucursal_id', v_suc, 'dodo_insumo_id', v_insumo, 'material', 'Queso', 'unidad', 'kg', 'fecha', v_hoy, 'cantidad', 10, 'precio', 100)));
  if not recepcion_completa(v_oc) then raise exception 'FALLÓ: la orden de prueba debe quedar recibida'; end if;

  v_cfdi := jsonb_build_object('uuid', 'aaaaaaaa-0000-0000-0000-000000000001', 'serie', 'A', 'folio', '1', 'tipo', 'ingreso', 'fecha', v_hoy,
    'rfc_emisor', 'PFU010203AB1', 'nombre_emisor', 'PRUEBA FACTURA UNO', 'regimen_emisor', '601', 'rfc_receptor', 'DPM010203XY9',
    'metodo_pago', 'PPD', 'forma_pago', '99', 'moneda', 'MXN', 'subtotal', 1000, 'descuento', 0, 'iva', 0, 'retenciones', 0, 'total', 1000,
    'uuid_relacionado', null, 'conceptos', jsonb_build_array(jsonb_build_object('descripcion', 'QUESO', 'cantidad', 10, 'unidad', 'KG', 'valor_unitario', 100, 'importe', 1000)));

  -- Receptor equivocado
  begin
    perform registrar_factura(v_cfdi || jsonb_build_object('rfc_receptor', 'OTR010203AB1'), true, 'x.xml', null);
    raise exception 'FALLÓ: factura para otro RFC';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'La factura es para el RFC%' then raise exception 'FALLÓ: mensaje inesperado (receptor): %', sqlerrm; end if;
  end;

  v_f := registrar_factura(v_cfdi, false, 'PFU010203AB1/AAAAAAAA-0000-0000-0000-000000000001.xml', null);
  if (select vence_el from facturas where id = v_f) <> v_hoy + 15 then raise exception 'FALLÓ: vence = fecha + días de crédito (PPD)'; end if;
  if (select count(*) from factura_conceptos where factura_id = v_f) <> 1 then raise exception 'FALLÓ: conceptos'; end if;
  begin
    perform registrar_factura(v_cfdi, false, 'x.xml', null);
    raise exception 'FALLÓ: UUID repetido';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Esta factura ya se registró el%' then raise exception 'FALLÓ: mensaje inesperado (UUID): %', sqlerrm; end if;
  end;
  begin
    perform registrar_factura(v_cfdi || jsonb_build_object('uuid', 'aaaaaaaa-0000-0000-0000-000000000009', 'rfc_emisor', 'NUE010203AB1'), false, 'x.xml', null);
    raise exception 'FALLÓ: proveedor fuera de la cartera sin alta';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%no está en la cartera%' then raise exception 'FALLÓ: mensaje inesperado (cartera): %', sqlerrm; end if;
  end;
  perform registrar_factura(v_cfdi || jsonb_build_object('uuid', 'aaaaaaaa-0000-0000-0000-000000000002', 'rfc_emisor', 'NUE010203AB1', 'nombre_emisor', 'NUEVO SA', 'metodo_pago', 'PUE'), true, 'x.xml', null);
  if not exists (select 1 from proveedores where rfc = 'NUE010203AB1' and razon_social = 'NUEVO SA') then raise exception 'FALLÓ: alta de proveedor desde el XML'; end if;
  if (select vence_el from facturas where uuid = 'AAAAAAAA-0000-0000-0000-000000000002') <> v_hoy then raise exception 'FALLÓ: PUE vence el día de la factura'; end if;
  v_ok := array_append(v_ok, 'registrar: receptor, UUID único, vencimiento y alta del proveedor');

  -- Nota de crédito antes de ligar: resta del saldo
  v_nc := registrar_factura(v_cfdi || jsonb_build_object('uuid', 'aaaaaaaa-0000-0000-0000-000000000003', 'tipo', 'egreso', 'total', 100, 'subtotal', 100,
                            'uuid_relacionado', 'AAAAAAAA-0000-0000-0000-000000000001'), false, 'x.xml', null);
  if saldo_factura(v_f) <> 900 then raise exception 'FALLÓ: la nota de crédito resta del saldo (saldo %)', saldo_factura(v_f); end if;
  if saldo_factura(v_nc) <> 0 then raise exception 'FALLÓ: una nota de crédito no tiene saldo'; end if;
  begin
    perform ligar_factura_ordenes(v_nc, array[v_oc]);
    raise exception 'FALLÓ: una nota de crédito no se liga a órdenes';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Las notas de crédito%' then raise exception 'FALLÓ: mensaje inesperado (nota): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'notas de crédito restan del saldo');

  -- Ligar con la nota vigente: facturado 900 < 1000 → la orden sigue abierta
  perform ligar_factura_ordenes(v_f, array[v_oc]);
  if (select estado::text from ordenes_compra where id = v_oc) <> 'confirmada' then raise exception 'FALLÓ: con $900 de $1,000 no se cierra'; end if;
  -- Cancelar la nota y volver a ligar: facturado 1000 → se cierra sola
  perform cancelar_factura(v_nc, 'Prueba');
  perform ligar_factura_ordenes(v_f, array[v_oc]);
  if (select estado::text from ordenes_compra where id = v_oc) <> 'cerrada' then raise exception 'FALLÓ: recibida y facturada completa se cierra sola'; end if;
  if (select motivo from ordenes_compra where id = v_oc) <> 'Recibida y facturada' then raise exception 'FALLÓ: motivo del cierre automático'; end if;
  v_ok := array_append(v_ok, 'cierre automático al quedar recibida y facturada');

  -- Revisar, vencimiento, cancelar
  begin
    perform marcar_factura_revisada(v_f, ' ');
    raise exception 'FALLÓ: revisar sin nota';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
  end;
  perform marcar_factura_revisada(v_f, 'Cuadra con la remisión');
  perform cambiar_vencimiento(v_f, v_hoy + 3);
  if (select vence_el from facturas where id = v_f) <> v_hoy + 3 then raise exception 'FALLÓ: cambiar vencimiento'; end if;
  perform cancelar_factura(v_f, 'El proveedor la canceló en el SAT');
  if (select count(*) from factura_ordenes where factura_id = v_f) <> 0 then raise exception 'FALLÓ: cancelar quita las ligas'; end if;
  v_ok := array_append(v_ok, 'revisar con nota, vencimiento y cancelar');

  -- Gerente no ve facturas; corporativo consulta
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  select count(*) into v_n from facturas;
  if v_n <> 0 then raise exception 'FALLÓ: el gerente no ve facturas'; end if;
  execute 'reset role';
  update perfiles set rol = 'corporativo', sucursal_id = null where id = v_b;
  execute 'set local role authenticated';
  select count(*) into v_n from facturas where id = v_f;
  if v_n <> 1 then raise exception 'FALLÓ: corporativo lee facturas'; end if;
  begin
    perform registrar_factura(v_cfdi || jsonb_build_object('uuid', 'aaaaaaaa-0000-0000-0000-000000000004'), false, 'x.xml', null);
    raise exception 'FALLÓ: corporativo no registra';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Corporativo%' then raise exception 'FALLÓ: mensaje inesperado (corporativo): %', sqlerrm; end if;
  end;
  execute 'reset role';
  v_ok := array_append(v_ok, 'la sucursal no ve facturas; corporativo consulta');

  raise exception 'PRUEBAS OK — %', array_to_string(v_ok, ' · ');
end $$;
