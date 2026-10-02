-- Pruebas de la migración 0017 (de dónde salió el dinero de cada gasto). Córrelas completas en Supabase → SQL Editor después de la migración.
-- Necesitan dos usuarios activos de la misma sucursal y un usuario corporativo activo. Los puestos cambian solo mientras corre el script.
-- El resultado aparece como ERROR A PROPÓSITO para que Postgres deshaga todo:
--   · "PRUEBAS OK — …" → todo bien.   · "FALLÓ: …" → dice qué regla no se cumplió.

do $$
declare
  v_a uuid; v_b uuid; v_c uuid; v_otro uuid; v_suc uuid;
  v_boveda uuid; v_chica uuid;
  v_bov0 numeric; v_chica0 numeric; v_bov1 numeric; v_chica1 numeric;
  v_g_emp uuid; v_g_chica uuid; v_cierre uuid;
  v_ok text[] := '{}';
begin
  select a.id, b.id, a.sucursal_id into v_a, v_b, v_suc
    from perfiles a join perfiles b on b.id <> a.id and b.activo and b.sucursal_id = a.sucursal_id
   where a.activo and a.sucursal_id is not null
   limit 1;
  if v_a is null then raise exception 'FALTAN DATOS: se necesitan dos usuarios activos de la misma sucursal.'; end if;
  select id into v_c from perfiles where rol::text = 'corporativo' and activo limit 1;
  if v_c is null then raise exception 'FALTAN DATOS: se necesita un usuario corporativo activo.'; end if;
  select id into v_otro from perfiles where activo and sucursal_id is not null and sucursal_id <> v_suc limit 1;

  select id into v_boveda from cajas where sucursal_id = v_suc and tipo = 'boveda';
  select id into v_chica from cajas where sucursal_id = v_suc and tipo = 'caja_chica';
  if v_boveda is null or v_chica is null then raise exception 'FALTAN DATOS: la sucursal % no tiene bóveda y caja chica.', v_suc; end if;

  -- Los gastos viejos quedaron como caja chica.
  if exists (select 1 from gastos_caja_chica where origen is null) then raise exception 'FALLÓ: hay gastos sin origen'; end if;
  v_ok := array_append(v_ok, 'los gastos viejos son de caja chica');

  select saldo into v_bov0 from saldos_cajas where caja_id = v_boveda;
  select saldo into v_chica0 from saldos_cajas where caja_id = v_chica;

  -- Cada origen baja solo su caja; el del empleado no baja ninguna.
  insert into gastos_caja_chica (sucursal_id, fecha, concepto, monto, comprobante, registrado_por, origen)
  values (v_suc, current_date, 'Prueba caja chica', 100, 'nota', v_a, 'caja_chica') returning id into v_g_chica;
  insert into gastos_caja_chica (sucursal_id, fecha, concepto, monto, comprobante, registrado_por, origen)
  values (v_suc, current_date, 'Prueba bóveda', 40, 'nota', v_a, 'boveda');
  insert into gastos_caja_chica (sucursal_id, fecha, concepto, monto, comprobante, registrado_por, origen, pagado_por)
  values (v_suc, current_date, 'Prueba empleado', 7, 'nota', v_a, 'empleado', v_b) returning id into v_g_emp;
  select saldo into v_bov1 from saldos_cajas where caja_id = v_boveda;
  select saldo into v_chica1 from saldos_cajas where caja_id = v_chica;
  if v_chica1 <> v_chica0 - 100 then raise exception 'FALLÓ: la caja chica debe bajar solo su gasto (antes %, después %)', v_chica0, v_chica1; end if;
  if v_bov1 <> v_bov0 - 40 then raise exception 'FALLÓ: la bóveda debe bajar solo su gasto (antes %, después %)', v_bov0, v_bov1; end if;
  v_ok := array_append(v_ok, 'cada origen baja solo su caja');

  -- Pagado por empleado: exige a la persona, y que sea de la sucursal.
  begin
    insert into gastos_caja_chica (sucursal_id, fecha, concepto, monto, comprobante, registrado_por, origen)
    values (v_suc, current_date, 'Sin quién', 7, 'nota', v_a, 'empleado');
    raise exception 'FALLÓ: un gasto de empleado sin la persona no debe guardarse';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%gasto_empleado_dice_quien%' then raise exception 'FALLÓ: mensaje inesperado (sin quién): %', sqlerrm; end if;
  end;
  begin
    insert into gastos_caja_chica (sucursal_id, fecha, concepto, monto, comprobante, registrado_por, origen, pagado_por)
    values (v_suc, current_date, 'Caja chica con persona', 7, 'nota', v_a, 'caja_chica', v_b);
    raise exception 'FALLÓ: un gasto de caja chica no lleva quién pagó';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%gasto_empleado_dice_quien%' then raise exception 'FALLÓ: mensaje inesperado (caja chica con persona): %', sqlerrm; end if;
  end;
  if v_otro is not null then
    begin
      insert into gastos_caja_chica (sucursal_id, fecha, concepto, monto, comprobante, registrado_por, origen, pagado_por)
      values (v_suc, current_date, 'De otra sucursal', 7, 'nota', v_a, 'empleado', v_otro);
      raise exception 'FALLÓ: quien pagó debe ser de la misma sucursal';
    exception when others then
      if sqlerrm like 'FALLÓ%' then raise; end if;
      if sqlerrm not like 'Quien pagó el gasto%' then raise exception 'FALLÓ: mensaje inesperado (otra sucursal): %', sqlerrm; end if;
    end;
    v_ok := array_append(v_ok, 'el empleado es de la sucursal');
  end if;
  v_ok := array_append(v_ok, 'el gasto de empleado dice quién');

  -- La sucursal no puede registrar un gasto ya repuesto (política de inserción).
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into gastos_caja_chica (sucursal_id, fecha, concepto, monto, comprobante, registrado_por, origen, pagado_por, repuesto_por, repuesto_en)
    values (v_suc, current_date, 'Ya repuesto', 7, 'nota', v_a, 'empleado', v_a, v_a, now());
    reset role;
    raise exception 'FALLÓ: la sucursal no debe poder registrar un gasto ya repuesto';
  exception when others then
    reset role;
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%row-level security%' then raise exception 'FALLÓ: mensaje inesperado (política): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'no nace repuesto');

  -- Marcar repuesto: ni encargado ni corporativo; el gerente sí, una sola vez; solo gastos de empleado.
  update perfiles set rol = 'encargado' where id = v_b;
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  begin
    perform marcar_repuesto(v_g_emp);
    raise exception 'FALLÓ: el encargado no debe marcar repuestos';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Solo el gerente o el admin%' then raise exception 'FALLÓ: mensaje inesperado (encargado): %', sqlerrm; end if;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  begin
    perform marcar_repuesto(v_g_emp);
    raise exception 'FALLÓ: corporativo no debe marcar repuestos';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Corporativo solo puede consultar%' then raise exception 'FALLÓ: mensaje inesperado (corporativo): %', sqlerrm; end if;
  end;
  update perfiles set rol = 'gerente' where id = v_b;
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  begin
    perform marcar_repuesto(v_g_chica);
    raise exception 'FALLÓ: un gasto de caja chica no se marca repuesto';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Solo los gastos que pagó un empleado%' then raise exception 'FALLÓ: mensaje inesperado (caja chica): %', sqlerrm; end if;
  end;
  perform marcar_repuesto(v_g_emp);
  if (select repuesto_por from gastos_caja_chica where id = v_g_emp) <> v_b
     or (select repuesto_en from gastos_caja_chica where id = v_g_emp) is null then
    raise exception 'FALLÓ: el gerente debe poder marcar el gasto como repuesto';
  end if;
  begin
    perform marcar_repuesto(v_g_emp);
    raise exception 'FALLÓ: un gasto no se marca repuesto dos veces';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%ya estaba repuesto%' then raise exception 'FALLÓ: mensaje inesperado (dos veces): %', sqlerrm; end if;
  end;
  if (select saldo from saldos_cajas where caja_id = v_chica) <> v_chica1 or (select saldo from saldos_cajas where caja_id = v_boveda) <> v_bov1 then
    raise exception 'FALLÓ: marcar repuesto no debe mover ninguna caja';
  end if;
  v_ok := array_append(v_ok, 'solo gerente o admin marcan repuesto, una vez');

  -- Cierre: la bóveda esperada descuenta los gastos de bóveda.
  insert into cierres_dia (sucursal_id, fecha, boveda_inicial, retiros_dia, aperturas_dia, deposito_dia, gastos_boveda_dia, boveda_contado, cerrado_por)
  values (v_suc, date '1999-01-01', 1000, 500, 200, 300, 40, 960, v_b) returning id into v_cierre;
  if (select boveda_esperado from cierres_dia where id = v_cierre) <> 960
     or (select boveda_diferencia from cierres_dia where id = v_cierre) <> 0 then
    raise exception 'FALLÓ: la bóveda esperada debe ser 1000 + 500 − 200 − 300 − 40 = 960';
  end if;
  v_ok := array_append(v_ok, 'el cierre descuenta los gastos de bóveda');

  raise exception 'PRUEBAS OK — %', array_to_string(v_ok, ' · ');
end $$;
