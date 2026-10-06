-- Corrección de la bóveda de Zapopan-1 (06/10/2026).
--
-- Qué pasó: la bóveda empezó en la app con $5,000 pero en realidad tenía $23,078 (incluía la venta de la primera semana,
-- de antes de usar la app); al cerrar cada turno nunca se registró el retiro del cajero a la bóveda; la salida del 01/10
-- se registró por $2,173 pero corporativo recibió $1,485 porque $688 se pagaron a Totalplay desde la bóveda; y la salida
-- del 05/10 por $17,344 no se pudo registrar porque, para la app, la bóveda estaba en negativo.
--
-- Qué hace:
--   1. Saldo inicial real de la bóveda: $23,078.
--   2. Registra los 7 retiros a bóveda que faltaron (lo contado al cierre de cada turno menos los $500 del cajero).
--   3. Corrige la salida del 01/10 a $1,485 (recibida bien) y registra el gasto de $688 a Totalplay pagado de la bóveda
--      (cuenta Servicios del P&L).
--   4. Registra la salida del 05/10 por $17,344, ya recogida; corporativo la recibe en la app como cualquier salida.
--   Al final la bóveda debe quedar en $6,115 ($4,500 de fondo + $1,615 del cierre del 05/10). Si no, no se aplica nada.
--
-- Cómo correrla:
--   · Tal como está, SOLO SIMULA: termina con "SIMULACIÓN OK — …" (un error a propósito que deshace todo).
--   · Si la simulación sale bien, cambia  v_aplicar boolean := false  a  true  y vuelve a correrla. Solo se puede aplicar una vez.

do $$
declare
  v_aplicar boolean := false;   -- ← cámbialo a true para aplicar
  v_suc uuid; v_cajero uuid; v_boveda uuid; v_corp uuid; v_admin uuid; v_admin2 uuid; v_n integer; v_saldo numeric;
  t record;
  firma uuid;
begin
  select id into v_suc from sucursales where nombre = 'Zapopan-1';
  if v_suc is null then raise exception 'No encontré la sucursal Zapopan-1.'; end if;
  select count(*) into v_n from cajas where sucursal_id = v_suc and tipo = 'venta';
  if v_n <> 1 then raise exception 'Zapopan-1 tiene % cajeros (cajas de venta); esperaba 1.', v_n; end if;
  select id into v_cajero from cajas where sucursal_id = v_suc and tipo = 'venta';
  select id into v_boveda from cajas where sucursal_id = v_suc and tipo = 'boveda';
  select caja_destino_id into v_corp from movimientos where sucursal_id = v_suc and tipo = 'salida_corporativo' and folio = '002';
  if v_boveda is null or v_corp is null then raise exception 'No encontré la bóveda o la caja de corporativo de Zapopan-1.'; end if;
  select id into v_admin from perfiles where rol::text = 'admin' and activo and nombre ilike 'Sebasti%' limit 1;
  select id into v_admin2 from perfiles where rol::text = 'admin' and activo and id <> v_admin limit 1;
  if v_admin is null or v_admin2 is null then raise exception 'Se necesitan dos admins activos (Sebastián y otro) para las firmas.'; end if;

  if exists (select 1 from movimientos where sucursal_id = v_suc and nota like 'Corrección 06/10%') then
    raise exception 'Esta corrección ya se aplicó.';
  end if;

  -- 1. Saldo inicial real de la bóveda.
  update cajas set saldo_inicial = 23078 where id = v_boveda and saldo_inicial = 5000;
  if not found then raise exception 'El saldo inicial de la bóveda ya no es $5,000: revisa antes de seguir.'; end if;

  -- 2. Retiros a bóveda que no se registraron: lo contado al cierre menos los $500 del cajero.
  v_n := 0;
  for t in
    select tu.id, tu.encargado_id, tu.cerrado_en, a.total_contado
      from turnos tu join arqueos a on a.turno_id = tu.id and a.momento = 'cierre' and a.anulado_en is null
     where tu.sucursal_id = v_suc and tu.fecha between date '2026-09-28' and date '2026-10-05'
       and not exists (select 1 from movimientos m where m.turno_id = tu.id and m.tipo = 'retiro_boveda')
  loop
    firma := case when t.encargado_id = v_admin then v_admin2 else v_admin end;
    insert into movimientos (sucursal_id, turno_id, tipo, caja_origen_id, caja_destino_id, monto, nota, estado,
                             registrado_por, confirmado_por, confirmado_en, creado_en)
    values (v_suc, t.id, 'retiro_boveda', v_cajero, v_boveda, t.total_contado - 500,
            'Corrección 06/10: retiro al cierre del turno que no se registró', 'confirmado',
            t.encargado_id, firma, t.cerrado_en, t.cerrado_en);
    v_n := v_n + 1;
  end loop;
  if v_n <> 7 then raise exception 'Esperaba 7 retiros por registrar y encontré %: revisa antes de seguir.', v_n; end if;

  -- 3. Salida del 01/10: corporativo recibió $1,485; $688 se pagaron a Totalplay desde la bóveda.
  update movimientos
     set monto = 1485, recepcion = 'aceptada',
         nota_recepcion = nota_recepcion || ' · Corrección 06/10: la salida fue de $1,485; los $688 a Totalplay se registraron como gasto pagado de la bóveda.'
   where sucursal_id = v_suc and tipo = 'salida_corporativo' and folio = '0002' and monto = 2173;
  if not found then raise exception 'No encontré la salida del 01/10 por $2,173.'; end if;
  insert into gastos_caja_chica (sucursal_id, fecha, concepto, proveedor, monto, comprobante, registrado_por, origen, cuenta_pl)
  values (v_suc, date '2026-10-01', 'Totalplay (teléfono e internet) pagado de la bóveda', 'Totalplay', 688, 'sin_comprobante', v_admin, 'boveda', 'servicios');

  -- 4. Salida del 05/10 que no se pudo registrar: ya recogida; corporativo la recibe en la app.
  -- La registra el encargado del turno del 05/10 y la recoge Sebastián (si fueran la misma persona, la registra el otro admin).
  select encargado_id into firma from turnos where sucursal_id = v_suc and fecha = date '2026-10-05' limit 1;
  if firma is null or firma = v_admin then firma := v_admin2; end if;
  insert into movimientos (sucursal_id, tipo, caja_origen_id, caja_destino_id, monto, folio, nota, estado,
                           registrado_por, confirmado_por, confirmado_en, creado_en)
  values (v_suc, 'salida_corporativo', v_boveda, v_corp, 17344, '0003',
          'Corrección 06/10: salida del 05/10 que no se pudo registrar', 'confirmado',
          firma, v_admin, timestamptz '2026-10-05 20:00:00-06', timestamptz '2026-10-05 20:00:00-06');

  -- Verificación: la bóveda debe quedar en $6,115.
  select saldo into v_saldo from saldos_cajas where caja_id = v_boveda;
  if v_saldo <> 6115 then raise exception 'La bóveda quedaría en $% y debe quedar en $6,115: no se aplicó nada.', v_saldo; end if;

  if not v_aplicar then
    raise exception 'SIMULACIÓN OK — la bóveda quedaría en $6,115; 7 retiros, salida 01/10 a $1,485 + gasto Totalplay $688, salida 05/10 $17,344. Cambia v_aplicar a true para aplicar.';
  end if;
  raise notice 'APLICADO — la bóveda de Zapopan-1 quedó en $6,115.';
end $$;
