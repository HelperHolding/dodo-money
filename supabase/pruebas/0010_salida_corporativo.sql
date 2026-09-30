-- Pruebas de la migración 0010 (salida a corporativo). Córrelas completas en Supabase → SQL Editor después de la migración.
-- Necesitan dos usuarios activos de la misma sucursal. Sus puestos cambian solo mientras corre el script.
-- El resultado aparece como ERROR A PROPÓSITO para que Postgres deshaga todo:
--   · "PRUEBAS OK — …" → todo bien.   · "FALLÓ: …" → dice qué regla no se cumplió.

do $$
declare
  v_a uuid; v_b uuid; v_suc uuid;
  v_boveda uuid; v_corpo uuid; v_chica uuid; v_mov uuid;
  v_ok text[] := '{}';
begin
  -- Nombres nuevos y ninguno viejo.
  if exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'tipo_caja' and e.enumlabel = 'banco') then
    raise exception 'FALLÓ: la caja banco todavía existe';
  end if;
  if exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'tipo_movimiento' and e.enumlabel = 'deposito_banco') then
    raise exception 'FALLÓ: el movimiento deposito_banco todavía existe';
  end if;
  if exists (select 1 from cajas where tipo = 'corporativo' and nombre = 'Banco') then
    raise exception 'FALLÓ: una caja corporativo se sigue llamando Banco';
  end if;
  v_ok := array_append(v_ok, 'banco ahora es corporativo');

  select a.id, b.id, a.sucursal_id into v_a, v_b, v_suc
    from perfiles a join perfiles b on b.id <> a.id and b.activo and b.sucursal_id = a.sucursal_id
   where a.activo and a.sucursal_id is not null
   limit 1;
  if v_a is null then raise exception 'FALTAN DATOS: se necesitan dos usuarios activos de la misma sucursal.'; end if;

  select id into v_boveda from cajas where sucursal_id = v_suc and tipo = 'boveda';
  select id into v_chica from cajas where sucursal_id = v_suc and tipo = 'caja_chica';
  if v_boveda is null or v_chica is null then raise exception 'FALTAN DATOS: la sucursal % no tiene bóveda y caja chica.', v_suc; end if;
  select id into v_corpo from cajas where sucursal_id = v_suc and tipo = 'corporativo';
  if v_corpo is null then
    insert into cajas (sucursal_id, tipo, nombre) values (v_suc, 'corporativo', 'Corporativo') returning id into v_corpo;
  end if;

  -- Salida sin folio: rechazada.
  begin
    insert into movimientos (sucursal_id, tipo, caja_origen_id, caja_destino_id, monto, registrado_por)
    values (v_suc, 'salida_corporativo', v_boveda, v_corpo, 100, v_a);
    raise exception 'FALLÓ: una salida a corporativo sin folio no debe guardarse';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%folio o recibo%' then raise exception 'FALLÓ: mensaje inesperado (sin folio): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'la salida pide folio');

  -- Salida a otra caja que no sea corporativo: rechazada.
  begin
    insert into movimientos (sucursal_id, tipo, caja_origen_id, caja_destino_id, monto, folio, registrado_por)
    values (v_suc, 'salida_corporativo', v_boveda, v_chica, 100, 'R-1', v_a);
    raise exception 'FALLÓ: la salida solo puede ir de bóveda a corporativo';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Ruta no permitida%' then raise exception 'FALLÓ: mensaje inesperado (ruta): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'solo bóveda → corporativo');

  -- Reposición de caja chica desde corporativo: se guarda.
  insert into movimientos (sucursal_id, tipo, caja_origen_id, caja_destino_id, monto, registrado_por)
  values (v_suc, 'reposicion_caja_chica', v_corpo, v_chica, 50, v_a);
  v_ok := array_append(v_ok, 'la reposición sale de corporativo');

  -- Salida con folio: se guarda; operación no la confirma y el gerente sí.
  insert into movimientos (sucursal_id, tipo, caja_origen_id, caja_destino_id, monto, folio, registrado_por)
  values (v_suc, 'salida_corporativo', v_boveda, v_corpo, 100, 'R-1', v_a) returning id into v_mov;

  update perfiles set rol = 'operacion' where id = v_b;
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  begin
    perform confirmar_movimiento(v_mov, true);
    raise exception 'FALLÓ: operación no debe confirmar una salida a corporativo';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Solo un gerente%' then raise exception 'FALLÓ: mensaje inesperado (operación confirma): %', sqlerrm; end if;
  end;

  update perfiles set rol = 'gerente' where id = v_b;
  perform confirmar_movimiento(v_mov, true);
  if (select estado::text from movimientos where id = v_mov) <> 'confirmado' then
    raise exception 'FALLÓ: el gerente debe poder confirmar la salida';
  end if;
  v_ok := array_append(v_ok, 'solo el gerente confirma la salida');

  raise exception 'PRUEBAS OK — %', array_to_string(v_ok, ' · ');
end $$;
