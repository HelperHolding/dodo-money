-- El efectivo de la bóveda ya no se deposita al banco: se entrega a corporativo con folio o recibo.
-- La caja "banco" pasa a ser "corporativo" (de ahí sale también la reposición de caja chica)
-- y el movimiento "deposito_banco" pasa a "salida_corporativo". Los movimientos ya guardados se renombran solos.
-- Las columnas deposito_* de cierres_dia se quedan con su nombre; la pantalla las muestra como salida a corporativo.
-- Requiere 0001–0009.

alter type tipo_caja rename value 'banco' to 'corporativo';
alter type tipo_movimiento rename value 'deposito_banco' to 'salida_corporativo';

update cajas set nombre = 'Corporativo' where tipo = 'corporativo' and nombre = 'Banco';

-- Las dos funciones comparan contra los nombres viejos escritos como texto: se rehacen con los nuevos.
create or replace function validar_ruta_movimiento() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  t_origen  tipo_caja;
  t_destino tipo_caja;
  s_origen  uuid;
  s_destino uuid;
begin
  select tipo, sucursal_id into t_origen, s_origen from cajas where id = new.caja_origen_id;
  select tipo, sucursal_id into t_destino, s_destino from cajas where id = new.caja_destino_id;

  if s_origen <> new.sucursal_id or s_destino <> new.sucursal_id then
    raise exception 'Las dos cajas deben ser de la misma sucursal del movimiento';
  end if;

  if not (
       (new.tipo = 'apertura'              and t_origen = 'boveda'      and t_destino = 'venta')
    or (new.tipo = 'retiro_boveda'         and t_origen = 'venta'       and t_destino = 'boveda')
    or (new.tipo = 'cambio_morralla'       and t_origen in ('venta','cambios') and t_destino in ('venta','cambios'))
    or (new.tipo = 'salida_corporativo'    and t_origen = 'boveda'      and t_destino = 'corporativo')
    or (new.tipo = 'reposicion_caja_chica' and t_origen = 'corporativo' and t_destino = 'caja_chica')
  ) then
    raise exception 'Ruta no permitida para %: de % a %', new.tipo, t_origen, t_destino;
  end if;

  if new.tipo = 'salida_corporativo' and coalesce(trim(new.folio), '') = '' then
    raise exception 'La salida a corporativo necesita folio o recibo';
  end if;

  return new;
end $$;

create or replace function confirmar_movimiento(p_id uuid, p_aceptar boolean) returns void
language plpgsql security definer set search_path = public as $$
declare m movimientos;
begin
  if mi_rol()::text = 'corporativo' then raise exception 'Corporativo solo puede consultar.'; end if;
  select * into m from movimientos where id = p_id for update;
  if not found then raise exception 'Movimiento no encontrado'; end if;
  if m.sucursal_id <> mi_sucursal() and mi_rol() <> 'admin' then
    raise exception 'El movimiento es de otra sucursal';
  end if;
  if m.estado <> 'pendiente' then raise exception 'El movimiento ya fue %', m.estado; end if;
  if m.registrado_por = auth.uid() then
    raise exception 'Quien registra el movimiento no puede confirmarlo';
  end if;
  if m.tipo in ('salida_corporativo', 'reposicion_caja_chica') and mi_rol() not in ('gerente', 'admin') then
    raise exception 'Solo un gerente confirma salidas a corporativo y reposiciones';
  end if;

  update movimientos
     set estado = case when p_aceptar then 'confirmado'::estado_movimiento else 'rechazado'::estado_movimiento end,
         confirmado_por = auth.uid(),
         confirmado_en = now()
   where id = p_id;
end $$;
