-- Pruebas de la migración 0027 (retiro automático al cerrar el turno). Córrelas completas en Supabase → SQL Editor
-- después de la migración. Necesitan un usuario activo con sucursal que tenga cajero y bóveda.
-- El resultado aparece como ERROR A PROPÓSITO para que Postgres deshaga todo:
--   · "PRUEBAS OK — …" → todo bien.   · "FALLÓ: …" → dice qué regla no se cumplió.

do $$
declare
  v_a uuid; v_suc uuid; v_boveda uuid; v_fondo numeric; v_antes numeric; v_t1 uuid; v_t2 uuid; v_t3 uuid; v_mov movimientos;
  v_ok text[] := '{}';
begin
  select p.id, p.sucursal_id into v_a, v_suc from perfiles p
   where p.activo and p.sucursal_id is not null
     and exists (select 1 from cajas where sucursal_id = p.sucursal_id and tipo = 'venta')
     and exists (select 1 from cajas where sucursal_id = p.sucursal_id and tipo = 'boveda')
   limit 1;
  if v_a is null then raise exception 'FALTAN DATOS: se necesita un usuario activo de una sucursal con cajero y bóveda.'; end if;
  select id into v_boveda from cajas where sucursal_id = v_suc and tipo = 'boveda' order by id limit 1;
  select fondo_caja_venta into v_fondo from sucursales where id = v_suc;

  if exists (select 1 from cajas where tipo = 'venta' and nombre <> 'Cajero') then raise exception 'FALLÓ: la caja de venta se llama Cajero'; end if;
  v_ok := array_append(v_ok, 'la caja de venta se llama Cajero');

  -- Cierre con efectivo arriba del fondo: pasa solo a la bóveda, ya confirmado.
  select saldo into v_antes from saldos_cajas where caja_id = v_boveda;
  insert into turnos (sucursal_id, fecha, tipo, encargado_id) values (v_suc, date '1999-01-01', 'matutino', v_a) returning id into v_t1;
  insert into arqueos (turno_id, momento, total_contado, fondo_inicial, ventas_efectivo, entrega_id)
  values (v_t1, 'cierre', v_fondo + 1615, v_fondo, 1615, v_a);
  select * into v_mov from movimientos where turno_id = v_t1 and tipo = 'retiro_boveda';
  if not found then raise exception 'FALLÓ: el cierre debía registrar el retiro a la bóveda'; end if;
  if v_mov.monto <> 1615 or v_mov.estado <> 'confirmado' or v_mov.registrado_por <> v_a or v_mov.confirmado_por is not null then
    raise exception 'FALLÓ: retiro de 1,615 confirmado a nombre de quien entregó el arqueo (fue %, %)', v_mov.monto, v_mov.estado;
  end if;
  if (select saldo from saldos_cajas where caja_id = v_boveda) <> v_antes + 1615 then raise exception 'FALLÓ: la bóveda sube lo retirado'; end if;
  if (select cerrado_en from turnos where id = v_t1) is null then raise exception 'FALLÓ: el turno queda cerrado'; end if;
  v_ok := array_append(v_ok, 'el cierre pasa a la bóveda lo que excede el fondo');

  -- Cierre sin excedente: no hay retiro.
  insert into turnos (sucursal_id, fecha, tipo, encargado_id) values (v_suc, date '1999-01-02', 'matutino', v_a) returning id into v_t2;
  insert into arqueos (turno_id, momento, total_contado, fondo_inicial, ventas_efectivo, entrega_id)
  values (v_t2, 'cierre', v_fondo, v_fondo, 0, v_a);
  if exists (select 1 from movimientos where turno_id = v_t2) then raise exception 'FALLÓ: sin excedente no hay retiro'; end if;
  v_ok := array_append(v_ok, 'sin excedente no hay retiro');

  -- Los arqueos de inicio y de traspaso no mueven nada.
  insert into turnos (sucursal_id, fecha, tipo, encargado_id) values (v_suc, date '1999-01-03', 'matutino', v_a) returning id into v_t3;
  insert into arqueos (turno_id, momento, total_contado, fondo_inicial, entrega_id) values (v_t3, 'inicio', v_fondo + 900, v_fondo, v_a);
  if exists (select 1 from movimientos where turno_id = v_t3) then raise exception 'FALLÓ: el arqueo de inicio no mueve efectivo'; end if;
  v_ok := array_append(v_ok, 'el arqueo de inicio no mueve efectivo');

  raise exception 'PRUEBAS OK — %', array_to_string(v_ok, ' · ');
end $$;
