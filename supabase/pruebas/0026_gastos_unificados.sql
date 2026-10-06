-- Pruebas de la migración 0026 (gastos unificados). Córrelas completas en Supabase → SQL Editor después de la migración.
-- Necesitan un usuario activo con sucursal y un usuario corporativo activo. Si aún no hay datos de la empresa, se usa uno de prueba (se deshace).
-- El resultado aparece como ERROR A PROPÓSITO para que Postgres deshaga todo:
--   · "PRUEBAS OK — …" → todo bien.   · "FALLÓ: …" → dice qué regla no se cumplió.

do $$
declare
  v_a uuid; v_c uuid; v_suc uuid; v_prov uuid; v_otro uuid; v_manual uuid; v_cfdi uuid; v_pago uuid; v_faltan boolean; v_n numeric; v_res jsonb; v_manual2 uuid; v_cfdi2 uuid;
  v_ok text[] := '{}';
begin
  select id, sucursal_id into v_a, v_suc from perfiles where activo and sucursal_id is not null limit 1;
  if v_a is null then raise exception 'FALTAN DATOS: se necesita un usuario activo con sucursal.'; end if;
  select id into v_c from perfiles where rol::text = 'corporativo' and activo limit 1;
  if v_c is null then raise exception 'FALTAN DATOS: se necesita un usuario corporativo activo.'; end if;
  if not exists (select 1 from empresa) then insert into empresa (rfc, razon_social) values ('DMX010101AB1', 'Empresa de prueba'); end if;
  -- Desde 0028 los pagos solo se registran sin motivo en días autorizados: aquí todos los días lo son (se deshace al final).
  update empresa set dias_pago = '{1,2,3,4,5,6,7}';

  insert into proveedores (razon_social, rfc, regimen_fiscal, cuenta_pl, sucursal_id, dias_credito)
  values ('Arrendador Prueba', 'PEPJ800101AB1', '606', 'renta', v_suc, 5) returning id into v_prov;
  insert into proveedores (razon_social, rfc, regimen_fiscal) values ('Otro Prueba', 'OTRO800101AB1', '601') returning id into v_otro;

  update perfiles set rol = 'admin' where id = v_a;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);

  -- Alta de la prefactura de renta + agua.
  v_manual := registrar_gasto_manual(jsonb_build_object(
    'proveedor_id', v_prov, 'sucursal_id', v_suc, 'fecha', hoy_mx() - 1, 'vence_el', null, 'folio', 'Prefactura renta', 'adjunto', null,
    'renglones', jsonb_build_array(jsonb_build_object('descripcion', 'Renta', 'importe', 30000, 'cuenta_pl', 'renta'),
                                   jsonb_build_object('descripcion', 'Agua', 'importe', 1200, 'cuenta_pl', 'servicios')),
    'subtotal', 31200, 'iva', 4992, 'retencion_iva', 3328, 'retencion_isr', 3120, 'total', 29744));
  if (select origen from facturas where id = v_manual) <> 'manual' or (select uuid from facturas where id = v_manual) is not null then raise exception 'FALLÓ: debía quedar como gasto sin CFDI'; end if;
  if (select total from facturas where id = v_manual) <> 29744 or (select retenciones from facturas where id = v_manual) <> 6448 then raise exception 'FALLÓ: total y retenciones'; end if;
  if (select saldo from facturas_saldo where id = v_manual) <> 29744 then raise exception 'FALLÓ: saldo del gasto sin CFDI'; end if;
  if (select vence_el from facturas where id = v_manual) <> hoy_mx() - 1 + 5 then raise exception 'FALLÓ: vencimiento por días de crédito'; end if;
  if (select string_agg(cuenta_pl, ',' order by importe desc) from factura_conceptos where factura_id = v_manual) <> 'renta,servicios' then raise exception 'FALLÓ: cuenta por renglón'; end if;
  v_ok := array_append(v_ok, 'alta de gasto sin CFDI con cuenta por renglón');

  begin
    perform registrar_gasto_manual(jsonb_build_object('proveedor_id', v_prov, 'sucursal_id', null, 'fecha', hoy_mx(), 'folio', ' ',
      'renglones', jsonb_build_array(jsonb_build_object('descripcion', 'X', 'importe', 10)), 'subtotal', 10, 'iva', 0, 'retencion_iva', 0, 'retencion_isr', 0, 'total', 10));
    raise exception 'FALLÓ: sin referencia no debe pasar';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Escribe la referencia%' then raise exception 'FALLÓ: mensaje inesperado (referencia): %', sqlerrm; end if;
  end;
  begin
    perform registrar_gasto_manual(jsonb_build_object('proveedor_id', v_prov, 'sucursal_id', null, 'fecha', hoy_mx(), 'folio', 'X',
      'renglones', jsonb_build_array(jsonb_build_object('descripcion', 'X', 'importe', 10)), 'subtotal', 10, 'iva', 1.6, 'retencion_iva', 0, 'retencion_isr', 0, 'total', 99));
    raise exception 'FALLÓ: un total que no cuadra no debe pasar';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'El total no cuadra%' then raise exception 'FALLÓ: mensaje inesperado (total): %', sqlerrm; end if;
  end;
  begin
    insert into facturas (tipo, fecha_emision, rfc_emisor, nombre_emisor, regimen_emisor, rfc_receptor, subtotal, total, proveedor_id, vence_el)
    values ('ingreso', hoy_mx(), 'X', 'X', '601', 'X', 1, 1, v_prov, hoy_mx());
    raise exception 'FALLÓ: un CFDI sin UUID ni XML no debe pasar';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%facturas_cfdi_completo%' then raise exception 'FALLÓ: mensaje inesperado (check): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'reglas del alta (referencia, total, CFDI completo)');

  -- Pago de una parte del gasto sin CFDI.
  v_pago := registrar_pago(v_prov, hoy_mx() - 1, 10000, 'transferencia', null, 'prueba', null,
    jsonb_build_array(jsonb_build_object('factura_id', v_manual, 'monto', 10000)));
  if (select estado::text from facturas where id = v_manual) <> 'parcial' then raise exception 'FALLÓ: el gasto sin CFDI se paga como factura'; end if;

  -- Llega el CFDI (sin destino: toma la sucursal del proveedor) con dos conceptos sin cuenta.
  insert into facturas (uuid, tipo, fecha_emision, rfc_emisor, nombre_emisor, regimen_emisor, rfc_receptor, subtotal, iva, retenciones, total, proveedor_id, vence_el, xml_ruta)
  values ('PRUEBA-0026-CFDI', 'ingreso', hoy_mx(), 'PEPJ800101AB1', 'Arrendador Prueba', '606', (select rfc from empresa), 31200, 4992, 6448, 29744, v_prov, hoy_mx() + 5, 'prueba.xml')
  returning id into v_cfdi;
  if (select sucursal_id from facturas where id = v_cfdi) is distinct from v_suc then raise exception 'FALLÓ: el CFDI toma la sucursal por omisión del proveedor'; end if;
  insert into factura_conceptos (factura_id, descripcion, cantidad, unidad, valor_unitario, importe)
  values (v_cfdi, 'Renta', 1, '', 30000, 30000), (v_cfdi, 'Agua', 1, '', 1200, 1200);
  v_ok := array_append(v_ok, 'el CFDI toma la sucursal por omisión del proveedor');

  -- Corporativo no sustituye.
  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  begin
    perform sustituir_factura_manual(v_cfdi, v_manual);
    raise exception 'FALLÓ: corporativo no debe sustituir';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Corporativo solo puede consultar%' then raise exception 'FALLÓ: mensaje inesperado (corporativo): %', sqlerrm; end if;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);

  v_res := sustituir_factura_manual(v_cfdi, v_manual);
  v_faltan := (v_res->>'faltan_cuentas')::boolean;
  if not v_faltan then raise exception 'FALLÓ: con dos cuentas debía avisar que faltan cuentas por concepto'; end if;
  if (select estado::text from facturas where id = v_manual) <> 'cancelada' or (select sustituido_por from facturas where id = v_manual) <> v_cfdi then raise exception 'FALLÓ: el gasto queda cancelado y ligado'; end if;
  if pagado_factura(v_cfdi) <> 10000 or (select estado::text from facturas where id = v_cfdi) <> 'parcial' then raise exception 'FALLÓ: el pago pasa al CFDI y recalcula su estado'; end if;
  if exists (select 1 from pago_aplicaciones where factura_id = v_manual) then raise exception 'FALLÓ: no deben quedar aplicaciones en el gasto'; end if;
  v_ok := array_append(v_ok, 'la sustitución pasa los pagos y cancela el gasto');

  begin
    perform sustituir_factura_manual(v_cfdi, v_manual);
    raise exception 'FALLÓ: no se sustituye dos veces';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Ese gasto sin CFDI ya está%' then raise exception 'FALLÓ: mensaje inesperado (doble): %', sqlerrm; end if;
  end;
  v_manual := registrar_gasto_manual(jsonb_build_object('proveedor_id', v_otro, 'sucursal_id', null, 'fecha', hoy_mx(), 'folio', 'Otro',
    'renglones', jsonb_build_array(jsonb_build_object('descripcion', 'X', 'importe', 10, 'cuenta_pl', 'otros')), 'subtotal', 10, 'iva', 0, 'retencion_iva', 0, 'retencion_isr', 0, 'total', 10));
  begin
    perform sustituir_factura_manual(v_cfdi, v_manual);
    raise exception 'FALLÓ: un CFDI no sustituye a otro proveedor';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'El CFDI es de otro proveedor%' then raise exception 'FALLÓ: mensaje inesperado (proveedor): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'no se sustituye dos veces ni entre proveedores');

  perform asignar_cuentas_conceptos(v_cfdi, (select jsonb_agg(jsonb_build_object('id', id, 'cuenta', case when descripcion = 'Renta' then 'renta' else 'servicios' end)) from factura_conceptos where factura_id = v_cfdi));
  if (select count(*) from factura_conceptos where factura_id = v_cfdi and cuenta_pl is not null) <> 2 then raise exception 'FALLÓ: cuentas por concepto del CFDI'; end if;
  v_ok := array_append(v_ok, 'cuentas por concepto');

  -- Gasto en Oficina con un renglón sin cuenta (proveedor sin cuenta); el CFDI llega con la sucursal por omisión del proveedor.
  update proveedores set sucursal_id = v_suc where id = v_otro;
  v_manual2 := registrar_gasto_manual(jsonb_build_object('proveedor_id', v_otro, 'sucursal_id', null, 'fecha', hoy_mx(), 'folio', 'Recibo oficina',
    'renglones', jsonb_build_array(jsonb_build_object('descripcion', 'Renta', 'importe', 100, 'cuenta_pl', 'renta'),
                                   jsonb_build_object('descripcion', 'Varios', 'importe', 50)),
    'subtotal', 150, 'iva', 0, 'retencion_iva', 0, 'retencion_isr', 0, 'total', 150));
  insert into facturas (uuid, tipo, fecha_emision, rfc_emisor, nombre_emisor, regimen_emisor, rfc_receptor, subtotal, total, proveedor_id, vence_el, xml_ruta)
  values ('PRUEBA-0026-CFDI2', 'ingreso', hoy_mx(), 'OTRO800101AB1', 'Otro Prueba', '601', (select rfc from empresa), 150, 150, v_otro, hoy_mx(), 'prueba2.xml')
  returning id into v_cfdi2;
  if (select sucursal_id from facturas where id = v_cfdi2) is distinct from v_suc then raise exception 'FALLÓ: el CFDI toma la sucursal por omisión al subirse'; end if;
  insert into factura_conceptos (factura_id, descripcion, cantidad, unidad, valor_unitario, importe) values (v_cfdi2, 'Renta y varios', 1, '', 150, 150);
  v_res := sustituir_factura_manual(v_cfdi2, v_manual2);
  if not (v_res->>'faltan_cuentas')::boolean then raise exception 'FALLÓ: un renglón sin cuenta también obliga a revisar las cuentas'; end if;
  if exists (select 1 from factura_conceptos where factura_id = v_cfdi2 and cuenta_pl is not null) then raise exception 'FALLÓ: no se copia una cuenta a medias'; end if;
  if (select sucursal_id from facturas where id = v_cfdi2) is not null then raise exception 'FALLÓ: queda la sucursal elegida en el gasto (Oficina)'; end if;
  if not (v_res->>'sucursal_cambio')::boolean then raise exception 'FALLÓ: avisa que la sucursal cambió'; end if;
  v_ok := array_append(v_ok, 'la sustitución respeta la sucursal del gasto y no inventa cuentas');

  raise exception 'PRUEBAS OK — %', array_to_string(v_ok, ' · ');
end $$;
