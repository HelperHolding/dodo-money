-- Pruebas de la migración 0028 (días de pago). Córrelas completas en Supabase → SQL Editor después de la migración.
-- Necesitan un admin activo y un usuario corporativo activo. Si no hay datos de la empresa, usa unos de prueba (se deshace).
--   · "PRUEBAS OK — …" → todo bien.   · "FALLÓ: …" → dice qué regla no se cumplió.

do $$
declare
  v_a uuid; v_c uuid; v_prov uuid; v_f1 uuid; v_f2 uuid; v_viernes date; v_otro date; v_pasado date; v_pago uuid; v_n int;
  v_ok text[] := '{}';
  ren jsonb := jsonb_build_array(jsonb_build_object('descripcion', 'Servicio', 'importe', 100, 'cuenta_pl', 'otros'));
begin
  select id into v_a from perfiles where rol::text = 'admin' and activo limit 1;
  select id into v_c from perfiles where rol::text = 'corporativo' and activo limit 1;
  if v_a is null or v_c is null then raise exception 'FALTAN DATOS: se necesitan un admin y un corporativo activos.'; end if;
  if not exists (select 1 from empresa) then insert into empresa (rfc, razon_social) values ('DMX010101AB1', 'Empresa de prueba'); end if;
  update empresa set dias_pago = '{5}';

  v_viernes := hoy_mx() + ((5 - extract(isodow from hoy_mx())::int + 7) % 7);           -- hoy si es viernes
  v_otro := case when extract(isodow from hoy_mx()) = 5 then hoy_mx() - 1 else hoy_mx() end;   -- hoy o ayer, no viernes
  v_pasado := hoy_mx() - ((extract(isodow from hoy_mx())::int - 5 + 7) % 7);           -- el viernes más reciente (hoy o antes)

  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  insert into proveedores (razon_social, rfc, regimen_fiscal) values ('Proveedor 0028', 'PRUE800101AB1', '601') returning id into v_prov;
  v_f1 := registrar_gasto_manual(jsonb_build_object('proveedor_id', v_prov, 'sucursal_id', null, 'fecha', hoy_mx(), 'folio', 'P1',
    'renglones', ren, 'subtotal', 100, 'iva', 0, 'retencion_iva', 0, 'retencion_isr', 0, 'total', 100));
  v_f2 := registrar_gasto_manual(jsonb_build_object('proveedor_id', v_prov, 'sucursal_id', null, 'fecha', hoy_mx(), 'folio', 'P2',
    'renglones', ren, 'subtotal', 100, 'iva', 0, 'retencion_iva', 0, 'retencion_isr', 0, 'total', 100));

  perform programar_pago(v_f1, v_viernes);
  if (select pago_programado_el from facturas where id = v_f1) <> v_viernes then raise exception 'FALLÓ: se programa en viernes'; end if;
  begin
    perform programar_pago(v_f1, v_viernes + 1);
    raise exception 'FALLÓ: el sábado no es día de pago';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%no es día de pago autorizado%' then raise exception 'FALLÓ: mensaje inesperado (sábado): %', sqlerrm; end if;
  end;
  begin
    perform programar_pago(v_f1, v_viernes - 7);
    raise exception 'FALLÓ: no se programa en el pasado';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'No se programa un pago en una fecha que ya pasó%' then raise exception 'FALLÓ: mensaje inesperado (pasado): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'programar solo en día autorizado y no en el pasado');

  v_n := programar_pagos(array[v_f1, v_f2], v_viernes + 7);
  if v_n <> 2 or (select count(*) from facturas where id in (v_f1, v_f2) and pago_programado_el = v_viernes + 7) <> 2 then raise exception 'FALLÓ: programar en bloque'; end if;
  v_ok := array_append(v_ok, 'programar en bloque');

  begin
    perform registrar_pago(v_prov, v_otro, 50, 'transferencia', null, 'x', null, jsonb_build_array(jsonb_build_object('factura_id', v_f1, 'monto', 50)));
    raise exception 'FALLÓ: un pago fuera de día sin motivo no pasa';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%escribe el motivo del pago%' then raise exception 'FALLÓ: mensaje inesperado (motivo): %', sqlerrm; end if;
  end;
  v_pago := registrar_pago(v_prov, v_otro, 50, 'transferencia', null, 'x', null,
    jsonb_build_array(jsonb_build_object('factura_id', v_f1, 'monto', 50)), 'El proveedor corta el servicio');
  if (select motivo_fuera_de_dia from pagos where id = v_pago) <> 'El proveedor corta el servicio' then raise exception 'FALLÓ: guarda el motivo'; end if;
  v_pago := registrar_pago(v_prov, v_pasado, 50, 'transferencia', null, 'x', null, jsonb_build_array(jsonb_build_object('factura_id', v_f2, 'monto', 50)));
  if (select motivo_fuera_de_dia from pagos where id = v_pago) is not null then raise exception 'FALLÓ: en viernes no hay motivo'; end if;
  v_ok := array_append(v_ok, 'pago fuera de día pide motivo; en viernes no');

  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  begin
    perform programar_pagos(array[v_f2], v_viernes + 14);
    raise exception 'FALLÓ: corporativo no programa';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Corporativo solo puede consultar%' then raise exception 'FALLÓ: mensaje inesperado (corporativo): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'corporativo no programa');

  raise exception 'PRUEBAS OK — %', array_to_string(v_ok, ' · ');
end $$;
