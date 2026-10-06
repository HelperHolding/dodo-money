-- Al guardar el arqueo de cierre, lo que el cajero tenga arriba de su fondo pasa solo a la bóveda: se registra el retiro
-- ya confirmado (sin segunda firma; el control es el conteo de la bóveda en el cierre del día). Los retiros durante el día
-- siguen siendo manuales; el cierre cuenta solo lo que queda, así que no se cuenta doble.
-- La caja de venta se llama "Cajero". Requiere 0001–0026.

update cajas set nombre = 'Cajero' where tipo = 'venta';

create or replace function retiro_automatico_al_cierre() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_suc uuid; v_fondo numeric; v_cajero uuid; v_boveda uuid; v_monto numeric;
begin
  if new.momento <> 'cierre' or new.anulado_en is not null then return null; end if;
  select sucursal_id into v_suc from turnos where id = new.turno_id;
  select fondo_caja_venta into v_fondo from sucursales where id = v_suc;
  select id into v_cajero from cajas where sucursal_id = v_suc and tipo = 'venta' order by id limit 1;
  select id into v_boveda from cajas where sucursal_id = v_suc and tipo = 'boveda' order by id limit 1;
  v_monto := round(new.total_contado - coalesce(v_fondo, 0), 2);
  if v_monto <= 0 or v_cajero is null or v_boveda is null then return null; end if;
  insert into movimientos (sucursal_id, turno_id, tipo, caja_origen_id, caja_destino_id, monto, nota, estado, registrado_por, confirmado_en)
  values (v_suc, new.turno_id, 'retiro_boveda', v_cajero, v_boveda, v_monto, 'Automático al cerrar el turno', 'confirmado', new.entrega_id, now());
  return null;
end $$;

create trigger arqueos_retiro_al_cierre
  after insert on arqueos
  for each row execute function retiro_automatico_al_cierre();
