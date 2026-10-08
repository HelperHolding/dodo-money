begin;
-- Reserva para una factura concreta: dinero adicional al fondo, aún dentro de bóveda.
create table public.reservas_boveda (
 id uuid primary key default gen_random_uuid(),
 sucursal_id uuid not null references public.sucursales(id),
 factura_id uuid not null references public.facturas(id),
 monto numeric(12,2) not null check(monto>0 and monto<1e10),
 motivo text not null check(length(trim(motivo)) between 5 and 1000),
 fecha_pago date not null,
 creado_por uuid not null default auth.uid() references public.perfiles(id),
 creado_en timestamptz not null default now(),
 anulado_en timestamptz, anulado_por uuid references public.perfiles(id), motivo_anulacion text,
 check(anulado_en is null or length(trim(motivo_anulacion))>=5)
);
alter table public.pagos add column origen_fondos text check(origen_fondos in ('transferencia','boveda')),
 add column solicitud_id uuid unique, add column solicitud_datos jsonb,
 add column reserva_boveda_id uuid references public.reservas_boveda(id);
-- Los pagos históricos conservan origen desconocido: no se infiere de un texto libre.
create table public.pagos_boveda_eventos (
 id uuid primary key default gen_random_uuid(), pago_id uuid not null references public.pagos(id),
 sucursal_id uuid not null references public.sucursales(id),
 tipo text not null check(tipo in ('pago','anulacion')),
 importe numeric(12,2) not null,
 fecha_operativa date not null,
 creado_en timestamptz not null default now(), usuario_id uuid not null default auth.uid() references public.perfiles(id),
 unique(pago_id,tipo),
 check((tipo='pago' and importe>0) or (tipo='anulacion' and importe<0))
);
alter table public.reservas_boveda enable row level security;
alter table public.pagos_boveda_eventos enable row level security;
create index reservas_boveda_sucursal on public.reservas_boveda(sucursal_id) where anulado_en is null;
create index reservas_boveda_factura on public.reservas_boveda(factura_id);
create index pagos_reserva_boveda on public.pagos(reserva_boveda_id) where reserva_boveda_id is not null;
create index eventos_boveda_fecha on public.pagos_boveda_eventos(sucursal_id,fecha_operativa);
create policy ver_reservas_boveda on public.reservas_boveda for select using (
 public.ve_todas_las_sucursales() or sucursal_id=public.mi_sucursal());
create policy ver_eventos_boveda on public.pagos_boveda_eventos for select using (
 public.ve_todas_las_sucursales() or sucursal_id=public.mi_sucursal());
revoke all on public.reservas_boveda,public.pagos_boveda_eventos from public,anon,authenticated;
grant select on public.reservas_boveda,public.pagos_boveda_eventos to authenticated;
create view public.reservas_boveda_saldo with(security_invoker=true) as
 select r.*, greatest(0,r.monto-coalesce((select sum(p.monto) from public.pagos p
 where p.reserva_boveda_id=r.id and p.anulado_en is null),0)) as pendiente
 from public.reservas_boveda r;
grant select on public.reservas_boveda_saldo to authenticated;
-- El libro de efectivo guarda el pago y, al anularlo, una devolución en el día actual.
create or replace view public.saldos_cajas with(security_invoker=true) as
select c.id as caja_id,c.sucursal_id,c.tipo,c.nombre,
 c.saldo_inicial
 +coalesce((select sum(m.monto) from public.movimientos m where m.caja_destino_id=c.id and m.estado='confirmado' and m.tipo<>'cambio_morralla'),0)
 -coalesce((select sum(m.monto) from public.movimientos m where m.caja_origen_id=c.id and m.estado='confirmado' and m.tipo<>'cambio_morralla'),0)
 -case when c.tipo in ('caja_chica','boveda') then coalesce((select sum(g.monto) from public.gastos_caja_chica g
 where g.sucursal_id=c.sucursal_id and g.origen::text=c.tipo::text),0) else 0 end
 -case when c.tipo='boveda' then coalesce((select sum(e.importe) from public.pagos_boveda_eventos e where e.sucursal_id=c.sucursal_id),0) else 0 end as saldo
from public.cajas c where c.tipo in ('boveda','caja_chica','cambios');

create function public.disponibilidad_boveda(p_sucursal uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare saldo numeric; fondo numeric; reservado numeric; salidas numeric;
begin
 if not coalesce(public.ve_todas_las_sucursales() or p_sucursal=public.mi_sucursal(),false) then raise exception 'Sucursal sin acceso.';end if;
 select s.fondo_boveda,c.saldo into fondo,saldo from public.sucursales s
 join public.saldos_cajas c on c.sucursal_id=s.id and c.tipo='boveda' where s.id=p_sucursal;
 if not found then raise exception 'Falta la caja de bóveda.';end if;
 select coalesce(sum(pendiente),0) into reservado from public.reservas_boveda_saldo where sucursal_id=p_sucursal and anulado_en is null;
 select coalesce(sum(monto),0) into salidas from public.movimientos where sucursal_id=p_sucursal and tipo='salida_corporativo' and estado='pendiente';
 return jsonb_build_object('saldo',saldo,'fondo',fondo,'reservado',reservado,'salidas',salidas,'disponible',greatest(0,saldo-fondo-reservado-salidas));
end $$;
revoke all on function public.disponibilidad_boveda(uuid) from public,anon;
grant execute on function public.disponibilidad_boveda(uuid) to authenticated;

create function public.reservar_boveda(p_sucursal uuid,p_factura uuid,p_monto numeric,p_fecha date,p_motivo text) returns uuid
language plpgsql security definer set search_path='' as $$
declare f public.facturas; d jsonb; v uuid; saldo numeric;
begin
 perform public.exigir_admin_compras();
 if p_monto is null or p_monto<=0 or p_monto>=1e10 or p_monto<>round(p_monto,2) then raise exception 'Monto de reserva inválido.';end if;
 if p_fecha is null or p_fecha<public.hoy_mx() then raise exception 'La reserva necesita fecha de pago de hoy o posterior.';end if;
 if length(trim(coalesce(p_motivo,''))) not between 5 and 1000 then raise exception 'Explica el motivo de la reserva (5 a 1000 caracteres).';end if;
 perform 1 from public.cajas where sucursal_id=p_sucursal and tipo='boveda' for update;
 if not found then raise exception 'Falta la caja de bóveda.';end if;
 select * into f from public.facturas where id=p_factura for update;
 if not found or f.tipo<>'ingreso' or f.estado not in ('por_pagar','parcial') then raise exception 'Elige una factura por pagar.';end if;
 if f.sucursal_id is not null and f.sucursal_id<>p_sucursal then raise exception 'La factura es de otra sucursal.';end if;
 saldo:=public.saldo_factura(p_factura);
 if p_monto+coalesce((select sum(pendiente) from public.reservas_boveda_saldo where factura_id=p_factura and anulado_en is null),0)>saldo then raise exception 'Las reservas exceden el saldo de la factura.';end if;
 d:=public.disponibilidad_boveda(p_sucursal);
 if p_monto>(d->>'disponible')::numeric then raise exception 'No hay efectivo libre: conserva el fondo y las salidas y reservas existentes.';end if;
 insert into public.reservas_boveda(sucursal_id,factura_id,monto,fecha_pago,motivo) values(p_sucursal,p_factura,p_monto,p_fecha,trim(p_motivo)) returning id into v;
 return v;
end $$;
create function public.cancelar_reserva_boveda(p_id uuid,p_motivo text) returns void
language plpgsql security definer set search_path='' as $$
declare s uuid;
begin
 perform public.exigir_admin_compras();
 if length(trim(coalesce(p_motivo,''))) not between 5 and 1000 then raise exception 'Explica por qué liberas la reserva.';end if;
 select sucursal_id into s from public.reservas_boveda where id=p_id;
 perform 1 from public.cajas where sucursal_id=s and tipo='boveda' for update;
 update public.reservas_boveda set anulado_en=now(),anulado_por=auth.uid(),motivo_anulacion=trim(p_motivo) where id=p_id and anulado_en is null;
 if not found then raise exception 'La reserva no existe o ya está cancelada.';end if;
end $$;
revoke all on function public.reservar_boveda(uuid,uuid,numeric,date,text),public.cancelar_reserva_boveda(uuid,text) from public,anon;
grant execute on function public.reservar_boveda(uuid,uuid,numeric,date,text),public.cancelar_reserva_boveda(uuid,text) to authenticated;

create or replace function public.registrar_pago_con_origen(p_datos jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.reservas_boveda; d jsonb; v uuid; monto numeric; v_fecha date; op date; solicitud uuid; previo public.pagos;
begin
 perform public.exigir_admin_compras();
 solicitud:=nullif(p_datos->>'solicitud','')::uuid;
 if solicitud is null then raise exception 'Falta el identificador de la solicitud de pago.';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pago-origen:'||solicitud::text,0));
 select * into previo from public.pagos where solicitud_id=solicitud;
 if found then
  if previo.solicitud_datos is distinct from p_datos then raise exception 'Esta solicitud ya registró otro pago. Recarga el formulario.';end if;
  return previo.id;
 end if;
 if p_datos->>'origen' is null or p_datos->>'origen' not in ('transferencia','boveda') then raise exception 'Elige transferencia o bóveda.';end if;
 monto:=(p_datos->>'monto')::numeric;v_fecha:=(p_datos->>'fecha')::date;
 if monto is null or monto<=0 or monto>=1e10 or monto<>round(monto,2) then raise exception 'Monto de pago inválido.';end if;
 if p_datos->>'origen'='transferencia' then
  if length(trim(coalesce(p_datos->>'cuenta','')))<2 then raise exception 'Especifica la cuenta de transferencia.';end if;
  if nullif(p_datos->>'reserva','') is not null then raise exception 'Una transferencia no usa reserva de bóveda.';end if;
 else
  select * into r from public.reservas_boveda where id=nullif(p_datos->>'reserva','')::uuid;
  if not found then raise exception 'Elige una reserva de bóveda.';end if;
  perform 1 from public.cajas where sucursal_id=r.sucursal_id and tipo='boveda' for update;
  select * into r from public.reservas_boveda where id=r.id for update;
  if r.anulado_en is not null then raise exception 'La reserva está cancelada.';end if;
  if v_fecha is distinct from public.hoy_mx() then raise exception 'El pago de bóveda se registra hoy, cuando sale el efectivo.';end if;
  op:=((now() at time zone 'America/Mexico_City')-interval '4 hours')::date;
  if exists(select 1 from public.cierres_dia c where c.sucursal_id=r.sucursal_id and c.fecha=op) then raise exception 'El día operativo está cerrado; registra el pago al iniciar el siguiente.';end if;
  if jsonb_array_length(p_datos->'aplicaciones')<>1 or (p_datos->'aplicaciones'->0->>'factura_id')::uuid is distinct from r.factura_id then raise exception 'La reserva paga solo su factura.';end if;
  if monto>(select pendiente from public.reservas_boveda_saldo where id=r.id) then raise exception 'El pago excede lo pendiente de la reserva.';end if;
  d:=public.disponibilidad_boveda(r.sucursal_id);
  if (d->>'saldo')::numeric-monto<(d->>'fondo')::numeric+(d->>'salidas')::numeric+(d->>'reservado')::numeric-monto then raise exception 'La bóveda ya no cubre su fondo y los compromisos.';end if;
 end if;
 v:=public.registrar_pago((p_datos->>'proveedor')::uuid,v_fecha,monto,
 case when p_datos->>'origen'='boveda' then 'efectivo' else 'transferencia' end,
 case when p_datos->>'origen'='boveda' then 'Bóveda' else p_datos->>'cuenta' end,
 p_datos->>'referencia',p_datos->>'comprobante',p_datos->'aplicaciones',p_datos->>'motivo');
 update public.pagos set origen_fondos=p_datos->>'origen',solicitud_id=solicitud,solicitud_datos=p_datos,reserva_boveda_id=case when r.id is not null then r.id end where id=v;
 if r.id is not null then
  insert into public.pagos_boveda_eventos(pago_id,sucursal_id,tipo,importe,fecha_operativa) values(v,r.sucursal_id,'pago',monto,op);
 end if;
 return v;
end $$;
revoke all on function public.registrar_pago_con_origen(jsonb) from public,anon;
grant execute on function public.registrar_pago_con_origen(jsonb) to authenticated;
-- Anulación conserva el pago y agrega devolución actual. No reescribe cortes anteriores.
create function public.devolver_pago_boveda() returns trigger
language plpgsql security definer set search_path='' as $$
declare s uuid;op date;
begin
 if old.anulado_en is null and new.anulado_en is not null and old.reserva_boveda_id is not null then
  select sucursal_id into s from public.reservas_boveda where id=old.reserva_boveda_id;
  perform 1 from public.cajas where sucursal_id=s and tipo='boveda' for update;
  op:=((now() at time zone 'America/Mexico_City')-interval '4 hours')::date;
  if exists(select 1 from public.cierres_dia where sucursal_id=s and fecha=op) then raise exception 'El día operativo está cerrado; anula al iniciar el siguiente.';end if;
  insert into public.pagos_boveda_eventos(pago_id,sucursal_id,tipo,importe,fecha_operativa) values(old.id,s,'anulacion',-old.monto,op);
 end if;
 return new;
end $$;
create trigger devolver_pago_boveda after update of anulado_en on public.pagos for each row execute function public.devolver_pago_boveda();
revoke all on function public.devolver_pago_boveda() from public,anon,authenticated;

-- Impide que salidas a corporativo consuman el fondo o lo reservado, incluso vía SQL directo.
create function public.proteger_reserva_movimiento() returns trigger
language plpgsql security definer set search_path='' as $$
declare d jsonb; limite numeric;
begin
 if not exists(select 1 from public.cajas where id=new.caja_origen_id and tipo='boveda') then return new;end if;
 if new.estado='rechazado' then return new;end if;
 if tg_op='UPDATE' and old.estado='confirmado' then return new;end if;
 perform 1 from public.cajas where id=new.caja_origen_id for update;
 d:=public.disponibilidad_boveda(new.sucursal_id);
 limite:=(d->>'saldo')::numeric-(d->>'reservado')::numeric-(d->>'salidas')::numeric;
 if tg_op='UPDATE' and old.estado='pendiente' and old.tipo='salida_corporativo' then limite:=limite+old.monto;end if;
 if new.tipo='salida_corporativo' then limite:=limite-(d->>'fondo')::numeric;end if;
 if new.monto>limite then raise exception 'El movimiento usaría efectivo reservado o el fondo protegido de bóveda.';end if;
 return new;
end $$;
create trigger proteger_reserva_movimiento before insert or update of estado,monto on public.movimientos for each row execute function public.proteger_reserva_movimiento();
revoke all on function public.proteger_reserva_movimiento() from public,anon,authenticated;
create function public.proteger_reserva_gasto() returns trigger
language plpgsql security definer set search_path='' as $$
declare d jsonb;
begin
 if new.origen<>'boveda' then return new;end if;
 perform 1 from public.cajas where sucursal_id=new.sucursal_id and tipo='boveda' for update;
 d:=public.disponibilidad_boveda(new.sucursal_id);
 if new.monto>(d->>'saldo')::numeric-(d->>'reservado')::numeric-(d->>'salidas')::numeric then raise exception 'El gasto usaría efectivo reservado.';end if;
 return new;
end $$;
create trigger proteger_reserva_gasto before insert on public.gastos_caja_chica for each row execute function public.proteger_reserva_gasto();
revoke all on function public.proteger_reserva_gasto() from public,anon,authenticated;
-- Serializa el corte con pagos de bóveda y recalcula sus egresos de efectivo.
create function public.incluir_pagos_boveda_corte() returns trigger
language plpgsql security definer set search_path='' as $$
declare desde timestamptz;hasta timestamptz;
begin
 perform 1 from public.cajas where sucursal_id=new.sucursal_id and tipo='boveda' for update;
 desde:=(new.fecha::timestamp+interval '4 hours') at time zone 'America/Mexico_City';
 hasta:=desde+interval '1 day';
 new.gastos_boveda_dia:=coalesce((select sum(monto) from public.gastos_caja_chica where sucursal_id=new.sucursal_id and origen='boveda' and creado_en>=desde and creado_en<hasta),0)
 +coalesce((select sum(importe) from public.pagos_boveda_eventos where sucursal_id=new.sucursal_id and fecha_operativa=new.fecha),0);
 return new;
end $$;
create trigger incluir_pagos_boveda_corte before insert on public.cierres_dia for each row execute function public.incluir_pagos_boveda_corte();
revoke all on function public.incluir_pagos_boveda_corte() from public,anon,authenticated;
commit;
