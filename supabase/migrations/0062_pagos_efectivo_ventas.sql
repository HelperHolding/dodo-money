begin;
set local lock_timeout='5s';
alter table public.pagos drop constraint pagos_origen_fondos_check;
alter table public.pagos add constraint pagos_origen_fondos_check check(origen_fondos in ('transferencia','boveda','ventas'));
alter table public.pagos add column turno_ventas_id uuid references public.turnos(id),add column arqueo_ventas_id uuid references public.arqueos(id);
create table public.pagos_ventas_eventos (
 id uuid primary key default gen_random_uuid(),pago_id uuid not null references public.pagos(id),turno_id uuid not null references public.turnos(id),sucursal_id uuid not null references public.sucursales(id),tipo text not null check(tipo in ('pago','anulacion')),
 importe numeric(12,2) not null,fecha_operativa date not null,creado_en timestamptz not null default now(),usuario_id uuid not null default auth.uid() references public.perfiles(id),unique(pago_id,tipo),check((tipo='pago' and importe>0) or (tipo='anulacion' and importe<0))
);
alter table public.pagos_ventas_eventos enable row level security;
create policy pagos_ventas_consulta on public.pagos_ventas_eventos for select using(public.ve_todas_las_sucursales() or sucursal_id=public.mi_sucursal());
revoke all on public.pagos_ventas_eventos from public,anon,authenticated;grant select on public.pagos_ventas_eventos to authenticated;
alter table public.arqueos add column pagos_ventas numeric(12,2) not null default 0;
alter table public.arqueos drop column diferencia,drop column esperado;
alter table public.arqueos add column esperado numeric(12,2) generated always as (fondo_inicial+ventas_efectivo-retiros_boveda-pagos_ventas) stored,
 add column diferencia numeric(12,2) generated always as (total_contado-(fondo_inicial+ventas_efectivo-retiros_boveda-pagos_ventas)) stored;
alter table public.cierres_dia add column gastos_ventas_dia numeric(12,2) not null default 0;
create function public.disponibilidad_ventas(p_turno uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare t public.turnos;a public.arqueos;fondo numeric;retirado numeric;pagado numeric;pendiente numeric;saldo numeric;
begin
 select * into t from public.turnos where id=p_turno;
 if not found or not coalesce(public.ve_todas_las_sucursales() or t.sucursal_id=public.mi_sucursal(),false) then raise exception 'Turno sin acceso.';end if;
 select fondo_caja_venta into fondo from public.sucursales where id=t.sucursal_id;
 select * into a from public.arqueos where turno_id=t.id and anulado_en is null and recibido_en is not null and momento<>'cierre' order by creado_en desc,id desc limit 1;
 if not found or t.cerrado_en is not null then return jsonb_build_object('turno',t.id,'disponible',0,'arqueo',null);end if;
 fondo:=greatest(fondo,a.fondo_inicial);
 select coalesce(sum(monto) filter(where estado='confirmado'),0),coalesce(sum(monto) filter(where estado='pendiente'),0) into retirado,pendiente from public.movimientos where turno_id=t.id and tipo='retiro_boveda';
 select coalesce(sum(importe),0) into pagado from public.pagos_ventas_eventos where turno_id=t.id;
 saldo:=a.total_contado-greatest(0,retirado-a.retiros_boveda)-(pagado-a.pagos_ventas)-pendiente;
 return jsonb_build_object('turno',t.id,'arqueo',a.id,'contado',a.total_contado,'fondo',fondo,'saldo',saldo,'disponible',greatest(0,saldo-fondo));
end $$;
create function public.registrar_pago_ventas(p_datos jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare solicitud uuid;previo public.pagos;t public.turnos;d jsonb;v uuid;m numeric;fid uuid;op date;arqueo_original uuid;
begin
 perform public.exigir_admin_compras();
 solicitud:=nullif(p_datos->>'solicitud','')::uuid;
 if solicitud is null then raise exception 'Falta solicitud de pago.';end if;
 perform pg_advisory_xact_lock(hashtextextended('pago-origen:'||solicitud,0));
 select * into previo from public.pagos where solicitud_id=solicitud;
 if found then if previo.solicitud_datos is distinct from p_datos then raise exception 'Esta solicitud ya corresponde a otro pago.';end if;return previo.id;end if;
 if p_datos->>'origen' is distinct from 'ventas' or length(trim(coalesce(p_datos->>'nota',''))) not between 5 and 1000 or nullif(p_datos->>'comprobante','') is null then raise exception 'El pago de ventas necesita origen, motivo y ticket.';end if;
 if jsonb_typeof(p_datos->'aplicaciones') is distinct from 'array' or jsonb_array_length(p_datos->'aplicaciones')<>1 then raise exception 'El efectivo de ventas paga una factura por operación.';end if;
 d:=public.disponibilidad_ventas(nullif(p_datos->>'turno','')::uuid);
 arqueo_original:=nullif(d->>'arqueo','')::uuid;
 perform 1 from public.arqueos where id=arqueo_original for update;
 select * into t from public.turnos where id=nullif(p_datos->>'turno','')::uuid for update;
 op:=((now() at time zone 'America/Mexico_City')-interval '4 hours')::date;
 if not found or t.cerrado_en is not null or t.fecha<>op or (p_datos->>'fecha')::date is distinct from public.hoy_mx() or exists(select 1 from public.cierres_dia where sucursal_id=t.sucursal_id and fecha=op) then raise exception 'Selecciona un turno abierto del día operativo actual.';end if;
 fid:=(p_datos->'aplicaciones'->0->>'factura_id')::uuid;
 perform 1 from public.facturas where id=fid and sucursal_id=t.sucursal_id;
 if not found then raise exception 'La factura debe corresponder a la sucursal de la caja.';end if;
 d:=public.disponibilidad_ventas(t.id);m:=(p_datos->>'monto')::numeric;
 if nullif(d->>'arqueo','')::uuid is distinct from arqueo_original or d->>'arqueo' is null or m is null or m<=0 or m<>round(m,2) or m>(d->>'disponible')::numeric then raise exception 'El conteo confirmado cambió o no cubre el pago y el fondo. Registra y confirma un arqueo actualizado.';end if;
 v:=public.registrar_pago((p_datos->>'proveedor')::uuid,(p_datos->>'fecha')::date,m,'efectivo','Caja de ventas',p_datos->>'referencia',p_datos->>'comprobante',p_datos->'aplicaciones',p_datos->>'motivo');
 update public.pagos set origen_fondos='ventas',turno_ventas_id=t.id,arqueo_ventas_id=(d->>'arqueo')::uuid,nota_boveda=trim(p_datos->>'nota'),solicitud_id=solicitud,solicitud_datos=p_datos where id=v;
 insert into public.pagos_ventas_eventos(pago_id,turno_id,sucursal_id,tipo,importe,fecha_operativa) values(v,t.id,t.sucursal_id,'pago',m,op);
 return v;
end $$;
create function public.control_efectivo_ventas() returns trigger language plpgsql security definer set search_path=public as $$
declare t public.turnos;d jsonb;op date;
begin
 if tg_table_name='arqueos' then
  if tg_op='UPDATE' then
   perform 1 from public.turnos where id=new.turno_id for update;
   if old.anulado_en is null and new.anulado_en is not null and exists(select 1 from public.pagos where arqueo_ventas_id=old.id) then raise exception 'Este arqueo respalda un pago. Conserva la fuente y registra un nuevo conteo.';end if;
  else
   perform 1 from public.turnos where id=new.turno_id for update;
   select coalesce(sum(importe),0) into new.pagos_ventas from public.pagos_ventas_eventos where turno_id=new.turno_id;
  end if;
 elsif tg_table_name='cierres_dia' then
  perform 1 from public.turnos where sucursal_id=new.sucursal_id and fecha=new.fecha order by id for update;
  select coalesce(sum(importe),0) into new.gastos_ventas_dia from public.pagos_ventas_eventos where sucursal_id=new.sucursal_id and fecha_operativa=new.fecha;
 elsif tg_table_name='movimientos' then
  if new.tipo='retiro_boveda' and new.estado<>'rechazado' and new.turno_id is not null then
   select * into t from public.turnos where id=new.turno_id for update;
   if t.cerrado_en is null and not exists(select 1 from public.arqueos where turno_id=t.id and momento='cierre' and anulado_en is null) and exists(select 1 from public.pagos_ventas_eventos where turno_id=t.id) then
    d:=public.disponibilidad_ventas(t.id);
    if tg_op='UPDATE' then d:=jsonb_set(d,'{disponible}',to_jsonb((d->>'disponible')::numeric+old.monto));end if;
    if new.monto>(d->>'disponible')::numeric then raise exception 'El retiro excede el conteo disponible después de los pagos de ventas.';end if;
   end if;
  end if;
 elsif tg_table_name='pagos' then
  if old.anulado_en is null and new.anulado_en is not null and old.origen_fondos='ventas' then
   select * into t from public.turnos where id=old.turno_ventas_id for update;
   op:=((now() at time zone 'America/Mexico_City')-interval '4 hours')::date;
   if t.cerrado_en is null and t.fecha=op then
    insert into public.pagos_ventas_eventos(pago_id,turno_id,sucursal_id,tipo,importe,fecha_operativa) values(old.id,t.id,t.sucursal_id,'anulacion',-old.monto,op);
   else
    perform 1 from public.cajas where sucursal_id=t.sucursal_id and tipo='boveda' for update;
    if exists(select 1 from public.cierres_dia where sucursal_id=t.sucursal_id and fecha=op) then raise exception 'El día está cerrado; devuelve el efectivo al iniciar el siguiente.';end if;
    insert into public.pagos_boveda_eventos(pago_id,sucursal_id,tipo,importe,fecha_operativa) values(old.id,t.sucursal_id,'anulacion',-old.monto,op);
   end if;
  end if;
 end if;
 return new;
end $$;
create trigger control_pagos_ventas_arqueo before insert or update of anulado_en on public.arqueos for each row execute function public.control_efectivo_ventas();
create trigger control_pagos_ventas_cierre before insert on public.cierres_dia for each row execute function public.control_efectivo_ventas();
create trigger control_pagos_ventas_movimiento before insert or update of estado on public.movimientos for each row execute function public.control_efectivo_ventas();
create trigger control_pagos_ventas_anulacion after update of anulado_en on public.pagos for each row execute function public.control_efectivo_ventas();
revoke all on function public.control_efectivo_ventas() from public,anon,authenticated;
revoke all on function public.disponibilidad_ventas(uuid),public.registrar_pago_ventas(jsonb) from public,anon;
grant execute on function public.disponibilidad_ventas(uuid),public.registrar_pago_ventas(jsonb) to authenticated;
commit;
