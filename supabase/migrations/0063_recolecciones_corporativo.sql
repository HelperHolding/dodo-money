begin;
set local lock_timeout='5s';
create table public.recolecciones_corporativo (
 id uuid primary key references public.movimientos(id),sucursal_id uuid not null references public.sucursales(id),desde date not null,hasta date not null check(hasta>=desde),
 expediente jsonb not null,creado_por uuid not null references public.perfiles(id),creado_en timestamptz not null default now(),contado_corporativo numeric(12,2),recibido_por uuid references public.perfiles(id),recibido_en timestamptz,nota_recepcion text
);
create table public.recoleccion_cierres (
 recoleccion_id uuid not null references public.recolecciones_corporativo(id),cierre_id uuid not null references public.cierres_dia(id),liberado_en timestamptz,primary key(recoleccion_id,cierre_id)
);
create unique index cierre_una_recoleccion on public.recoleccion_cierres(cierre_id) where liberado_en is null;
alter table public.movimientos add column recoleccion_id uuid references public.recolecciones_corporativo(id) deferrable initially deferred;
create function public.exigir_expediente_salida() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.tipo='salida_corporativo' and (new.recoleccion_id is null or new.recoleccion_id<>new.id) then raise exception 'Registra la salida desde Recolecciones con sus cierres y respaldo.';end if;
 return new;
end $$;
create trigger exigir_expediente_salida before insert on public.movimientos for each row execute function public.exigir_expediente_salida();
revoke all on function public.exigir_expediente_salida() from public,anon,authenticated;
alter table public.recolecciones_corporativo enable row level security;
alter table public.recoleccion_cierres enable row level security;
create policy recolecciones_consulta on public.recolecciones_corporativo for select using(public.ve_todas_las_sucursales() or sucursal_id=public.mi_sucursal());
create policy recoleccion_cierres_consulta on public.recoleccion_cierres for select using(exists(select 1 from public.recolecciones_corporativo r where r.id=recoleccion_id));
revoke all on public.recolecciones_corporativo,public.recoleccion_cierres from public,anon,authenticated;
grant select on public.recolecciones_corporativo,public.recoleccion_cierres to authenticated;
create function public.vista_recoleccion(p_sucursal uuid,p_desde date,p_hasta date) returns jsonb language plpgsql security definer set search_path=public as $$
declare cierres jsonb;primero public.cierres_dia;ultimo public.cierres_dia;d jsonb;pagos jsonb;historicos jsonb;maximo numeric;op date;
begin
 if not coalesce(public.mi_rol()::text in ('admin','corporativo','gerente') and (public.ve_todas_las_sucursales() or p_sucursal=public.mi_sucursal()),false) then raise exception 'Sucursal sin acceso a recolecciones.';end if;
 if p_desde is null or p_hasta is null or p_hasta<p_desde or p_hasta>public.hoy_mx() or p_hasta-p_desde>366 then raise exception 'Revisa el rango de cierres, hasta un año y sin fechas futuras.';end if;
 select * into primero from public.cierres_dia where sucursal_id=p_sucursal and fecha between p_desde and p_hasta order by fecha limit 1;
 if not found then raise exception 'No hay cierres en este rango.';end if;
 select * into ultimo from public.cierres_dia where sucursal_id=p_sucursal and fecha between p_desde and p_hasta order by fecha desc limit 1;
 if exists(select 1 from public.recoleccion_cierres rc join public.cierres_dia cd on cd.id=rc.cierre_id where cd.sucursal_id=p_sucursal and cd.fecha between p_desde and p_hasta and rc.liberado_en is null) then raise exception 'Alguno de esos cierres ya está asociado a una recolección. Revisa sus fechas.';end if;
 select jsonb_agg(to_jsonb(cd) order by cd.fecha) into cierres from public.cierres_dia cd where sucursal_id=p_sucursal and fecha between p_desde and p_hasta;
 d:=public.disponibilidad_boveda(p_sucursal);
 -- El incremento contado del periodo ya refleja pagos y salidas. No se suman stocks ni se restan gastos dos veces.
 maximo:=least((d->>'disponible')::numeric,greatest(0,ultimo.boveda_contado-primero.boveda_inicial));
 op:=((now() at time zone 'America/Mexico_City')-interval '4 hours')::date;
 select coalesce(jsonb_agg(to_jsonb(e) order by e.fecha_operativa,e.creado_en),'[]') into pagos from (
  select ev.id,ev.pago_id,ev.fecha_operativa,ev.creado_en,ev.tipo,ev.importe,'boveda'::text origen,p.referencia,p.nota_boveda,p.comprobante_ruta,p.anulado_en,
   (select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'folio',f.folio,'uuid',f.uuid,'origen',f.origen,'aplicado',pa.monto,'ordenes',(select coalesce(jsonb_agg(jsonb_build_object('id',oc.id,'folio',oc.folio)),'[]') from public.factura_ordenes fo join public.ordenes_compra oc on oc.id=fo.orden_id where fo.factura_id=f.id))),'[]') from public.pago_aplicaciones pa join public.facturas f on f.id=pa.factura_id where pa.pago_id=p.id) documentos
  from public.pagos_boveda_eventos ev join public.pagos p on p.id=ev.pago_id where ev.sucursal_id=p_sucursal and ev.fecha_operativa between p_desde and greatest(p_hasta,op)
  union all
  select ev.id,ev.pago_id,ev.fecha_operativa,ev.creado_en,ev.tipo,ev.importe,'ventas'::text,p.referencia,p.nota_boveda,p.comprobante_ruta,p.anulado_en,
   (select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'folio',f.folio,'uuid',f.uuid,'origen',f.origen,'aplicado',pa.monto,'ordenes',(select coalesce(jsonb_agg(jsonb_build_object('id',oc.id,'folio',oc.folio)),'[]') from public.factura_ordenes fo join public.ordenes_compra oc on oc.id=fo.orden_id where fo.factura_id=f.id))),'[]') from public.pago_aplicaciones pa join public.facturas f on f.id=pa.factura_id where pa.pago_id=p.id)
  from public.pagos_ventas_eventos ev join public.pagos p on p.id=ev.pago_id where ev.sucursal_id=p_sucursal and ev.fecha_operativa between p_desde and greatest(p_hasta,op)
 ) e;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'fecha',p.fecha,'monto',p.monto,'referencia',p.referencia)),'[]') into historicos from public.pagos p
 where p.origen_fondos is null and p.forma='efectivo' and p.fecha between p_desde and greatest(p_hasta,op) and p.anulado_en is null and exists(select 1 from public.pago_aplicaciones pa join public.facturas f on f.id=pa.factura_id where pa.pago_id=p.id and f.sucursal_id=p_sucursal);
 return jsonb_build_object('cierres',cierres,'disponibilidad',d,'maximo',maximo,'incremento_periodo',ultimo.boveda_contado-primero.boveda_inicial,'pagos',pagos,'historicos_por_revisar',historicos,'capturado_en',now(),'desde',p_desde,'hasta',p_hasta);
end $$;
create function public.registrar_recoleccion(p_id uuid,p_sucursal uuid,p_desde date,p_hasta date,p_monto numeric,p_folio text,p_nota text,p_historicos_revisados boolean default false) returns uuid language plpgsql security definer set search_path=public as $$
declare r public.recolecciones_corporativo;m public.movimientos;exp jsonb;origen uuid;destino uuid;
begin
 if not coalesce(public.mi_rol()::text in ('gerente','admin') and (public.mi_rol()::text='admin' or p_sucursal=public.mi_sucursal()),false) then raise exception 'Solo gerente de la sucursal o administración registra recolecciones.';end if;
 if p_id is null or p_sucursal is null or p_desde is null or p_hasta is null or p_monto is null or length(trim(coalesce(p_folio,''))) not between 3 and 100 or length(trim(coalesce(p_nota,''))) not between 5 and 1000 then raise exception 'Revisa rango, importe, folio y nota de la entrega.';end if;
 perform pg_advisory_xact_lock(hashtextextended('recoleccion:'||p_id,0));
 select * into r from public.recolecciones_corporativo where id=p_id;
 if found then
  select * into m from public.movimientos where id=r.id;
  if r.creado_por<>auth.uid() or r.sucursal_id<>p_sucursal or r.desde<>p_desde or r.hasta<>p_hasta or m.monto<>p_monto or m.folio<>trim(p_folio) or m.nota<>trim(p_nota) then raise exception 'Esta solicitud ya corresponde a otra entrega.';end if;
  return r.id;
 end if;
 select id into origen from public.cajas where sucursal_id=p_sucursal and tipo='boveda' for update;
 select id into destino from public.cajas where sucursal_id=p_sucursal and tipo='corporativo';
 if origen is null or destino is null then raise exception 'Faltan cajas de bóveda o corporativo.';end if;
 perform 1 from public.cierres_dia where sucursal_id=p_sucursal and fecha between p_desde and p_hasta order by fecha for update;
 exp:=public.vista_recoleccion(p_sucursal,p_desde,p_hasta);
 if jsonb_array_length(exp->'historicos_por_revisar')>0 and not coalesce(p_historicos_revisados,false) then raise exception 'Revisa los pagos históricos sin origen antes de preparar la entrega.';end if;
 if p_monto is null or p_monto<=0 or p_monto<>round(p_monto,2) or p_monto is distinct from (exp->>'maximo')::numeric then raise exception 'El disponible cambió o el importe no corresponde al máximo del periodo. Recarga la vista previa y cuenta el efectivo.';end if;
 insert into public.movimientos(id,recoleccion_id,sucursal_id,tipo,caja_origen_id,caja_destino_id,monto,folio,nota,registrado_por) values(p_id,p_id,p_sucursal,'salida_corporativo',origen,destino,p_monto,trim(p_folio),trim(p_nota),auth.uid());
 insert into public.recolecciones_corporativo(id,sucursal_id,desde,hasta,expediente,creado_por) values(p_id,p_sucursal,p_desde,p_hasta,exp,auth.uid());
 insert into public.recoleccion_cierres(recoleccion_id,cierre_id) select p_id,(c.valor->>'id')::uuid from jsonb_array_elements(exp->'cierres') as c(valor);
 return p_id;
end $$;
create function public.liberar_cierres_rechazados() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.estado='rechazado' and old.estado='pendiente' then update public.recoleccion_cierres set liberado_en=now() where recoleccion_id=new.id and liberado_en is null;end if;
 return new;
end $$;
create trigger recoleccion_rechazada after update of estado on public.movimientos for each row execute function public.liberar_cierres_rechazados();
create function public.recibir_recoleccion(p_id uuid,p_contado numeric,p_nota text) returns void language plpgsql security definer set search_path=public as $$
declare r public.recolecciones_corporativo;m public.movimientos;
begin
 if public.mi_rol()::text is distinct from 'corporativo' then raise exception 'Solo corporativo recibe la entrega.';end if;
 select * into m from public.movimientos where id=p_id for update;
 select * into r from public.recolecciones_corporativo where id=p_id for update;
 if not found then raise exception 'Recolección no encontrada.';end if;
 if r.recibido_en is not null then
  if r.recibido_por=auth.uid() and r.contado_corporativo=p_contado and coalesce(r.nota_recepcion,'')=trim(coalesce(p_nota,'')) then return;end if;
  raise exception 'Esta recolección ya se recibió.';
 end if;
 if p_contado is null or p_contado<0 or p_contado>=1e10 or p_contado<>round(p_contado,2) or length(coalesce(p_nota,''))>1000 or (p_contado<>m.monto and length(trim(coalesce(p_nota,'')))<5) then raise exception 'Revisa el efectivo contado y explica cualquier diferencia.';end if;
 update public.recolecciones_corporativo set contado_corporativo=p_contado,recibido_por=auth.uid(),recibido_en=now(),nota_recepcion=trim(coalesce(p_nota,'')) where id=p_id;
 perform public.recibir_en_corporativo(p_id,p_contado=m.monto,p_nota);
end $$;
create function public.exigir_conteo_recoleccion() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.recepcion is not null and exists(select 1 from public.recolecciones_corporativo where id=new.id and contado_corporativo is null) then raise exception 'Recibe esta entrega desde su expediente de recolección, con el conteo real.';end if;
 return new;
end $$;
create trigger exigir_conteo_recoleccion before update of recepcion on public.movimientos for each row execute function public.exigir_conteo_recoleccion();
revoke all on function public.exigir_conteo_recoleccion() from public,anon,authenticated;
revoke all on function public.liberar_cierres_rechazados() from public,anon,authenticated;
revoke all on function public.vista_recoleccion(uuid,date,date),public.registrar_recoleccion(uuid,uuid,date,date,numeric,text,text,boolean),public.recibir_recoleccion(uuid,numeric,text) from public,anon;
grant execute on function public.vista_recoleccion(uuid,date,date),public.registrar_recoleccion(uuid,uuid,date,date,numeric,text,text,boolean),public.recibir_recoleccion(uuid,numeric,text) to authenticated;
commit;
