-- Seguimiento del efectivo que sale a corporativo:
--   pendiente  → "Por recoger": la sucursal registró la salida con su folio.
--   confirmado → "Salida de sucursal": un admin la recogió (ya no la confirma el gerente); va en camino a su cargo.
--   recepcion  → "En corporativo" (aceptada) o "No cuadró" (rechazada con motivo): la recibe corporativo.
-- La bóveda baja desde que el admin recoge: el efectivo ya salió físicamente de la sucursal.
-- Primera acción que corporativo puede hacer; para todo lo demás sigue de solo lectura.
-- Requiere 0001–0015.

alter table movimientos
  add column recepcion      text check (recepcion in ('aceptada', 'rechazada')),
  add column recibido_por   uuid references perfiles(id),
  add column recibido_en    timestamptz,
  add column nota_recepcion text,
  add constraint recepcion_solo_salidas check (recepcion is null or (tipo = 'salida_corporativo' and estado = 'confirmado')),
  add constraint recepcion_rechazada_con_motivo check (recepcion is distinct from 'rechazada' or coalesce(trim(nota_recepcion), '') <> '');

create index on movimientos (tipo, estado) where tipo = 'salida_corporativo' and recepcion is null;

-- Las salidas que ya se habían confirmado antes de este cambio no quedan "en camino".
update movimientos
   set recepcion = 'aceptada', recibido_en = confirmado_en, nota_recepcion = 'Antes del seguimiento'
 where tipo = 'salida_corporativo' and estado = 'confirmado' and recepcion is null;

-- Al registrar, nadie puede adelantar la recepción.
drop policy registrar_movimiento on movimientos;
create policy registrar_movimiento on movimientos for insert
  with check (sucursal_id = mi_sucursal() and registrado_por = auth.uid()
              and estado = 'pendiente' and confirmado_por is null
              and recepcion is null and recibido_por is null and recibido_en is null);

-- Igual que en 0010, salvo que las salidas a corporativo solo las recoge (confirma) un admin.
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
  if m.tipo = 'salida_corporativo' and mi_rol() <> 'admin' then
    raise exception 'Solo un admin recoge las salidas a corporativo';
  end if;
  if m.tipo = 'reposicion_caja_chica' and mi_rol() not in ('gerente', 'admin') then
    raise exception 'Solo un gerente confirma las reposiciones de caja chica';
  end if;

  update movimientos
     set estado = case when p_aceptar then 'confirmado'::estado_movimiento else 'rechazado'::estado_movimiento end,
         confirmado_por = auth.uid(),
         confirmado_en = now()
   where id = p_id;
end $$;

-- Corporativo cuenta el efectivo que trajo el admin y lo acepta, o lo rechaza con el motivo.
create or replace function recibir_en_corporativo(p_id uuid, p_aceptar boolean, p_nota text default null) returns void
language plpgsql security definer set search_path = public as $$
declare m movimientos;
begin
  if coalesce(mi_rol()::text, '') <> 'corporativo' then raise exception 'Solo corporativo recibe el efectivo'; end if;
  select * into m from movimientos where id = p_id for update;
  if not found then raise exception 'Movimiento no encontrado'; end if;
  if m.tipo <> 'salida_corporativo' then raise exception 'Solo las salidas a corporativo se reciben aquí'; end if;
  if m.estado = 'pendiente' then raise exception 'Esta salida todavía no la recoge un admin'; end if;
  if m.estado = 'rechazado' then raise exception 'Esta salida se rechazó en la sucursal'; end if;
  if m.recepcion is not null then raise exception 'Esta salida ya se recibió en corporativo'; end if;
  if not p_aceptar and coalesce(trim(p_nota), '') = '' then raise exception 'Escribe el motivo del rechazo'; end if;

  update movimientos
     set recepcion = case when p_aceptar then 'aceptada' else 'rechazada' end,
         recibido_por = auth.uid(),
         recibido_en = now(),
         nota_recepcion = nullif(trim(p_nota), '')
   where id = p_id;
end $$;
revoke execute on function recibir_en_corporativo(uuid, boolean, text) from public, anon;
grant execute on function recibir_en_corporativo(uuid, boolean, text) to authenticated;
