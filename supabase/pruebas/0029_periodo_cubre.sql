-- Pruebas de la migración 0029 (periodo que cubre cada factura). Córrelas completas en Supabase → SQL Editor justo después de la migración.
-- Necesitan un admin activo y un usuario corporativo activo. Si no hay datos de la empresa, usa unos de prueba (se deshace).
--   · "PRUEBAS OK — …" → todo bien.   · "FALLÓ: …" → dice qué regla no se cumplió.

do $$
declare
  v_a uuid; v_c uuid; v_prov uuid; v_f uuid; v_ing uuid; v_nota uuid; v_m uuid; v_sus uuid; v_nota2 uuid; v_p record; v_rfc text;
  v_ok text[] := '{}';
  ren jsonb := jsonb_build_array(jsonb_build_object('descripcion', 'Luz', 'importe', 100, 'cuenta_pl', 'servicios'));
begin
  select id into v_a from perfiles where rol::text = 'admin' and activo limit 1;
  select id into v_c from perfiles where rol::text = 'corporativo' and activo limit 1;
  if v_a is null or v_c is null then raise exception 'FALTAN DATOS: se necesitan un admin y un corporativo activos.'; end if;
  if not exists (select 1 from empresa) then insert into empresa (rfc, razon_social) values ('DMX010101AB1', 'Empresa de prueba'); end if;
  select rfc into v_rfc from empresa;

  if exists (select 1 from facturas where cubre_desde <> date_trunc('month', fecha_emision)::date
                                       or cubre_hasta <> (date_trunc('month', fecha_emision) + interval '1 month - 1 day')::date) then
    raise exception 'FALLÓ: las facturas existentes quedan en su mes de emisión';
  end if;

  select * into v_p from periodo_cubre('2026-10-05', 2, 'anteriores');
  if v_p.desde <> '2026-08-01' or v_p.hasta <> '2026-09-30' then raise exception 'FALLÓ: anteriores (CFE): % a %', v_p.desde, v_p.hasta; end if;
  select * into v_p from periodo_cubre('2026-10-03', 3, 'emision');
  if v_p.desde <> '2026-10-01' or v_p.hasta <> '2026-12-31' then raise exception 'FALLÓ: desde la emisión: % a %', v_p.desde, v_p.hasta; end if;
  select * into v_p from periodo_cubre('2026-09-28', 1, 'siguiente');
  if v_p.desde <> '2026-10-01' or v_p.hasta <> '2026-10-31' then raise exception 'FALLÓ: mes siguiente: % a %', v_p.desde, v_p.hasta; end if;
  select * into v_p from periodo_cubre('2026-01-15', 2, 'anteriores');
  if v_p.desde <> '2025-11-01' or v_p.hasta <> '2025-12-31' then raise exception 'FALLÓ: anteriores en enero: % a %', v_p.desde, v_p.hasta; end if;
  select * into v_p from periodo_cubre('2026-12-10', 1, 'siguiente');
  if v_p.desde <> '2027-01-01' or v_p.hasta <> '2027-01-31' then raise exception 'FALLÓ: siguiente en diciembre: % a %', v_p.desde, v_p.hasta; end if;
  v_ok := array_append(v_ok, 'existentes en su mes; periodo_cubre con cada regla y cambio de año');

  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  insert into proveedores (razon_social, rfc, regimen_fiscal, cubre_meses, cubre_inicio)
  values ('Proveedor 0029', 'PRUE800101AB2', '601', 2, 'anteriores') returning id into v_prov;
  v_f := registrar_gasto_manual(jsonb_build_object('proveedor_id', v_prov, 'sucursal_id', null, 'fecha', hoy_mx(), 'folio', 'CFE-1',
    'renglones', ren, 'subtotal', 100, 'iva', 0, 'retencion_iva', 0, 'retencion_isr', 0, 'total', 100));
  select * into v_p from periodo_cubre(hoy_mx(), 2, 'anteriores');
  if (select cubre_desde from facturas where id = v_f) <> v_p.desde or (select cubre_hasta from facturas where id = v_f) <> v_p.hasta then
    raise exception 'FALLÓ: el gasto toma la regla del proveedor';
  end if;
  v_ok := array_append(v_ok, 'alta con la regla del proveedor');

  insert into facturas (origen, uuid, tipo, fecha_emision, rfc_emisor, nombre_emisor, regimen_emisor, rfc_receptor, subtotal, total, proveedor_id, vence_el, xml_ruta)
  values ('cfdi', 'PRUEBA-0029-ING', 'ingreso', hoy_mx(), 'PRUE800101AB2', 'Proveedor 0029', '601', v_rfc, 100, 100, v_prov, hoy_mx(), 'prueba-0029.xml')
  returning id into v_ing;
  perform cambiar_periodo_factura(v_ing, '2026-01-15', '2026-03-10');
  if (select cubre_desde from facturas where id = v_ing) <> '2026-01-01' or (select cubre_hasta from facturas where id = v_ing) <> '2026-03-31' then
    raise exception 'FALLÓ: cambiar el periodo lo deja en meses completos';
  end if;
  insert into facturas (origen, uuid, tipo, fecha_emision, rfc_emisor, nombre_emisor, regimen_emisor, rfc_receptor, subtotal, total, proveedor_id, vence_el, xml_ruta, uuid_relacionado)
  values ('cfdi', 'PRUEBA-0029-EGR', 'egreso', hoy_mx(), 'PRUE800101AB2', 'Proveedor 0029', '601', v_rfc, 10, 10, v_prov, hoy_mx(), 'prueba-0029-nc.xml', 'PRUEBA-0029-ING')
  returning id into v_nota;
  if (select cubre_desde from facturas where id = v_nota) <> '2026-01-01' or (select cubre_hasta from facturas where id = v_nota) <> '2026-03-31' then
    raise exception 'FALLÓ: la nota de crédito cubre lo mismo que su factura';
  end if;
  perform cambiar_periodo_factura(v_ing, '2026-04-01', '2026-04-30');
  if (select cubre_desde from facturas where id = v_nota) <> '2026-04-01' then raise exception 'FALLÓ: la nota sigue el periodo de su factura'; end if;
  v_ok := array_append(v_ok, 'cambiar periodo: meses completos y la nota de crédito lo sigue');

  begin
    perform cambiar_periodo_factura(v_ing, '2026-05-01', '2026-04-01');
    raise exception 'FALLÓ: un periodo al revés no pasa';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm <> 'El periodo no puede terminar antes de empezar.' then raise exception 'FALLÓ: mensaje inesperado (al revés): %', sqlerrm; end if;
  end;
  begin
    perform cambiar_periodo_factura(v_ing, '2026-01-01', '2028-01-01');
    raise exception 'FALLÓ: más de 24 meses no pasa';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm <> 'El periodo es de hasta 24 meses.' then raise exception 'FALLÓ: mensaje inesperado (24 meses): %', sqlerrm; end if;
  end;
  perform cancelar_factura(v_f, 'Prueba 0029');
  begin
    perform cambiar_periodo_factura(v_f, '2026-01-01', '2026-01-31');
    raise exception 'FALLÓ: una cancelada no cambia de periodo';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm <> 'Factura no encontrada o cancelada' then raise exception 'FALLÓ: mensaje inesperado (cancelada): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'rechaza al revés, más de 24 meses y canceladas');

  -- El CFDI que sustituye a un gasto sin CFDI toma el periodo del gasto.
  v_m := registrar_gasto_manual(jsonb_build_object('proveedor_id', v_prov, 'sucursal_id', null, 'fecha', hoy_mx(), 'folio', 'RENTA-OCT',
    'renglones', ren, 'subtotal', 100, 'iva', 0, 'retencion_iva', 0, 'retencion_isr', 0, 'total', 100));
  perform cambiar_periodo_factura(v_m, '2026-10-01', '2026-10-31');
  insert into facturas (origen, uuid, tipo, fecha_emision, rfc_emisor, nombre_emisor, regimen_emisor, rfc_receptor, subtotal, total, proveedor_id, vence_el, xml_ruta)
  values ('cfdi', 'PRUEBA-0029-SUS', 'ingreso', '2026-09-28', 'PRUE800101AB2', 'Proveedor 0029', '601', v_rfc, 100, 100, v_prov, hoy_mx(), 'prueba-0029-sus.xml')
  returning id into v_sus;
  perform sustituir_factura_manual(v_sus, v_m);
  if (select cubre_desde from facturas where id = v_sus) <> '2026-10-01' or (select cubre_hasta from facturas where id = v_sus) <> '2026-10-31' then
    raise exception 'FALLÓ: el CFDI que sustituye toma el periodo del gasto sin CFDI';
  end if;
  v_ok := array_append(v_ok, 'el CFDI que sustituye toma el periodo del gasto');

  -- Nota de crédito subida antes que su factura: al llegar la factura, la nota toma su periodo.
  insert into facturas (origen, uuid, tipo, fecha_emision, rfc_emisor, nombre_emisor, regimen_emisor, rfc_receptor, subtotal, total, proveedor_id, vence_el, xml_ruta, uuid_relacionado)
  values ('cfdi', 'PRUEBA-0029-EGR2', 'egreso', '2026-11-03', 'PRUE800101AB2', 'Proveedor 0029', '601', v_rfc, 10, 10, v_prov, '2026-11-03', 'prueba-0029-nc2.xml', 'PRUEBA-0029-ING2')
  returning id into v_nota2;
  if (select cubre_desde from facturas where id = v_nota2) <> '2026-09-01' then raise exception 'FALLÓ: la nota sin factura usa la regla del proveedor'; end if;
  insert into facturas (origen, uuid, tipo, fecha_emision, rfc_emisor, nombre_emisor, regimen_emisor, rfc_receptor, subtotal, total, proveedor_id, vence_el, xml_ruta)
  values ('cfdi', 'PRUEBA-0029-ING2', 'ingreso', '2026-10-05', 'PRUE800101AB2', 'Proveedor 0029', '601', v_rfc, 100, 100, v_prov, '2026-10-05', 'prueba-0029-ing2.xml');
  if (select cubre_desde from facturas where id = v_nota2) <> '2026-08-01' or (select cubre_hasta from facturas where id = v_nota2) <> '2026-09-30' then
    raise exception 'FALLÓ: la nota subida antes toma el periodo de su factura al llegar';
  end if;
  v_ok := array_append(v_ok, 'nota subida antes que su factura se alinea al llegar la factura');

  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  begin
    perform cambiar_periodo_factura(v_ing, '2026-01-01', '2026-01-31');
    raise exception 'FALLÓ: corporativo no cambia periodos';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Corporativo solo puede consultar%' then raise exception 'FALLÓ: mensaje inesperado (corporativo): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'corporativo no cambia periodos');

  raise exception 'PRUEBAS OK — %', array_to_string(v_ok, ' · ');
end $$;
