-- Pruebas de la migración 0025 (P&L fase 1). Córrelas completas en Supabase → SQL Editor después de la migración.
-- Necesitan dos usuarios activos de la misma sucursal y un usuario corporativo activo.
-- El resultado aparece como ERROR A PROPÓSITO para que Postgres deshaga todo:
--   · "PRUEBAS OK — …" → todo bien.   · "FALLÓ: …" → dice qué regla no se cumplió.

do $$
declare
  v_a uuid; v_b uuid; v_c uuid; v_suc uuid; v_prov uuid; v_fac uuid; v_n int;
  v_ok text[] := '{}';
begin
  select a.id, b.id, a.sucursal_id into v_a, v_b, v_suc
    from perfiles a join perfiles b on b.id <> a.id and b.activo and b.sucursal_id = a.sucursal_id
   where a.activo and a.sucursal_id is not null limit 1;
  if v_a is null then raise exception 'FALTAN DATOS: se necesitan dos usuarios activos de la misma sucursal.'; end if;
  select id into v_c from perfiles where rol::text = 'corporativo' and activo limit 1;
  if v_c is null then raise exception 'FALTAN DATOS: se necesita un usuario corporativo activo.'; end if;

  -- Precargas.
  if (select valor from pl_parametros where clave = 'rappi_pct' and vigente_desde = '2027-01-01') <> 0.18 then raise exception 'FALLÓ: Rappi 18 % desde 2027'; end if;
  if not exists (select 1 from nomina_plantilla where sucursal_id = v_suc and puesto = 'Gerente') then raise exception 'FALLÓ: plantilla precargada'; end if;
  if (select count(*) from pl_metas where sucursal_id = v_suc) <> 15 then raise exception 'FALLÓ: 15 metas por sucursal'; end if;
  v_ok := array_append(v_ok, 'parámetros, plantilla y metas precargados');

  -- La factura hereda la cuenta del proveedor.
  insert into proveedores (razon_social, rfc, regimen_fiscal, cuenta_pl) values ('Prueba PL', 'PPL010203AB1', '601', 'servicios') returning id into v_prov;
  insert into facturas (uuid, tipo, fecha_emision, rfc_emisor, nombre_emisor, regimen_emisor, rfc_receptor, subtotal, total, proveedor_id, vence_el, xml_ruta)
  values ('11111111-2222-3333-4444-555555555555', 'ingreso', current_date, 'PPL010203AB1', 'Prueba PL', '601', 'XAXX010101000', 100, 116, v_prov, current_date, 'prueba.xml')
  returning id into v_fac;
  if (select cuenta_pl from facturas where id = v_fac) <> 'servicios' then raise exception 'FALLÓ: la factura hereda la cuenta'; end if;
  if (select cuenta_pl from facturas_saldo where id = v_fac) is distinct from 'servicios' then raise exception 'FALLÓ: facturas_saldo debe traer la cuenta'; end if;
  v_ok := array_append(v_ok, 'la factura hereda la cuenta del proveedor');

  -- Gerente no ve; corporativo ve y no escribe; admin escribe.
  update perfiles set rol = 'gerente' where id = v_a;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_n from nomina_plantilla;
  reset role;
  if v_n <> 0 then raise exception 'FALLÓ: el gerente no debe ver la nómina'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_n from pl_metas;
  begin
    insert into gastos_mes (sucursal_id, mes, cuenta, monto, concepto) values (v_suc, date '2026-10-01', 'renta', 1, 'x');
    reset role;
    raise exception 'FALLÓ: corporativo no debe capturar';
  exception when others then
    reset role;
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%row-level security%' then raise exception 'FALLÓ: mensaje inesperado (corporativo): %', sqlerrm; end if;
  end;
  if v_n = 0 then raise exception 'FALLÓ: corporativo debe ver las metas'; end if;

  update perfiles set rol = 'admin' where id = v_a;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into gastos_mes (sucursal_id, mes, cuenta, monto, concepto) values (v_suc, date '2026-10-01', 'renta', 30000, 'Renta sin CFDI');
  insert into nomina_ajustes (sucursal_id, mes, renglon, monto, concepto) values (v_suc, date '2026-10-01', 'cocina', 1500, 'Bono');
  reset role;
  v_ok := array_append(v_ok, 'admin captura, corporativo solo ve, gerente no ve');

  -- Reglas de captura.
  begin
    insert into gastos_mes (sucursal_id, mes, cuenta, monto, concepto) values (v_suc, date '2026-10-15', 'renta', 1, 'x');
    raise exception 'FALLÓ: el mes es el día 1';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%check constraint%' then raise exception 'FALLÓ: mensaje inesperado (mes): %', sqlerrm; end if;
  end;
  begin
    insert into gastos_mes (sucursal_id, mes, cuenta, monto, concepto) values (v_suc, date '2026-10-01', 'insumos', 1, 'x');
    raise exception 'FALLÓ: insumos no es cuenta de gasto del mes';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%check constraint%' then raise exception 'FALLÓ: mensaje inesperado (cuenta): %', sqlerrm; end if;
  end;
  begin
    insert into pl_parametros (clave, valor, vigente_desde) values ('rappi_pct', 1.5, '2027-02-01');
    raise exception 'FALLÓ: un porcentaje va de 0 a 1';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%check constraint%' then raise exception 'FALLÓ: mensaje inesperado (pct): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'mes el día 1, cuentas y porcentajes válidos');

  -- Cambiar la cuenta de una factura: solo admin.
  perform asignar_cuenta_factura(v_fac, 'mantenimiento');
  if (select cuenta_pl from facturas where id = v_fac) <> 'mantenimiento' then raise exception 'FALLÓ: el admin cambia la cuenta'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  begin
    perform asignar_cuenta_factura(v_fac, 'renta');
    raise exception 'FALLÓ: corporativo no cambia la cuenta';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Corporativo solo puede consultar%' then raise exception 'FALLÓ: mensaje inesperado: %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'solo el admin cambia la cuenta de una factura');

  raise exception 'PRUEBAS OK — %', array_to_string(v_ok, ' · ');
end $$;
