-- Pruebas de la migración 0004 (usuario corporativo). Córrelas completas en Supabase → SQL Editor.
-- Necesitan al menos dos usuarios activos con sucursal. Un usuario se vuelve corporativo solo mientras corre el script.
-- El resultado aparece como ERROR A PROPÓSITO para que Postgres deshaga todo:
--   · "PRUEBAS OK — …" → todo bien.   · "FALLÓ: …" → dice qué regla no se cumplió.

do $$
declare
  v_corpo uuid; v_otro uuid; v_suc_a uuid; v_suc_b uuid;
  v_boveda uuid; v_venta uuid; v_boveda_b uuid; v_venta_b uuid;
  v_turno uuid; v_mov uuid; v_arqueo uuid; v_prod uuid; v_check uuid; v_hora int;
  v_n int; v_ok text[] := '{}';
begin
  select p.id, o.id, o.sucursal_id into v_corpo, v_otro, v_suc_a
    from perfiles p join perfiles o on o.id <> p.id and o.activo and o.sucursal_id is not null
   where p.activo and p.sucursal_id is not null
   limit 1;
  if v_corpo is null then raise exception 'FALTAN DATOS: se necesitan dos usuarios activos con sucursal.'; end if;

  -- Segunda sucursal: la que exista o una temporal.
  select id into v_suc_b from sucursales where id <> v_suc_a limit 1;
  if v_suc_b is null then
    insert into sucursales (nombre) values ('Prueba corporativo') returning id into v_suc_b;
  end if;

  -- Datos de prueba en las dos sucursales (como dueño de las tablas, sin RLS).
  insert into turnos (sucursal_id, fecha, tipo, encargado_id) values (v_suc_a, '2000-01-01', 'matutino', v_otro) returning id into v_turno;
  insert into turnos (sucursal_id, fecha, tipo, encargado_id) values (v_suc_b, '2000-01-01', 'matutino', v_otro);
  select id into v_boveda from cajas where sucursal_id = v_suc_a and tipo = 'boveda';
  select id into v_venta from cajas where sucursal_id = v_suc_a and tipo = 'venta';
  if v_boveda is null or v_venta is null then raise exception 'FALTAN DATOS: la sucursal % no tiene cajas de bóveda y venta.', v_suc_a; end if;
  insert into movimientos (sucursal_id, tipo, caja_origen_id, caja_destino_id, monto, registrado_por)
  values (v_suc_a, 'apertura', v_boveda, v_venta, 100, v_otro) returning id into v_mov;
  insert into arqueos (turno_id, momento, total_contado, entrega_id) values (v_turno, 'inicio', 0, v_otro) returning id into v_arqueo;
  -- Cajas y un movimiento también en la sucursal B, para comprobar la lectura de las dos.
  select id into v_boveda_b from cajas where sucursal_id = v_suc_b and tipo = 'boveda';
  if v_boveda_b is null then insert into cajas (sucursal_id, tipo, nombre) values (v_suc_b, 'boveda', 'Bóveda') returning id into v_boveda_b; end if;
  select id into v_venta_b from cajas where sucursal_id = v_suc_b and tipo = 'venta';
  if v_venta_b is null then insert into cajas (sucursal_id, tipo, nombre) values (v_suc_b, 'venta', 'Caja de venta') returning id into v_venta_b; end if;
  insert into movimientos (sucursal_id, tipo, caja_origen_id, caja_destino_id, monto, registrado_por)
  values (v_suc_b, 'apertura', v_boveda_b, v_venta_b, 100, v_otro);
  select id into v_prod from productos_merma where activo limit 1;
  select id into v_check from checklists limit 1;
  if v_prod is null or v_check is null then raise exception 'FALTAN DATOS: corre seed_checklists.sql.'; end if;

  -- La regla de datos: corporativo sin sucursal, los demás con sucursal.
  begin
    update perfiles set rol = 'corporativo' where id = v_corpo;
    raise exception 'FALLÓ: un corporativo no debe tener sucursal';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%perfiles_corporativo_sin_sucursal%' then raise exception 'FALLÓ: mensaje inesperado (corporativo con sucursal): %', sqlerrm; end if;
  end;
  begin
    update perfiles set sucursal_id = null where id = v_otro;
    raise exception 'FALLÓ: un usuario de sucursal no debe quedar sin sucursal';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%perfiles_corporativo_sin_sucursal%' then raise exception 'FALLÓ: mensaje inesperado (sin sucursal): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'corporativo sin sucursal y los demás con sucursal');

  update perfiles set rol = 'corporativo', sucursal_id = null where id = v_corpo;

  -- ── Como corporativo ───────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_corpo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(distinct sucursal_id) into v_n from turnos where fecha = '2000-01-01';
  if v_n <> 2 then raise exception 'FALLÓ: corporativo debe leer turnos de dos sucursales (leyó %)', v_n; end if;
  select count(*) into v_n from sucursales where id in (v_suc_a, v_suc_b);
  if v_n <> 2 then raise exception 'FALLÓ: corporativo debe ver las dos sucursales'; end if;
  select count(*) into v_n from arqueos where id = v_arqueo;
  if v_n <> 1 then raise exception 'FALLÓ: corporativo debe leer arqueos de cualquier sucursal'; end if;
  select count(distinct sucursal_id) into v_n from movimientos where sucursal_id in (v_suc_a, v_suc_b);
  if v_n <> 2 then raise exception 'FALLÓ: corporativo debe leer movimientos de dos sucursales (leyó %)', v_n; end if;
  select count(distinct sucursal_id) into v_n from cajas where sucursal_id in (v_suc_a, v_suc_b);
  if v_n <> 2 then raise exception 'FALLÓ: corporativo debe leer cajas de dos sucursales (leyó %)', v_n; end if;
  v_ok := array_append(v_ok, 'lee todas las sucursales');

  begin
    perform confirmar_movimiento(v_mov, true);
    raise exception 'FALLÓ: corporativo no debe confirmar movimientos';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Corporativo solo puede consultar%' then raise exception 'FALLÓ: mensaje inesperado al confirmar: %', sqlerrm; end if;
  end;
  begin
    perform recibir_arqueo(v_arqueo);
    raise exception 'FALLÓ: corporativo no debe recibir arqueos';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Corporativo solo puede consultar%' then raise exception 'FALLÓ: mensaje inesperado al recibir arqueo: %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'no confirma ni recibe');

  -- Cada inserción debe fallar por la seguridad por renglón (no por otra regla que la tape).
  begin insert into turnos (sucursal_id, fecha, tipo) values (v_suc_a, '2000-01-02', 'matutino');
    raise exception 'FALLÓ: corporativo no debe abrir turnos';
  exception when others then if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%row-level security%' then raise exception 'FALLÓ: turno rechazado por otra razón: %', sqlerrm; end if; end;
  begin insert into movimientos (sucursal_id, tipo, caja_origen_id, caja_destino_id, monto) values (v_suc_a, 'apertura', v_boveda, v_venta, 1);
    raise exception 'FALLÓ: corporativo no debe registrar movimientos';
  exception when others then if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%row-level security%' then raise exception 'FALLÓ: movimiento rechazado por otra razón: %', sqlerrm; end if; end;
  begin insert into arqueos (turno_id, momento, total_contado) values (v_turno, 'traspaso', 0);
    raise exception 'FALLÓ: corporativo no debe registrar arqueos';
  exception when others then if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%row-level security%' then raise exception 'FALLÓ: arqueo rechazado por otra razón: %', sqlerrm; end if; end;
  begin insert into gastos_caja_chica (sucursal_id, fecha, concepto, monto, comprobante) values (v_suc_a, current_date, 'x', 1, 'nota');
    raise exception 'FALLÓ: corporativo no debe registrar gastos';
  exception when others then if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%row-level security%' then raise exception 'FALLÓ: gasto rechazado por otra razón: %', sqlerrm; end if; end;
  begin insert into storage.objects (bucket_id, name) values ('comprobantes', v_suc_a::text || '/corpo.jpg');
    raise exception 'FALLÓ: corporativo no debe subir fotos';
  exception when others then if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%row-level security%' then raise exception 'FALLÓ: foto rechazada por otra razón: %', sqlerrm; end if; end;
  begin insert into cierres_merma (sucursal_id, capturado_dodo) values (v_suc_a, true);
    raise exception 'FALLÓ: corporativo no debe cerrar mermas';
  exception when others then if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%row-level security%' then raise exception 'FALLÓ: cierre de mermas rechazado por otra razón: %', sqlerrm; end if; end;
  begin insert into cierres_dia (sucursal_id, fecha) values (v_suc_a, '2000-01-01');
    raise exception 'FALLÓ: corporativo no debe cerrar el día';
  exception when others then if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%row-level security%' then raise exception 'FALLÓ: cierre del día rechazado por otra razón: %', sqlerrm; end if; end;
  begin perform registrar_recorrido(v_check, current_date, 12, '[]'::jsonb);
    raise exception 'FALLÓ: corporativo no debe registrar recorridos';
  exception when others then if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Tu usuario no tiene sucursal%' then raise exception 'FALLÓ: recorrido rechazado por otra razón: %', sqlerrm; end if; end;
  v_ok := array_append(v_ok, 'no registra nada');

  -- Mermas y masa tienen reglas propias antes de la seguridad por renglón: solo se prueban cuando esas reglas pasan.
  if not exists (select 1 from cierres_merma where sucursal_id = v_suc_a and fecha = dia_operativo()) then
    begin insert into mermas (sucursal_id, producto_id, cantidad, motivo, empleado) values (v_suc_a, v_prod, 1, 'caducidad', 'x');
      raise exception 'FALLÓ: corporativo no debe registrar mermas';
    exception when others then if sqlerrm like 'FALLÓ%' then raise; end if;
      if sqlerrm not like '%row-level security%' then raise exception 'FALLÓ: merma rechazada por otra razón: %', sqlerrm; end if; end;
    v_ok := array_append(v_ok, 'no registra mermas');
  end if;
  select n.hora into v_hora from normas_masa n
   where franja_abierta(dia_operativo(), n.hora)
     and not exists (select 1 from lecturas_masa l where l.sucursal_id = v_suc_a and l.fecha = dia_operativo() and l.hora = n.hora)
   limit 1;
  if v_hora is not null then
    begin insert into lecturas_masa (sucursal_id, fecha, hora, temp_area, bolas, temperatura, comentario) values (v_suc_a, dia_operativo(), v_hora, 25, 0, 18, 'x');
      raise exception 'FALLÓ: corporativo no debe registrar masa';
    exception when others then if sqlerrm like 'FALLÓ%' then raise; end if;
      if sqlerrm not like '%row-level security%' then raise exception 'FALLÓ: masa rechazada por otra razón: %', sqlerrm; end if; end;
    v_ok := array_append(v_ok, 'no registra masa');
  end if;

  raise exception 'PRUEBAS OK — %', array_to_string(v_ok, ' · ');
end $$;
