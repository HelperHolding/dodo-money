-- Pruebas de la migración 0016 (salida de sucursal → en corporativo). Córrelas completas en Supabase → SQL Editor después de la migración.
-- Necesitan dos usuarios activos de la misma sucursal y un usuario corporativo activo. Los puestos cambian solo mientras corre el script.
-- El resultado aparece como ERROR A PROPÓSITO para que Postgres deshaga todo:
--   · "PRUEBAS OK — …" → todo bien.   · "FALLÓ: …" → dice qué regla no se cumplió.

do $$
declare
  v_a uuid; v_b uuid; v_c uuid; v_suc uuid;
  v_boveda uuid; v_corpo uuid; v_chica uuid; v_mov uuid; v_mov2 uuid; v_mov3 uuid; v_repo uuid;
  v_saldo_antes numeric; v_saldo_despues numeric;
  v_ok text[] := '{}';
begin
  select a.id, b.id, a.sucursal_id into v_a, v_b, v_suc
    from perfiles a join perfiles b on b.id <> a.id and b.activo and b.sucursal_id = a.sucursal_id
   where a.activo and a.sucursal_id is not null
   limit 1;
  if v_a is null then raise exception 'FALTAN DATOS: se necesitan dos usuarios activos de la misma sucursal.'; end if;
  select id into v_c from perfiles where rol::text = 'corporativo' and activo limit 1;
  if v_c is null then raise exception 'FALTAN DATOS: se necesita un usuario corporativo activo.'; end if;

  select id into v_boveda from cajas where sucursal_id = v_suc and tipo = 'boveda';
  select id into v_chica from cajas where sucursal_id = v_suc and tipo = 'caja_chica';
  if v_boveda is null or v_chica is null then raise exception 'FALTAN DATOS: la sucursal % no tiene bóveda y caja chica.', v_suc; end if;
  select id into v_corpo from cajas where sucursal_id = v_suc and tipo = 'corporativo';
  if v_corpo is null then
    insert into cajas (sucursal_id, tipo, nombre) values (v_suc, 'corporativo', 'Corporativo') returning id into v_corpo;
  end if;

  -- Una salida no puede nacer ya recibida.
  begin
    insert into movimientos (sucursal_id, tipo, caja_origen_id, caja_destino_id, monto, folio, registrado_por, recepcion)
    values (v_suc, 'salida_corporativo', v_boveda, v_corpo, 100, 'R-1', v_a, 'aceptada');
    raise exception 'FALLÓ: una salida por recoger no puede estar recibida';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%recepcion_solo_salidas%' then raise exception 'FALLÓ: mensaje inesperado (nace recibida): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'no nace recibida');

  insert into movimientos (sucursal_id, tipo, caja_origen_id, caja_destino_id, monto, folio, registrado_por)
  values (v_suc, 'salida_corporativo', v_boveda, v_corpo, 100, 'R-1', v_a) returning id into v_mov;
  select saldo into v_saldo_antes from saldos_cajas where caja_id = v_boveda;

  -- Corporativo no recibe lo que nadie ha recogido.
  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  begin
    perform recibir_en_corporativo(v_mov, true, null);
    raise exception 'FALLÓ: corporativo no debe recibir una salida por recoger';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%todavía no la recoge%' then raise exception 'FALLÓ: mensaje inesperado (por recoger): %', sqlerrm; end if;
  end;
  -- Ni la recoge él.
  begin
    perform confirmar_movimiento(v_mov, true);
    raise exception 'FALLÓ: corporativo no debe recoger salidas';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Corporativo solo puede consultar%' then raise exception 'FALLÓ: mensaje inesperado (corporativo recoge): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'corporativo espera a que el admin recoja');

  -- El gerente ya no la confirma.
  update perfiles set rol = 'gerente' where id = v_b;
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  begin
    perform confirmar_movimiento(v_mov, true);
    raise exception 'FALLÓ: el gerente ya no debe confirmar salidas a corporativo';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Solo un admin recoge%' then raise exception 'FALLÓ: mensaje inesperado (gerente): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'el gerente ya no confirma salidas');

  -- La reposición de caja chica la sigue confirmando el gerente, y no se recibe en corporativo.
  insert into movimientos (sucursal_id, tipo, caja_origen_id, caja_destino_id, monto, registrado_por)
  values (v_suc, 'reposicion_caja_chica', v_corpo, v_chica, 50, v_a) returning id into v_repo;
  perform confirmar_movimiento(v_repo, true);
  if (select estado::text from movimientos where id = v_repo) <> 'confirmado' then
    raise exception 'FALLÓ: el gerente debe seguir confirmando reposiciones';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  begin
    perform recibir_en_corporativo(v_repo, true, null);
    raise exception 'FALLÓ: una reposición no se recibe en corporativo';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Solo las salidas%' then raise exception 'FALLÓ: mensaje inesperado (reposición): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'reposiciones sin cambio');

  -- El admin la recoge: queda en camino y la bóveda baja.
  update perfiles set rol = 'admin' where id = v_b;
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  perform confirmar_movimiento(v_mov, true);
  if (select estado::text from movimientos where id = v_mov) <> 'confirmado'
     or (select confirmado_por from movimientos where id = v_mov) <> v_b
     or (select recepcion from movimientos where id = v_mov) is not null then
    raise exception 'FALLÓ: al recogerla el admin, la salida debe quedar en camino a su cargo';
  end if;
  select saldo into v_saldo_despues from saldos_cajas where caja_id = v_boveda;
  if v_saldo_despues <> v_saldo_antes - 100 then
    raise exception 'FALLÓ: la bóveda debe bajar al recoger (antes %, después %)', v_saldo_antes, v_saldo_despues;
  end if;
  v_ok := array_append(v_ok, 'el admin recoge y la bóveda baja');

  -- El admin no la recibe en corporativo.
  begin
    perform recibir_en_corporativo(v_mov, true, null);
    raise exception 'FALLÓ: el admin no debe recibir en corporativo';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Solo corporativo recibe%' then raise exception 'FALLÓ: mensaje inesperado (admin recibe): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'solo corporativo recibe');

  -- Corporativo: rechazar pide motivo; aceptar deja la salida en corporativo; no se recibe dos veces.
  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  begin
    perform recibir_en_corporativo(v_mov, false, '   ');
    raise exception 'FALLÓ: rechazar sin motivo no debe pasar';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Escribe el motivo%' then raise exception 'FALLÓ: mensaje inesperado (sin motivo): %', sqlerrm; end if;
  end;
  perform recibir_en_corporativo(v_mov, true, null);
  if (select recepcion from movimientos where id = v_mov) <> 'aceptada'
     or (select recibido_por from movimientos where id = v_mov) <> v_c
     or (select recibido_en from movimientos where id = v_mov) is null then
    raise exception 'FALLÓ: al aceptar, la salida debe quedar en corporativo con quién y cuándo';
  end if;
  begin
    perform recibir_en_corporativo(v_mov, false, 'Otra vez');
    raise exception 'FALLÓ: una salida no se recibe dos veces';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%ya se recibió%' then raise exception 'FALLÓ: mensaje inesperado (dos veces): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'corporativo acepta una sola vez');

  -- Otra salida: corporativo la rechaza con motivo.
  insert into movimientos (sucursal_id, tipo, caja_origen_id, caja_destino_id, monto, folio, registrado_por)
  values (v_suc, 'salida_corporativo', v_boveda, v_corpo, 300, 'R-2', v_a) returning id into v_mov2;
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  perform confirmar_movimiento(v_mov2, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  perform recibir_en_corporativo(v_mov2, false, '  Faltan $200  ');
  if (select recepcion from movimientos where id = v_mov2) <> 'rechazada'
     or (select nota_recepcion from movimientos where id = v_mov2) <> 'Faltan $200' then
    raise exception 'FALLÓ: el rechazo debe guardar el motivo';
  end if;
  v_ok := array_append(v_ok, 'corporativo rechaza con motivo');

  -- Una salida que el admin rechazó en la sucursal no se recibe.
  insert into movimientos (sucursal_id, tipo, caja_origen_id, caja_destino_id, monto, folio, registrado_por)
  values (v_suc, 'salida_corporativo', v_boveda, v_corpo, 80, 'R-3', v_a) returning id into v_mov3;
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  perform confirmar_movimiento(v_mov3, false);
  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  begin
    perform recibir_en_corporativo(v_mov3, true, null);
    raise exception 'FALLÓ: una salida rechazada en la sucursal no se recibe';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%se rechazó en la sucursal%' then raise exception 'FALLÓ: mensaje inesperado (rechazada): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'lo rechazado en sucursal no se recibe');

  -- La sucursal no puede registrar una salida ya recibida (política de inserción).
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into movimientos (sucursal_id, tipo, caja_origen_id, caja_destino_id, monto, folio, registrado_por, recibido_por)
    values (v_suc, 'salida_corporativo', v_boveda, v_corpo, 100, 'R-4', v_a, v_c);
    reset role;
    raise exception 'FALLÓ: la sucursal no debe poder adelantar quién recibió';
  exception when others then
    reset role;
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%row-level security%' then raise exception 'FALLÓ: mensaje inesperado (política): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'la sucursal no adelanta la recepción');

  raise exception 'PRUEBAS OK — %', array_to_string(v_ok, ' · ');
end $$;
