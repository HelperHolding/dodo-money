-- De dónde salió el dinero de cada gasto:
--   caja_chica → como hasta ahora: baja la caja chica y entra en la reposición desde corporativo.
--   boveda     → baja la bóveda y el cierre del día lo descuenta de la bóveda esperada. No se repone.
--   empleado   → lo pagó alguien de la sucursal de su bolsa. Ninguna caja cambia; queda "por reponer"
--                a esa persona hasta que el gerente o el admin lo marcan como repuesto.
-- Los gastos que ya existían quedan como caja chica.
-- Requiere 0001–0016.

create type origen_gasto as enum ('caja_chica', 'boveda', 'empleado');

alter table gastos_caja_chica
  add column origen       origen_gasto not null default 'caja_chica',
  add column pagado_por   uuid references perfiles(id),
  add column repuesto_por uuid references perfiles(id),
  add column repuesto_en  timestamptz,
  add constraint gasto_empleado_dice_quien check ((origen = 'empleado') = (pagado_por is not null)),
  add constraint gasto_repuesto_solo_empleado check (repuesto_en is null or origen = 'empleado'),
  add constraint gasto_repuesto_completo check ((repuesto_por is null) = (repuesto_en is null));

create index on gastos_caja_chica (sucursal_id, origen) where origen = 'empleado' and repuesto_en is null;

-- Quien pagó tiene que ser alguien activo de la misma sucursal.
create or replace function validar_pagado_por() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.pagado_por is not null and not exists (
    select 1 from perfiles where id = new.pagado_por and activo and sucursal_id = new.sucursal_id
  ) then
    raise exception 'Quien pagó el gasto debe ser alguien activo de la sucursal';
  end if;
  return new;
end $$;

create trigger gastos_validar_pagado_por
  before insert on gastos_caja_chica
  for each row execute function validar_pagado_por();

-- Al registrar, nadie puede adelantar que ya se repuso.
drop policy registrar_gasto on gastos_caja_chica;
create policy registrar_gasto on gastos_caja_chica for insert
  with check (sucursal_id = mi_sucursal() and registrado_por = auth.uid()
              and repuesto_por is null and repuesto_en is null);

-- Saldos: cada gasto baja solo la caja de la que salió.
create or replace view saldos_cajas with (security_invoker = true) as
select
  c.id as caja_id, c.sucursal_id, c.tipo, c.nombre,
  c.saldo_inicial
  + coalesce((select sum(m.monto) from movimientos m
              where m.caja_destino_id = c.id and m.estado = 'confirmado' and m.tipo <> 'cambio_morralla'), 0)
  - coalesce((select sum(m.monto) from movimientos m
              where m.caja_origen_id = c.id and m.estado = 'confirmado' and m.tipo <> 'cambio_morralla'), 0)
  - case when c.tipo in ('caja_chica', 'boveda')
         then coalesce((select sum(g.monto) from gastos_caja_chica g
                         where g.sucursal_id = c.sucursal_id and g.origen::text = c.tipo::text), 0)
         else 0 end
  as saldo
from cajas c
where c.tipo in ('boveda', 'caja_chica', 'cambios');

-- Cierre del día: la bóveda esperada descuenta los gastos pagados de la bóveda.
-- Las columnas calculadas se rehacen; en los cierres viejos los gastos de bóveda son 0 y nada cambia.
alter table cierres_dia add column gastos_boveda_dia numeric(12,2) not null default 0;
alter table cierres_dia drop column boveda_diferencia, drop column boveda_esperado;
alter table cierres_dia
  add column boveda_esperado numeric(12,2)
    generated always as (boveda_inicial + retiros_dia - aperturas_dia - deposito_dia - gastos_boveda_dia) stored,
  add column boveda_diferencia numeric(12,2)
    generated always as (boveda_contado - (boveda_inicial + retiros_dia - aperturas_dia - deposito_dia - gastos_boveda_dia)) stored;

-- El gerente o el admin marcan que ya se le regresó el dinero al empleado.
create or replace function marcar_repuesto(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare g gastos_caja_chica;
begin
  if mi_rol()::text = 'corporativo' then raise exception 'Corporativo solo puede consultar.'; end if;
  if mi_rol() not in ('gerente', 'admin') then raise exception 'Solo el gerente o el admin marcan un gasto como repuesto'; end if;
  select * into g from gastos_caja_chica where id = p_id for update;
  if not found then raise exception 'Gasto no encontrado'; end if;
  if g.sucursal_id <> mi_sucursal() and mi_rol() <> 'admin' then raise exception 'El gasto es de otra sucursal'; end if;
  if g.origen <> 'empleado' then raise exception 'Solo los gastos que pagó un empleado se reponen'; end if;
  if g.repuesto_en is not null then raise exception 'Este gasto ya estaba repuesto'; end if;
  update gastos_caja_chica set repuesto_por = auth.uid(), repuesto_en = now() where id = p_id;
end $$;
revoke execute on function marcar_repuesto(uuid) from public, anon;
grant execute on function marcar_repuesto(uuid) to authenticated;
