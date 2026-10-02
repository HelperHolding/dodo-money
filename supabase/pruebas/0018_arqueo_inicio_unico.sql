-- Pruebas de la migración 0018 (un solo inicio por turno y anular arqueos). Córrelas completas en Supabase → SQL Editor después de la migración.
-- Necesitan dos usuarios activos de la misma sucursal y un usuario corporativo activo. Usan un turno de prueba del 1999-01-01.
-- El resultado aparece como ERROR A PROPÓSITO para que Postgres deshaga todo:
--   · "PRUEBAS OK — …" → todo bien.   · "FALLÓ: …" → dice qué regla no se cumplió.

do $$
declare
  v_a uuid; v_b uuid; v_c uuid; v_suc uuid; v_turno uuid;
  v_inicio uuid; v_cierre uuid; v_inicio2 uuid;
  v_ok text[] := '{}';
begin
  select a.id, b.id, a.sucursal_id into v_a, v_b, v_suc
    from perfiles a join perfiles b on b.id <> a.id and b.activo and b.sucursal_id = a.sucursal_id
   where a.activo and a.sucursal_id is not null
   limit 1;
  if v_a is null then raise exception 'FALTAN DATOS: se necesitan dos usuarios activos de la misma sucursal.'; end if;
  select id into v_c from perfiles where rol::text = 'corporativo' and activo limit 1;
  if v_c is null then raise exception 'FALTAN DATOS: se necesita un usuario corporativo activo.'; end if;

  insert into turnos (sucursal_id, fecha, tipo, encargado_id) values (v_suc, date '1999-01-01', 'matutino', v_a) returning id into v_turno;

  -- Un solo inicio vigente.
  insert into arqueos (turno_id, momento, total_contado, fondo_inicial, entrega_id) values (v_turno, 'inicio', 1500, 1500, v_a) returning id into v_inicio;
  begin
    insert into arqueos (turno_id, momento, total_contado, fondo_inicial, entrega_id) values (v_turno, 'inicio', 0, 1500, v_a);
    raise exception 'FALLÓ: un segundo inicio en el mismo turno no debe guardarse';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Este turno ya tiene su arqueo de inicio%' then raise exception 'FALLÓ: mensaje inesperado (segundo inicio): %', sqlerrm; end if;
  end;
  insert into arqueos (turno_id, momento, total_contado, fondo_inicial, ventas_efectivo, entrega_id) values (v_turno, 'traspaso', 3000, 1500, 1500, v_a);
  v_ok := array_append(v_ok, 'un solo inicio por turno');

  -- La sucursal no puede registrar un arqueo ya anulado (política de inserción).
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into arqueos (turno_id, momento, total_contado, fondo_inicial, entrega_id, anulado_por, anulado_en, motivo_anulacion)
    values (v_turno, 'traspaso', 1, 1500, v_a, v_a, now(), 'adelantado');
    reset role;
    raise exception 'FALLÓ: no se debe poder registrar un arqueo ya anulado';
  exception when others then
    reset role;
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%row-level security%' then raise exception 'FALLÓ: mensaje inesperado (política): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'no nace anulado');

  -- Anular: ni encargado ni corporativo; el gerente con motivo, una vez.
  update perfiles set rol = 'encargado' where id = v_b;
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  begin
    perform anular_arqueo(v_inicio, 'Duplicado');
    raise exception 'FALLÓ: el encargado no debe anular arqueos';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Solo el gerente o el admin%' then raise exception 'FALLÓ: mensaje inesperado (encargado): %', sqlerrm; end if;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  begin
    perform anular_arqueo(v_inicio, 'Duplicado');
    raise exception 'FALLÓ: corporativo no debe anular arqueos';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Corporativo solo puede consultar%' then raise exception 'FALLÓ: mensaje inesperado (corporativo): %', sqlerrm; end if;
  end;
  update perfiles set rol = 'gerente' where id = v_b;
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  begin
    perform anular_arqueo(v_inicio, '   ');
    raise exception 'FALLÓ: anular sin motivo no debe pasar';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Escribe por qué%' then raise exception 'FALLÓ: mensaje inesperado (sin motivo): %', sqlerrm; end if;
  end;
  perform anular_arqueo(v_inicio, '  Conteo equivocado  ');
  if (select anulado_por from arqueos where id = v_inicio) <> v_b
     or (select motivo_anulacion from arqueos where id = v_inicio) <> 'Conteo equivocado'
     or (select anulado_en from arqueos where id = v_inicio) is null then
    raise exception 'FALLÓ: el gerente debe poder anular con motivo';
  end if;
  begin
    perform anular_arqueo(v_inicio, 'Otra vez');
    raise exception 'FALLÓ: un arqueo no se anula dos veces';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%ya estaba anulado%' then raise exception 'FALLÓ: mensaje inesperado (dos veces): %', sqlerrm; end if;
  end;
  begin
    perform recibir_arqueo(v_inicio);
    raise exception 'FALLÓ: un arqueo anulado no se recibe';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%está anulado%' then raise exception 'FALLÓ: mensaje inesperado (recibir anulado): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'el gerente anula con motivo, una vez');

  -- Con el inicio anulado, se puede registrar el bueno.
  insert into arqueos (turno_id, momento, total_contado, fondo_inicial, entrega_id) values (v_turno, 'inicio', 1500, 1500, v_a) returning id into v_inicio2;
  v_ok := array_append(v_ok, 'tras anular se registra el inicio correcto');

  -- El cierre cierra el turno, no se anula, y después ya no se registra nada.
  insert into arqueos (turno_id, momento, total_contado, fondo_inicial, ventas_efectivo, entrega_id) values (v_turno, 'cierre', 4000, 1500, 2500, v_a) returning id into v_cierre;
  if (select cerrado_en from turnos where id = v_turno) is null then raise exception 'FALLÓ: el cierre debe cerrar el turno'; end if;
  begin
    perform anular_arqueo(v_cierre, 'No');
    raise exception 'FALLÓ: el arqueo de cierre no se anula';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'El arqueo de cierre no se anula%' then raise exception 'FALLÓ: mensaje inesperado (anular cierre): %', sqlerrm; end if;
  end;
  begin
    insert into arqueos (turno_id, momento, total_contado, fondo_inicial, entrega_id) values (v_turno, 'traspaso', 1, 1500, v_a);
    raise exception 'FALLÓ: no se registra un arqueo en un turno cerrado';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'El turno ya está cerrado%' then raise exception 'FALLÓ: mensaje inesperado (turno cerrado): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'el cierre no se anula y cierra el turno');

  raise exception 'PRUEBAS OK — %', array_to_string(v_ok, ' · ');
end $$;
