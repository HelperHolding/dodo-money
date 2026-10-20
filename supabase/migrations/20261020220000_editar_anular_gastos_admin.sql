begin;
set local lock_timeout='5s';
alter table public.gastos_caja_chica add column version bigint not null default 1,
 add column anulado_en timestamptz,add column anulado_por uuid references public.perfiles(id),add column motivo_anulacion text;
alter table public.gastos_caja_chica add constraint gasto_anulado_con_autor check(
 (anulado_en is null and anulado_por is null and motivo_anulacion is null)
 or(anulado_en is not null and anulado_por is not null and length(trim(motivo_anulacion)) between 5 and 1000));
create table public.gastos_historial (
 id uuid primary key,gasto_id uuid not null references public.gastos_caja_chica(id),autor_id uuid not null references public.perfiles(id),
 accion text not null,motivo text not null,solicitud jsonb not null,antes jsonb not null,despues jsonb not null,creado_en timestamptz not null default now()
);
alter table public.gastos_historial enable row level security;
revoke all on public.gastos_historial from public,anon,authenticated;
grant select on public.gastos_historial to authenticated;
create policy gastos_historial_consulta on public.gastos_historial for select to authenticated
 using(exists(select 1 from public.gastos_caja_chica g where g.id=gasto_id));

create function public.versionar_gasto_admin() returns trigger language plpgsql set search_path='' as $$
begin
 if old.anulado_en is not null then raise exception 'El gasto eliminado conserva su historial y no se modifica.';end if;
 new.version:=old.version+1;
 return new;
end $$;
create trigger versionar_gasto_admin before update on public.gastos_caja_chica for each row execute function public.versionar_gasto_admin();
revoke all on function public.versionar_gasto_admin() from public,anon,authenticated;
create or replace function public.proteger_gasto_informativo() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' and public.mi_rol()::text='admin' and current_setting('dodo.editar_gasto_admin',true)='si' then return new;end if;
 raise exception 'Un gasto informativo conserva su registro original y respaldo; usa la corrección administrativa.';
end $$;

create function public.editar_anular_gasto_admin(p_solicitud uuid,p_id uuid,p_version bigint,p_accion text,p_datos jsonb,p_motivo text) returns uuid
language plpgsql security definer set search_path='' as $$
declare g public.gastos_caja_chica;h public.gastos_historial;antes jsonb;despues jsonb;sol jsonb;
 f date;m numeric;o text;c text;u text;cu text;persona uuid;delta boolean;d jsonb;saldo numeric;
begin
 if public.mi_rol()::text is distinct from 'admin' then raise exception 'Solo administración edita o elimina gastos.';end if;
 if p_solicitud is null or p_id is null or p_version is null or p_accion is null or p_accion not in ('editar','eliminar') or length(trim(coalesce(p_motivo,''))) not between 5 and 1000 then raise exception 'Revisa solicitud, gasto, acción y motivo.';end if;
 sol:=jsonb_build_object('gasto',p_id,'version',p_version,'accion',p_accion,'datos',coalesce(p_datos,'{}'),'motivo',trim(p_motivo));
 perform pg_advisory_xact_lock(hashtextextended('gasto-admin:'||p_solicitud,0));
 select * into h from public.gastos_historial where id=p_solicitud;
 if found then
  if h.autor_id<>auth.uid() or h.solicitud is distinct from sol then raise exception 'Esta solicitud pertenece a otra corrección.';end if;
  return h.gasto_id;
 end if;
 select * into g from public.gastos_caja_chica where id=p_id;
 if not found then raise exception 'Gasto no encontrado.';end if;
 perform 1 from public.cajas where sucursal_id=g.sucursal_id order by (tipo='boveda') desc,id for update;
 select * into g from public.gastos_caja_chica where id=p_id for update;
 if g.anulado_en is not null then raise exception 'El gasto ya fue eliminado.';end if;
 if g.version<>p_version then raise exception 'El gasto cambió. Recarga antes de corregirlo.';end if;
 antes:=to_jsonb(g);
 if p_accion='editar' then
  f:=(p_datos->>'fecha')::date;m:=(p_datos->>'monto')::numeric;o:=p_datos->>'origen';c:=p_datos->>'comprobante';
  u:=nullif(upper(trim(p_datos->>'uuid_cfdi')),'');cu:=p_datos->>'cuenta_pl';persona:=nullif(p_datos->>'pagado_por','')::uuid;
  if f is null or f>public.hoy_mx() or m is null or m<=0 or m>=1e10 or m<>round(m,2) then raise exception 'Revisa fecha e importe, con dos decimales y sin fechas futuras.';end if;
  if g.informativo and f>=public.hoy_mx() then raise exception 'Un gasto informativo debe conservar una fecha anterior a hoy.';end if;
  if length(trim(coalesce(p_datos->>'concepto',''))) not between 1 and 500 or length(coalesce(p_datos->>'proveedor',''))>300 then raise exception 'Revisa concepto y proveedor.';end if;
  if o is null or o not in ('caja_chica','boveda','empleado') or c is null or c not in ('cfdi','nota','sin_comprobante') then raise exception 'Origen o comprobante inválido.';end if;
  if cu is null or cu not in ('repartidores','marketing_agregadores','marketing','renta','servicios','mantenimiento','consumibles_equipo','otros') then raise exception 'Cuenta del P&L inválida.';end if;
  if (c='cfdi' and u is null) or (u is not null and u!~'^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$') then raise exception 'Con factura se necesita un UUID válido.';end if;
  if u is not null and (exists(select 1 from public.gastos_caja_chica x where x.id<>g.id and upper(x.uuid_cfdi)=u) or exists(select 1 from public.facturas x where upper(x.uuid::text)=u)) then raise exception 'Este UUID ya está registrado.';end if;
  if o='empleado' and not exists(select 1 from public.perfiles where id=persona and sucursal_id=g.sucursal_id) then raise exception 'Selecciona una persona de la sucursal.';end if;
  delta:=m<>g.monto or o<>g.origen::text or (o='empleado' and persona is distinct from g.pagado_por);
 else delta:=true;
 end if;
 if delta and (g.repuesto_en is not null or g.reposicion_id is not null or (g.origen='caja_chica' and not g.informativo and exists(select 1 from public.movimientos where sucursal_id=g.sucursal_id and tipo='reposicion_caja_chica' and estado<>'rechazado' and creado_en>=g.creado_en))) then
  raise exception 'El gasto tiene reposición o reembolso. Corrige primero esa operación para no duplicar el efectivo.';
 end if;
 perform set_config('dodo.editar_gasto_admin','si',true);
 if p_accion='eliminar' then
  update public.gastos_caja_chica set anulado_en=now(),anulado_por=auth.uid(),motivo_anulacion=trim(p_motivo) where id=g.id;
 else
  update public.gastos_caja_chica set fecha=f,fecha_capturada_original=case when f<>g.fecha then coalesce(g.fecha_capturada_original,g.fecha) else g.fecha_capturada_original end,
   concepto=trim(p_datos->>'concepto'),proveedor=nullif(trim(p_datos->>'proveedor'),''),monto=m,origen=o::public.origen_gasto,
   pagado_por=case when o='empleado' then persona end,comprobante=c::public.tipo_comprobante,uuid_cfdi=u,cuenta_pl=cu where id=g.id;
  if not g.informativo and o='boveda' and (g.origen<>'boveda' or m>g.monto) then
   d:=public.disponibilidad_boveda(g.sucursal_id);
   if (d->>'saldo')::numeric<(d->>'fondo')::numeric+(d->>'reservado')::numeric+(d->>'salidas')::numeric then raise exception 'La corrección usaría fondo o efectivo reservado de bóveda.';end if;
  elsif not g.informativo and o='caja_chica' and (g.origen<>'caja_chica' or m>g.monto) then
   select s.saldo into saldo from public.saldos_cajas s where s.sucursal_id=g.sucursal_id and s.tipo='caja_chica';
   if saldo is null or saldo<0 then raise exception 'La corrección dejaría la caja chica sin efectivo suficiente.';end if;
  end if;
 end if;
 perform set_config('dodo.editar_gasto_admin','no',true);
 select to_jsonb(x) into despues from public.gastos_caja_chica x where x.id=g.id;
 insert into public.gastos_historial(id,gasto_id,autor_id,accion,motivo,solicitud,antes,despues) values(p_solicitud,g.id,auth.uid(),p_accion,trim(p_motivo),sol,antes,despues);
 return g.id;
end $$;
revoke all on function public.editar_anular_gasto_admin(uuid,uuid,bigint,text,jsonb,text) from public,anon;
grant execute on function public.editar_anular_gasto_admin(uuid,uuid,bigint,text,jsonb,text) to authenticated;

-- Las correcciones antiguas también quedan restringidas a administración.
do $$
declare firma text;def text;
begin
 foreach firma in array array['public.marcar_gasto_informativo(uuid,text,text,text,boolean)','public.corregir_fecha_gasto_informativo(uuid,date,text,text,text,boolean)'] loop
  def:=pg_get_functiondef(firma::regprocedure);
  if position('not in (''admin'',''gerente'')' in def)=0 then raise exception 'La función % cambió; revisar la migración.',firma;end if;
  execute replace(replace(def,'not in (''admin'',''gerente'')','<>''admin'''),'Solo administración o gerencia corrige gastos.','Solo administración corrige gastos.');
 end loop;
end $$;

-- Los eliminados quedan visibles en historial, pero no descuentan saldos ni nuevos cierres.
create or replace view public.saldos_cajas with(security_invoker=true) as
select c.id as caja_id,c.sucursal_id,c.tipo,c.nombre,c.saldo_inicial
 +coalesce((select sum(m.monto) from public.movimientos m where m.caja_destino_id=c.id and m.estado='confirmado' and m.tipo<>'cambio_morralla'),0)
 -coalesce((select sum(m.monto) from public.movimientos m where m.caja_origen_id=c.id and m.estado='confirmado' and m.tipo<>'cambio_morralla'),0)
 -case when c.tipo in ('caja_chica','boveda') then coalesce((select sum(g.monto) from public.gastos_caja_chica g where g.sucursal_id=c.sucursal_id and g.origen::text=c.tipo::text and not g.informativo and g.anulado_en is null),0) else 0 end
 -case when c.tipo='boveda' then coalesce((select sum(e.importe) from public.pagos_boveda_eventos e where e.sucursal_id=c.sucursal_id),0) else 0 end as saldo
from public.cajas c where c.tipo in ('boveda','caja_chica','cambios');
create or replace function public.incluir_pagos_boveda_corte() returns trigger language plpgsql security definer set search_path='' as $$
declare desde timestamptz;hasta timestamptz;
begin
 perform 1 from public.cajas where sucursal_id=new.sucursal_id and tipo='boveda' for update;
 desde:=(new.fecha::timestamp+interval '4 hours') at time zone 'America/Mexico_City';hasta:=desde+interval '1 day';
 new.gastos_boveda_dia:=coalesce((select sum(monto) from public.gastos_caja_chica where sucursal_id=new.sucursal_id and origen='boveda' and not informativo and anulado_en is null and creado_en>=desde and creado_en<hasta),0)
 +coalesce((select sum(importe) from public.pagos_boveda_eventos where sucursal_id=new.sucursal_id and fecha_operativa=new.fecha),0);
 return new;
end $$;
-- Ningún cliente obtiene escritura directa ni borrado físico.
revoke insert,update,delete on public.gastos_caja_chica from public,anon,authenticated;
commit;
