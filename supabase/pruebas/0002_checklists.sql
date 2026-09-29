-- Pruebas de la migración 0002 (checklists). Córrelas completas en Supabase → SQL Editor
-- después de 0002_checklists.sql y seed_checklists.sql.
--
-- Necesitan un encargado activo y otro usuario activo en la misma sucursal. Si no hay cajero,
-- ese otro usuario (por ejemplo, el gerente) actúa como cajero solo mientras corre el script.
-- El resultado aparece como ERROR A PROPÓSITO: así Postgres deshace todo y no queda ningún dato.
--   · "PRUEBAS OK — …"  → todas las reglas funcionan.
--   · "FALLÓ: …"        → dice qué regla no se cumplió.
--   · "FALTAN DATOS: …" → crea los usuarios de prueba primero.

do $$
declare
  v_cajero uuid; v_enc uuid; v_suc uuid;
  v_prod uuid; v_check uuid; v_resp jsonb; v_resp_mala jsonb; v_merma uuid;
  v_ayer date := dia_operativo() - 1;
  v_hora int; v_n int;
  v_ok text[] := '{}';
begin
  -- ── Sin usuarios: horario ──────────────────────────────────────────────
  if not franja_abierta('2026-09-25', 12, '2026-09-25 12:30-06') then raise exception 'FALLÓ: 12:30 debe aceptar la hora de las 12'; end if;
  if not franja_abierta('2026-09-25', 12, '2026-09-25 13:09-06') then raise exception 'FALLÓ: 13:09 debe aceptar la hora de las 12 (tolerancia)'; end if;
  if franja_abierta('2026-09-25', 12, '2026-09-25 13:10-06') then raise exception 'FALLÓ: 13:10 ya no debe aceptar la hora de las 12'; end if;
  if franja_abierta('2026-09-25', 12, '2026-09-25 11:59-06') then raise exception 'FALLÓ: 11:59 todavía no debe aceptar la hora de las 12'; end if;
  if not franja_abierta('2026-09-25', 23, '2026-09-26 00:05-06') then raise exception 'FALLÓ: 00:05 debe aceptar la hora de las 23 del día anterior'; end if;
  if dia_operativo('2026-09-26 03:59-06') <> date '2026-09-25' then raise exception 'FALLÓ: a las 3:59 sigue siendo el día anterior'; end if;
  if dia_operativo('2026-09-26 04:00-06') <> date '2026-09-26' then raise exception 'FALLÓ: a las 4:00 empieza el día'; end if;
  v_ok := array_append(v_ok, 'horario y tolerancia');

  -- ── Datos de prueba ────────────────────────────────────────────────────
  select c.id, e.id, c.sucursal_id into v_cajero, v_enc, v_suc
    from perfiles c
    join perfiles e on e.sucursal_id = c.sucursal_id and e.rol = 'encargado' and e.activo
   where c.rol = 'operacion' and c.activo
   limit 1;
  -- Sin cajero: otro perfil de la sucursal del encargado hace de cajero. Se deshace al final con todo lo demás.
  if v_cajero is null then
    select c.id, e.id, c.sucursal_id into v_cajero, v_enc, v_suc
      from perfiles e
      join perfiles c on c.sucursal_id = e.sucursal_id and c.id <> e.id and c.activo
     where e.rol = 'encargado' and e.activo
     limit 1;
    update perfiles set rol = 'operacion' where id = v_cajero;
  end if;
  if v_cajero is null then raise exception 'FALTAN DATOS: se necesita un encargado activo y otro usuario activo en la misma sucursal.'; end if;
  select id into v_prod from productos_merma where activo order by orden limit 1;
  select id into v_check from checklists where clave = 'recorrido_manana';
  if v_prod is null or v_check is null then raise exception 'FALTAN DATOS: corre seed_checklists.sql.'; end if;
  select jsonb_agg(jsonb_build_object('punto_id', id, 'cumple', true)) into v_resp
    from checklist_puntos where checklist_id = v_check;
  select jsonb_agg(jsonb_build_object('punto_id', id, 'cumple', orden <> 1)) into v_resp_mala
    from checklist_puntos where checklist_id = v_check;

  -- ── Como cajero ────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_cajero, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  begin
    perform registrar_recorrido(v_check, dia_operativo(), 12, v_resp);
    raise exception 'FALLÓ: un cajero no debe registrar recorridos';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Solo un encargado%' then raise exception 'FALLÓ: mensaje inesperado para cajero en recorrido: %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'cajero no registra recorrido');

  begin
    insert into cierres_merma (sucursal_id, capturado_dodo) values (v_suc, true);
    raise exception 'FALLÓ: un cajero no debe cerrar mermas';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%row-level security%' then raise exception 'FALLÓ: mensaje inesperado para cajero al cerrar: %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'cajero no cierra mermas');

  -- Solo se puede probar si hoy no hay cierre real de mermas (el cierre se revisa antes que el nombre).
  if not exists (select 1 from cierres_merma where sucursal_id = v_suc and fecha = dia_operativo()) then
    begin
      insert into mermas (sucursal_id, producto_id, cantidad, motivo, empleado) values (v_suc, v_prod, 1, 'caducidad', '   ');
      raise exception 'FALLÓ: una merma sin nombre de empleado debe rechazarse';
    exception when others then
      if sqlerrm like 'FALLÓ%' then raise; end if;
      if sqlerrm not like '%mermas_empleado_check%' then raise exception 'FALLÓ: mensaje inesperado para merma sin empleado: %', sqlerrm; end if;
    end;
    v_ok := array_append(v_ok, 'merma exige empleado');

    insert into mermas (sucursal_id, producto_id, cantidad, motivo, empleado)
    values (v_suc, v_prod, 0.5, 'caducidad', 'Prueba') returning id into v_merma;
    update mermas set cantidad = 99 where id = v_merma;
    get diagnostics v_n = row_count;
    if v_n <> 0 then raise exception 'FALLÓ: una merma no debe poder editarse'; end if;
    delete from mermas where id = v_merma;
    get diagnostics v_n = row_count;
    if v_n <> 0 then raise exception 'FALLÓ: una merma no debe poder borrarse'; end if;
    v_ok := array_append(v_ok, 'mermas no se editan ni borran');
  end if;

  -- ── Como encargado ─────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_enc, 'role', 'authenticated')::text, true);

  begin
    perform registrar_recorrido(v_check, dia_operativo(), 12, (v_resp - 0));
    raise exception 'FALLÓ: un recorrido incompleto debe rechazarse';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Marca Cumple o No cumple%' then raise exception 'FALLÓ: mensaje inesperado para recorrido incompleto: %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'recorrido completo');

  begin
    perform registrar_recorrido(v_check, dia_operativo(), 12, v_resp_mala);
    raise exception 'FALLÓ: un "no cumple" sin comentario debe rechazarse';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Escribe qué pasó%' then raise exception 'FALLÓ: mensaje inesperado para no cumple sin comentario: %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'no cumple exige comentario');

  begin
    perform registrar_recorrido(v_check, v_ayer, 12, v_resp);
    raise exception 'FALLÓ: un recorrido de una hora cerrada debe rechazarse';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'La hora de las 12:00 cerró%' then raise exception 'FALLÓ: mensaje inesperado para recorrido fuera de hora: %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'recorrido fuera de hora');

  begin
    insert into lecturas_masa (sucursal_id, fecha, hora, temp_area, bolas, temperatura) values (v_suc, v_ayer, 13, 25, 4, 30);
    raise exception 'FALLÓ: masa fuera de 12–22 °C sin comentario debe rechazarse';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Escribe qué pasó: la masa está%' then raise exception 'FALLÓ: mensaje inesperado para masa fuera de rango: %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'masa fuera de rango exige comentario');

  begin
    insert into lecturas_masa (sucursal_id, fecha, hora, temp_area, bolas, temperatura) values (v_suc, v_ayer, 13, 25, 3, 18);
    raise exception 'FALLÓ: bolas distintas a la norma sin comentario debe rechazarse';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Escribe qué pasó: sacaste%' then raise exception 'FALLÓ: mensaje inesperado para bolas fuera de norma: %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'bolas fuera de norma exigen comentario');

  begin
    insert into lecturas_masa (sucursal_id, fecha, hora, temp_area, bolas, temperatura) values (v_suc, v_ayer, 13, 25, 4, 18);
    raise exception 'FALLÓ: una lectura de una hora cerrada debe rechazarse';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'La hora de las 13:00 cerró%' then raise exception 'FALLÓ: mensaje inesperado para masa fuera de hora: %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'masa fuera de hora');

  begin
    insert into lecturas_masa (sucursal_id, fecha, hora, temp_area, bolas, temperatura, comentario) values (v_suc, v_ayer, 13, 25, 4, 180, 'x');
    raise exception 'FALLÓ: 180 °C debe rechazarse';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Revisa la temperatura%' then raise exception 'FALLÓ: mensaje inesperado para 180 °C: %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'temperatura absurda');

  -- Doble registro: solo si ahora hay una hora de masa abierta.
  select n.hora into v_hora from normas_masa n
   where franja_abierta(dia_operativo(), n.hora)
     and not exists (select 1 from lecturas_masa l where l.sucursal_id = v_suc and l.fecha = dia_operativo() and l.hora = n.hora)
   limit 1;
  if v_hora is not null then
    insert into lecturas_masa (sucursal_id, fecha, hora, temp_area, bolas, temperatura, comentario)
    values (v_suc, dia_operativo(), v_hora, 25, 0, 18, 'prueba');
    begin
      insert into lecturas_masa (sucursal_id, fecha, hora, temp_area, bolas, temperatura, comentario)
      values (v_suc, dia_operativo(), v_hora, 25, 0, 18, 'prueba');
      raise exception 'FALLÓ: la misma hora de masa no debe registrarse dos veces';
    exception when unique_violation then null;
    end;
    v_ok := array_append(v_ok, 'masa sin duplicados');
  end if;

  if not exists (select 1 from cierres_merma where sucursal_id = v_suc and fecha = dia_operativo()) then
    insert into cierres_merma (sucursal_id, capturado_dodo) values (v_suc, true);
    begin
      insert into mermas (sucursal_id, producto_id, cantidad, motivo, empleado) values (v_suc, v_prod, 1, 'caducidad', 'Prueba');
      raise exception 'FALLÓ: después del cierre no se deben agregar mermas';
    exception when others then
      if sqlerrm like 'FALLÓ%' then raise; end if;
      if sqlerrm not like 'Las mermas de hoy ya se cerraron%' then raise exception 'FALLÓ: mensaje inesperado tras cierre: %', sqlerrm; end if;
    end;
    v_ok := array_append(v_ok, 'cierre bloquea mermas');
  end if;

  raise exception 'PRUEBAS OK — %', array_to_string(v_ok, ' · ');
end $$;
