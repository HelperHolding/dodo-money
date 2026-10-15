begin;
set local lock_timeout='5s';
alter table public.gastos_caja_chica add column informativo boolean not null default false,
 add column motivo_informativo text,add column referencia_informativa text,
 add column informado_por uuid references public.perfiles(id),add column informado_en timestamptz,
 add column respaldo_informativo text,add column solicitud_id uuid unique,add column solicitud_datos jsonb;
alter table public.gastos_caja_chica add constraint gasto_informativo_respaldo check(
 (informativo and motivo_informativo is not null and length(trim(motivo_informativo)) between 10 and 1000 and referencia_informativa is not null and length(trim(referencia_informativa)) between 3 and 200 and informado_por is not null and informado_en is not null and respaldo_informativo is not null)
 or (not informativo and motivo_informativo is null and referencia_informativa is null and informado_por is null and informado_en is null and respaldo_informativo is null));
create unique index gastos_informativos_referencia on public.gastos_caja_chica(sucursal_id,lower(trim(coalesce(proveedor,''))),lower(trim(referencia_informativa))) where informativo;
revoke all on public.gastos_caja_chica from public,anon,authenticated;
grant select on public.gastos_caja_chica to authenticated;

-- Conserva las cifras de origen y el respaldo: la corrección solo cambia la clasificación de efectivo.
create function public.proteger_gasto_informativo() returns trigger language plpgsql set search_path='' as $$
begin
 if old.informativo then raise exception 'Un gasto informativo conserva su registro original y respaldo.';end if;
 return new;
end $$;
create trigger proteger_gasto_informativo before update or delete on public.gastos_caja_chica for each row when(old.informativo) execute function public.proteger_gasto_informativo();
revoke all on function public.proteger_gasto_informativo() from public,anon,authenticated;

create function public.registrar_gasto_sucursal(p_datos jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare v_s uuid;v_id uuid;v_solicitud uuid;v_prev public.gastos_caja_chica;v_monto numeric;v_fecha date;v_info boolean;v_cuenta text;v_origen text;v_uuid text;
begin
 v_s:=nullif(p_datos->>'sucursal','')::uuid;
 if public.mi_rol() is null or public.mi_rol()::text='corporativo' or not coalesce(public.mi_rol()::text='admin' or v_s=public.mi_sucursal(),false) then raise exception 'Sucursal sin permiso para registrar gastos.';end if;
 v_solicitud:=nullif(p_datos->>'solicitud','')::uuid;
 if v_solicitud is null then raise exception 'Falta identificador de solicitud.';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('gasto:'||v_solicitud::text,0));
 select * into v_prev from public.gastos_caja_chica where solicitud_id=v_solicitud;
 if found then
  if (v_prev.solicitud_datos-'foto_path') is distinct from (p_datos-'foto_path') then raise exception 'Esta solicitud ya registró otro gasto.';end if;
  return v_prev.id;
 end if;
 v_monto:=(p_datos->>'monto')::numeric;v_fecha:=(p_datos->>'fecha')::date;v_info:=coalesce((p_datos->>'informativo')::boolean,false);v_cuenta:=p_datos->>'cuenta_pl';v_origen:=p_datos->>'origen';v_uuid:=nullif(trim(p_datos->>'uuid_cfdi'),'');
 if v_monto is null or v_monto<=0 or v_monto>=1e10 or v_monto<>round(v_monto,2) then raise exception 'Monto inválido.';end if;
 if v_fecha is null or v_fecha>public.hoy_mx() then raise exception 'La fecha no puede ser futura.';end if;
 if length(trim(coalesce(p_datos->>'concepto','')))=0 then raise exception 'Escribe el concepto del gasto.';end if;
 if v_origen is null or v_origen not in ('caja_chica','boveda','empleado') then raise exception 'Elige el origen del dinero.';end if;
 if v_cuenta is null or v_cuenta not in ('repartidores','marketing_agregadores','marketing','renta','servicios','mantenimiento','consumibles_equipo','otros') then raise exception 'Elige una cuenta del P&L.';end if;
 if p_datos->>'comprobante' is null or p_datos->>'comprobante' not in ('cfdi','nota','sin_comprobante') or (p_datos->>'comprobante'='cfdi' and v_uuid is null) then raise exception 'Comprobante inválido; con CFDI se necesita UUID.';end if;
 if v_info and (v_fecha>=public.hoy_mx() or p_datos->>'confirmado' is distinct from 'si' or length(trim(coalesce(p_datos->>'motivo',''))) not between 10 and 1000 or length(trim(coalesce(p_datos->>'referencia',''))) not between 3 and 200 or nullif(p_datos->>'foto_path','') is null) then raise exception 'El informativo requiere fecha anterior, confirmación, motivo, referencia del corte y foto del respaldo.';end if;
 if v_info and exists(select 1 from public.gastos_caja_chica where sucursal_id=v_s and fecha=v_fecha and monto=v_monto and lower(trim(concepto))=lower(trim(p_datos->>'concepto')) and lower(trim(coalesce(proveedor,'')))=lower(trim(coalesce(p_datos->>'proveedor','')))) then raise exception 'Ya existe un gasto igual. Corrige ese registro en lugar de capturarlo otra vez.';end if;
 if v_uuid is not null and (exists(select 1 from public.gastos_caja_chica where lower(uuid_cfdi)=lower(v_uuid)) or exists(select 1 from public.facturas where lower(uuid::text)=lower(v_uuid))) then raise exception 'Este UUID ya está registrado. Revisa el gasto o factura existente.';end if;
 insert into public.gastos_caja_chica(sucursal_id,fecha,concepto,proveedor,monto,comprobante,uuid_cfdi,foto_path,origen,pagado_por,cuenta_pl,informativo,motivo_informativo,referencia_informativa,informado_por,informado_en,respaldo_informativo,solicitud_id,solicitud_datos)
 values(v_s,v_fecha,trim(p_datos->>'concepto'),nullif(trim(p_datos->>'proveedor'),''),v_monto,(p_datos->>'comprobante')::public.tipo_comprobante,v_uuid,nullif(p_datos->>'foto_path',''),v_origen::public.origen_gasto,case when v_origen='empleado' then nullif(p_datos->>'pagado_por','')::uuid end,v_cuenta,v_info,case when v_info then trim(p_datos->>'motivo') end,case when v_info then trim(p_datos->>'referencia') end,case when v_info then auth.uid() end,case when v_info then now() end,case when v_info then p_datos->>'foto_path' end,v_solicitud,p_datos) returning id into v_id;
 return v_id;
end $$;

create function public.marcar_gasto_informativo(p_id uuid,p_motivo text,p_referencia text,p_respaldo text,p_confirmado boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare v_g public.gastos_caja_chica;v_ruta text;
begin
 if public.mi_rol() is null or public.mi_rol()::text not in ('admin','gerente') then raise exception 'Solo administración o gerencia corrige gastos.';end if;
 select * into v_g from public.gastos_caja_chica where id=p_id;
 if not found or not coalesce(public.mi_rol()::text='admin' or v_g.sucursal_id=public.mi_sucursal(),false) then raise exception 'Gasto sin acceso.';end if;
 -- Mismo orden de bloqueos que el cierre de bóveda.
 perform 1 from public.cajas where sucursal_id=v_g.sucursal_id and tipo='boveda' for update;
 select * into v_g from public.gastos_caja_chica where id=p_id for update;
 v_ruta:=coalesce(nullif(p_respaldo,''),v_g.foto_path);
 if v_g.informativo then
  if v_g.motivo_informativo is distinct from trim(p_motivo) or v_g.referencia_informativa is distinct from trim(p_referencia) then raise exception 'El gasto ya fue corregido; conserva su respaldo.';end if;
  return v_g.id;
 end if;
 if p_confirmado is distinct from true or v_g.fecha>=public.hoy_mx() or length(trim(coalesce(p_motivo,''))) not between 10 and 1000 or length(trim(coalesce(p_referencia,''))) not between 3 and 200 or v_ruta is null then raise exception 'Confirma el corte anterior y adjunta motivo, referencia y foto de respaldo.';end if;
 if v_g.repuesto_en is not null or v_g.reposicion_id is not null or (v_g.origen='caja_chica' and exists(select 1 from public.movimientos where sucursal_id=v_g.sucursal_id and tipo='reposicion_caja_chica' and estado<>'rechazado' and creado_en>=v_g.creado_en)) then raise exception 'El gasto ya tiene una reposición o reembolso; revísalo antes de reclasificar.';end if;
 update public.gastos_caja_chica set informativo=true,motivo_informativo=trim(p_motivo),referencia_informativa=trim(p_referencia),informado_por=auth.uid(),informado_en=now(),respaldo_informativo=v_ruta where id=p_id;
 return p_id;
end $$;
revoke all on function public.registrar_gasto_sucursal(jsonb),public.marcar_gasto_informativo(uuid,text,text,text,boolean) from public,anon;
grant execute on function public.registrar_gasto_sucursal(jsonb),public.marcar_gasto_informativo(uuid,text,text,text,boolean) to authenticated;

create or replace view public.saldos_cajas with(security_invoker=true) as
select c.id as caja_id,c.sucursal_id,c.tipo,c.nombre,c.saldo_inicial
 +coalesce((select sum(m.monto) from public.movimientos m where m.caja_destino_id=c.id and m.estado='confirmado' and m.tipo<>'cambio_morralla'),0)
 -coalesce((select sum(m.monto) from public.movimientos m where m.caja_origen_id=c.id and m.estado='confirmado' and m.tipo<>'cambio_morralla'),0)
 -case when c.tipo in ('caja_chica','boveda') then coalesce((select sum(g.monto) from public.gastos_caja_chica g where g.sucursal_id=c.sucursal_id and g.origen::text=c.tipo::text and not g.informativo),0) else 0 end
 -case when c.tipo='boveda' then coalesce((select sum(e.importe) from public.pagos_boveda_eventos e where e.sucursal_id=c.sucursal_id),0) else 0 end as saldo
from public.cajas c where c.tipo in ('boveda','caja_chica','cambios');
create or replace function public.proteger_reserva_gasto() returns trigger language plpgsql security definer set search_path='' as $$
declare d jsonb;
begin
 if new.informativo or new.origen<>'boveda' then return new;end if;
 perform 1 from public.cajas where sucursal_id=new.sucursal_id and tipo='boveda' for update;
 d:=public.disponibilidad_boveda(new.sucursal_id);
 if new.monto>(d->>'saldo')::numeric-(d->>'reservado')::numeric-(d->>'salidas')::numeric then raise exception 'El gasto usaría efectivo reservado.';end if;
 return new;
end $$;
create or replace function public.incluir_pagos_boveda_corte() returns trigger language plpgsql security definer set search_path='' as $$
declare desde timestamptz;hasta timestamptz;
begin
 perform 1 from public.cajas where sucursal_id=new.sucursal_id and tipo='boveda' for update;
 desde:=(new.fecha::timestamp+interval '4 hours') at time zone 'America/Mexico_City';hasta:=desde+interval '1 day';
 new.gastos_boveda_dia:=coalesce((select sum(monto) from public.gastos_caja_chica where sucursal_id=new.sucursal_id and origen='boveda' and not informativo and creado_en>=desde and creado_en<hasta),0)
 +coalesce((select sum(importe) from public.pagos_boveda_eventos where sucursal_id=new.sucursal_id and fecha_operativa=new.fecha),0);
 return new;
end $$;
commit;
